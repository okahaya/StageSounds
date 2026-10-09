import type { KeyCode, PlaybackState } from "../types";

export interface PlaybackOptions {
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
}

export interface AudioManagerEventMap {
  statechange: CustomEvent<{ slotKey: KeyCode | null; state: PlaybackState }>;
  contextstatechange: CustomEvent<{ state: AudioContextState | "interrupted" }>;
}

/** 極短時間のリニアフェード。ハードストップ時のクリックノイズ(プチッ音)を避けるための下限値。 */
const DECLICK_SECONDS = 0.015;
/** gain の指数ランプは 0 を許容しないため、実質無音とみなす下限値。 */
const MIN_GAIN = 0.0001;
/** フェード秒数の上限。壊れた設定値(NaN/負数/巨大値)で Web Audio が例外を投げるのを防ぐ。 */
const MAX_FADE_SECONDS = 30;
/** resume() が応答しない場合(出力デバイス消失など)に、待たずに先へ進むまでの時間。 */
const RESUME_TIMEOUT_MS = 300;

interface ActivePlayback {
  slotKey: KeyCode;
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** 手動 stop() 済みで onended による二重クリアを無視すべきか */
  stopping: boolean;
  /** 再生位置 0 秒に相当する AudioContext.currentTime。経過時間の算出に使う(途中再開時は過去に遡った値)。 */
  startTime: number;
  options: PlaybackOptions;
}

/** 一時停止中の再生情報。再開時はこの位置から新しい source を作って鳴らし直す。 */
interface PausedPlayback {
  slotKey: KeyCode;
  buffer: AudioBuffer;
  options: PlaybackOptions;
  /** 一時停止した時点の再生位置(秒) */
  offset: number;
}

function sanitizeFade(seconds: number): number {
  return Number.isFinite(seconds) ? Math.min(Math.max(seconds, 0), MAX_FADE_SECONDS) : 0;
}

/**
 * Web Audio API を用いた単一再生（排他制御）のオーディオエンジン。
 * 音声はあらかじめ AudioBuffer にデコードしてメモリ保持し、trigger 時のレイテンシを最小化する。
 * 「主」となる再生系統(active)は常に高々ひとつ。フェードアウト中の系統は sounding に残り、
 * PANIC STOP ではそれらも含めて鳴っている音をすべて即座に止める。
 *
 * アプリ全体でただ1つのインスタンス(audioManager)を共有する。React の再マウントや
 * エラー画面からでも同じ音を止められるようにするため、また AudioContext の多重生成
 * (=音声スレッドの多重起動・リソースリーク)を防ぐため。
 */
export class AudioManager extends EventTarget {
  private ctx: AudioContext;
  private active: ActivePlayback | null = null;
  /** フェードアウト中を含め、現在音を出している可能性のある全系統。 */
  private sounding = new Set<ActivePlayback>();
  private paused: PausedPlayback | null = null;

  constructor() {
    super();
    this.ctx = this.createContext();
  }

  private createContext(): AudioContext {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    ctx.addEventListener("statechange", () => {
      if (ctx === this.ctx) this.emitContextState();
    });
    return ctx;
  }

  get audioContext(): AudioContext {
    return this.ctx;
  }

  /** AudioContext の状態。Safari は非標準の "interrupted" を返すことがある。 */
  get contextState(): AudioContextState | "interrupted" {
    return this.ctx.state as AudioContextState | "interrupted";
  }

  /** ブラウザの自動再生ポリシー対策。ユーザー操作イベント内で呼ぶこと。応答しない場合も一定時間で戻る。 */
  async resume(): Promise<void> {
    if (this.ctx.state === "running") return;
    await Promise.race([
      this.ctx.resume().catch((err) => console.warn("AudioContext.resume 失敗", err)),
      new Promise<void>((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS)),
    ]);
  }

  /**
   * オーディオ出力の作り直し。出力デバイスの抜き差し・スリープ復帰などで AudioContext が
   * 復帰しなくなった場合の最終手段。デコード済み AudioBuffer は別の AudioContext でも
   * そのまま再利用できるため、音源の再読み込みは不要。
   */
  async restartContext(): Promise<void> {
    this.panicStop();
    const old = this.ctx;
    this.ctx = this.createContext();
    void old.close().catch(() => {});
    await this.resume();
    this.emitContextState();
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    // decodeAudioData は渡した ArrayBuffer を detach/消費することがあるため複製する。
    return this.ctx.decodeAudioData(data.slice(0));
  }

  get currentSlotKey(): KeyCode | null {
    return this.active?.slotKey ?? null;
  }

  /** 指定スロットが再生中・一時停止中の場合、その再生位置(秒)を返す。どちらでもなければ null。 */
  getPlaybackTime(slotKey: KeyCode): number | null {
    if (this.paused && this.paused.slotKey === slotKey) return this.paused.offset;
    if (!this.active || this.active.slotKey !== slotKey) return null;
    const { source, startTime } = this.active;
    const buffer = source.buffer;
    if (!buffer || buffer.duration <= 0) return 0;
    const elapsed = this.ctx.currentTime - startTime;
    return source.loop ? elapsed % buffer.duration : Math.min(elapsed, buffer.duration);
  }

  /**
   * キー入力によるトリガー。
   * - 何も再生していない場合: 再生開始。
   * - 同じスロットが再生中の場合: トグルとして停止(フェードアウト設定を適用)。
   * - 別のスロットが再生中の場合: 直前の音声を素早く止めてから新しい音声を再生開始(排他制御)。
   * - 一時停止中の場合: 一時停止は破棄し、押されたスロットを先頭から再生開始。
   */
  trigger(slotKey: KeyCode, buffer: AudioBuffer, options: PlaybackOptions): void {
    this.clearPaused();
    if (this.active && this.active.slotKey === slotKey) {
      this.stopActive(this.active, sanitizeFade(options.fadeOut));
      return;
    }
    if (this.active) {
      this.stopActive(this.active, 0);
    }
    this.startPlayback(slotKey, buffer, options);
  }

  /**
   * 一時停止/再開のトグル。
   * - 再生中: その位置で一時停止(クリック防止の極短フェードのみ)。
   * - 一時停止中: 一時停止した位置から再開。
   * - フェードアウト中・停止中: 何もしない。
   */
  togglePause(): void {
    if (this.paused) {
      const { slotKey, buffer, options, offset } = this.paused;
      this.paused = null;
      this.startPlayback(slotKey, buffer, options, offset);
      return;
    }
    if (!this.active) return;
    const playback = this.active;
    const buffer = playback.source.buffer;
    if (!buffer) return;
    const offset = this.getPlaybackTime(playback.slotKey) ?? 0;
    this.active = null;
    this.sounding.delete(playback);
    this.hardSilence(playback);
    this.paused = { slotKey: playback.slotKey, buffer, options: playback.options, offset };
    this.emitState(playback.slotKey, "paused");
  }

  /** 現在のスロットのみを対象に、外部(タイルのクリック等)から明示的に停止する。 */
  stopSlot(slotKey: KeyCode, fadeOut: number): void {
    if (this.paused && this.paused.slotKey === slotKey) {
      this.clearPaused();
    }
    if (this.active && this.active.slotKey === slotKey) {
      this.stopActive(this.active, sanitizeFade(fadeOut));
    }
  }

  /** 緊急停止(PANIC STOP)。フェードアウト中のものも含め、鳴っている音をすべて即座に無音化する安全弁。一時停止中の音源も破棄する。 */
  panicStop(): void {
    this.clearPaused();
    const playbacks = Array.from(this.sounding);
    const activeKey = this.active?.slotKey ?? null;
    this.active = null;
    this.sounding.clear();
    for (const playback of playbacks) {
      this.hardSilence(playback);
    }
    const keys = new Set(playbacks.map((p) => p.slotKey));
    if (activeKey) keys.add(activeKey);
    for (const key of keys) this.emitState(key, "idle");
  }

  private clearPaused(): void {
    if (!this.paused) return;
    const { slotKey } = this.paused;
    this.paused = null;
    this.emitState(slotKey, "idle");
  }

  /** offset > 0 の場合は一時停止からの再開とみなし、フェードインはクリック防止の極短フェードのみにする。 */
  private startPlayback(slotKey: KeyCode, buffer: AudioBuffer, options: PlaybackOptions, offset = 0): void {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop;

    const gain = this.ctx.createGain();
    source.connect(gain).connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    const fadeIn = offset > 0 ? DECLICK_SECONDS : sanitizeFade(options.fadeIn);
    if (fadeIn > 0) {
      gain.gain.setValueAtTime(MIN_GAIN, now);
      gain.gain.linearRampToValueAtTime(1, now + fadeIn);
    } else {
      gain.gain.setValueAtTime(1, now);
    }

    const playback: ActivePlayback = {
      slotKey,
      source,
      gain,
      stopping: false,
      startTime: now - offset,
      options,
    };

    source.onended = () => {
      this.sounding.delete(playback);
      if (this.active === playback) {
        this.active = null;
        this.emitState(slotKey, "idle");
      }
    };

    source.start(now, offset);
    this.active = playback;
    this.sounding.add(playback);
    this.emitState(slotKey, "playing");
  }

  private stopActive(playback: ActivePlayback, fadeOut: number): void {
    if (playback.stopping) return;
    playback.stopping = true;
    this.active = null;

    const now = this.ctx.currentTime;
    const { gain, source, slotKey } = playback;

    if (fadeOut > 0) {
      this.emitState(slotKey, "fading-out");
      const currentValue = Math.max(gain.gain.value, MIN_GAIN);
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(currentValue, now);
      gain.gain.linearRampToValueAtTime(MIN_GAIN, now + fadeOut);
      try {
        source.stop(now + fadeOut + 0.02);
      } catch {
        /* すでに停止済み */
      }
      source.onended = () => {
        this.sounding.delete(playback);
        // フェードアウト中に同じスロットが再トリガーされた場合、UI を idle に戻してはいけない。
        if (this.active?.slotKey !== slotKey) this.emitState(slotKey, "idle");
      };
    } else {
      this.sounding.delete(playback);
      this.hardSilence(playback);
      this.emitState(slotKey, "idle");
    }
  }

  private hardSilence(playback: ActivePlayback): void {
    const now = this.ctx.currentTime;
    const { gain, source } = playback;
    source.onended = null;
    try {
      const currentValue = Math.max(gain.gain.value, MIN_GAIN);
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(currentValue, now);
      gain.gain.linearRampToValueAtTime(MIN_GAIN, now + DECLICK_SECONDS);
      source.stop(now + DECLICK_SECONDS + 0.01);
    } catch {
      /* すでに停止済み、または開始前 */
    }
    // AudioContext が停止状態などでスケジュールが効かない場合に備え、少し後に接続自体を切る。
    setTimeout(() => {
      try {
        gain.disconnect();
      } catch {
        /* 切断済み */
      }
    }, (DECLICK_SECONDS + 0.05) * 1000);
  }

  /** 再生状態変化を購読する。戻り値を呼ぶと購読解除される。 */
  onStateChange(listener: (detail: AudioManagerEventMap["statechange"]["detail"]) => void): () => void {
    const handler = (e: Event) => listener((e as AudioManagerEventMap["statechange"]).detail);
    super.addEventListener("statechange", handler);
    return () => super.removeEventListener("statechange", handler);
  }

  /** AudioContext の状態変化(suspended / running / interrupted 等)を購読する。 */
  onContextStateChange(listener: (state: AudioContextState | "interrupted") => void): () => void {
    const handler = (e: Event) => listener((e as AudioManagerEventMap["contextstatechange"]).detail.state);
    super.addEventListener("contextstatechange", handler);
    return () => super.removeEventListener("contextstatechange", handler);
  }

  private emitContextState(): void {
    this.dispatchEvent(new CustomEvent("contextstatechange", { detail: { state: this.contextState } }));
  }

  private emitState(slotKey: KeyCode | null, state: PlaybackState): void {
    this.dispatchEvent(
      new CustomEvent("statechange", { detail: { slotKey, state } }) satisfies AudioManagerEventMap["statechange"],
    );
  }
}

/** アプリ全体で共有する唯一のオーディオエンジン。 */
export const audioManager = new AudioManager();
