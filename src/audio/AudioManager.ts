import type { KeyCode, PlaybackState } from "../types";

export interface PlaybackOptions {
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
}

export interface AudioManagerEventMap {
  statechange: CustomEvent<{ slotKey: KeyCode | null; state: PlaybackState }>;
}

/** 極短時間のリニアフェード。ハードストップ時のクリックノイズ(プチッ音)を避けるための下限値。 */
const DECLICK_SECONDS = 0.015;
/** gain の指数ランプは 0 を許容しないため、実質無音とみなす下限値。 */
const MIN_GAIN = 0.0001;

interface ActivePlayback {
  slotKey: KeyCode;
  source: AudioBufferSourceNode;
  gain: GainNode;
  fadeOut: number;
  /** 手動 stop() 済みで onended による二重クリアを無視すべきか */
  stopping: boolean;
}

/**
 * Web Audio API を用いた単一再生（排他制御）のオーディオエンジン。
 * 音声はあらかじめ AudioBuffer にデコードしてメモリ保持し、trigger 時のレイテンシを最小化する。
 * 常に高々ひとつの再生系統(ActivePlayback)しか保持しない = 同時再生をハード制約として防止する。
 */
export class AudioManager extends EventTarget {
  private ctx: AudioContext;
  private active: ActivePlayback | null = null;

  constructor() {
    super();
    this.ctx = new AudioContext({ latencyHint: "interactive" });
  }

  get audioContext(): AudioContext {
    return this.ctx;
  }

  /** ブラウザの自動再生ポリシー対策。ユーザー操作イベント内で呼ぶこと。 */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
  }

  async decode(data: ArrayBuffer): Promise<AudioBuffer> {
    // decodeAudioData は渡した ArrayBuffer を detach/消費することがあるため複製する。
    return this.ctx.decodeAudioData(data.slice(0));
  }

  get currentSlotKey(): KeyCode | null {
    return this.active?.slotKey ?? null;
  }

  /**
   * キー入力によるトリガー。
   * - 何も再生していない場合: 再生開始。
   * - 同じスロットが再生中の場合: トグルとして停止(フェードアウト設定を適用)。
   * - 別のスロットが再生中の場合: 直前の音声を素早く止めてから新しい音声を再生開始(排他制御)。
   */
  trigger(slotKey: KeyCode, buffer: AudioBuffer, options: PlaybackOptions): void {
    if (this.active && this.active.slotKey === slotKey) {
      this.stopActive(this.active, options.fadeOut);
      return;
    }
    if (this.active) {
      this.stopActive(this.active, 0);
    }
    this.startPlayback(slotKey, buffer, options);
  }

  /** 現在のスロットのみを対象に、外部(タイルのクリック等)から明示的に停止する。 */
  stopSlot(slotKey: KeyCode, fadeOut: number): void {
    if (this.active && this.active.slotKey === slotKey) {
      this.stopActive(this.active, fadeOut);
    }
  }

  /** 緊急停止(PANIC STOP)。フェードを待たず即座に無音化する安全弁。 */
  panicStop(): void {
    if (!this.active) return;
    const playback = this.active;
    this.active = null;
    this.hardSilence(playback);
    this.emitState(playback.slotKey, "idle");
  }

  private startPlayback(slotKey: KeyCode, buffer: AudioBuffer, options: PlaybackOptions): void {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop;

    const gain = this.ctx.createGain();
    source.connect(gain).connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    if (options.fadeIn > 0) {
      gain.gain.setValueAtTime(MIN_GAIN, now);
      gain.gain.linearRampToValueAtTime(1, now + options.fadeIn);
    } else {
      gain.gain.setValueAtTime(1, now);
    }

    const playback: ActivePlayback = { slotKey, source, gain, fadeOut: options.fadeOut, stopping: false };

    source.onended = () => {
      if (this.active === playback) {
        this.active = null;
        this.emitState(slotKey, "idle");
      }
    };

    source.start(now);
    this.active = playback;
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
        this.emitState(slotKey, "idle");
      };
    } else {
      this.hardSilence(playback);
      this.emitState(slotKey, "idle");
    }
  }

  private hardSilence(playback: ActivePlayback): void {
    const now = this.ctx.currentTime;
    const { gain, source } = playback;
    try {
      const currentValue = Math.max(gain.gain.value, MIN_GAIN);
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(currentValue, now);
      gain.gain.linearRampToValueAtTime(MIN_GAIN, now + DECLICK_SECONDS);
      source.stop(now + DECLICK_SECONDS + 0.01);
    } catch {
      /* すでに停止済み、または開始前 */
    }
    source.onended = null;
  }

  /** 再生状態変化を購読する。戻り値を呼ぶと購読解除される。 */
  onStateChange(listener: (detail: AudioManagerEventMap["statechange"]["detail"]) => void): () => void {
    const handler = (e: Event) => listener((e as AudioManagerEventMap["statechange"]).detail);
    super.addEventListener("statechange", handler);
    return () => super.removeEventListener("statechange", handler);
  }

  private emitState(slotKey: KeyCode | null, state: PlaybackState): void {
    this.dispatchEvent(
      new CustomEvent("statechange", { detail: { slotKey, state } }) satisfies AudioManagerEventMap["statechange"],
    );
  }
}
