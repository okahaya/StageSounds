import { useEffect, useRef, useState } from "react";
import { AudioWaveform, TriangleAlert } from "lucide-react";
import type { AudioManager } from "../audio/AudioManager";
import type { KeyCode, PlaybackState } from "../types";

/**
 * "idle": まだ何も再生されていない(初期状態)
 * "computing": 波形ピークを計算中(バックグラウンド。再生自体は待たない)
 * "ready": 波形を表示できる
 * "failed": 計算がエラーまたはタイムアウトで失敗した(音声再生には影響しない)
 */
export type WaveformStatus = "idle" | "computing" | "ready" | "failed";

interface WaveformDisplayProps {
  audioManager: AudioManager;
  slotKey: KeyCode | null;
  peaks: Float32Array | null;
  duration: number;
  label: string;
  status: WaveformStatus;
  playbackState: PlaybackState;
}

const WAVEFORM_COLOR = "#4b5563";
const PLAYHEAD_COLOR = "#00e676";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** 事前計算済みのピーク列(固定解像度)を、キャンバス幅ぶんに間引いて描画する。生PCMは走査しない。 */
function drawPeaks(ctx: CanvasRenderingContext2D, peaks: Float32Array, width: number, height: number): void {
  const resolution = peaks.length / 2;
  const mid = height / 2;
  ctx.fillStyle = WAVEFORM_COLOR;
  for (let x = 0; x < width; x++) {
    const bucket = Math.min(resolution - 1, Math.floor((x / width) * resolution));
    const min = peaks[bucket * 2];
    const max = peaks[bucket * 2 + 1];
    const y1 = mid + min * mid;
    const y2 = mid + max * mid;
    ctx.fillRect(x, Math.min(y1, y2), 1, Math.max(1, Math.abs(y2 - y1)));
  }
}

export function WaveformDisplay({ audioManager, slotKey, peaks, duration, label, status, playbackState }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const isPlaying = playbackState === "playing" || playbackState === "fading-out";
  const hasWaveform = status === "ready" && !!peaks && peaks.length >= 2;

  // 波形の描画(ピーク列またはキャンバスサイズが変わった時のみ)。
  // ピークは読み込み時に一度だけ計算済みのものを使い回すため、ここでは間引き描画のみ行う(軽量)。
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    function draw() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      if (!hasWaveform || !peaks) return;
      drawPeaks(ctx, peaks, Math.max(1, Math.floor(width)), height);
    }

    draw();
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [peaks, hasWaveform]);

  // 再生ヘッド(現在位置)の更新
  useEffect(() => {
    if (!isPlaying || !slotKey) {
      setCurrentTime(0);
      return;
    }
    let raf: number;
    const tick = () => {
      const t = audioManager.getPlaybackTime(slotKey);
      setCurrentTime(t ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [audioManager, slotKey, isPlaying]);

  const progressRatio = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  let placeholderText = "音源を再生すると波形が表示されます";
  if (status === "computing") placeholderText = "波形を準備しています…(再生には影響ありません)";
  if (status === "failed") placeholderText = "波形の表示に失敗しました(再生には影響ありません)";

  return (
    <div className="border-t border-stage-border bg-stage-surface2 px-4 py-2">
      <div className="mb-1 flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-stage-muted">
        <span className="flex items-center gap-1.5 truncate">
          {status === "failed" ? <TriangleAlert size={12} className="text-stage-fading" /> : <AudioWaveform size={12} />}
          {hasWaveform ? label : "波形表示"}
        </span>
        <span className="tabular-nums text-white">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div ref={containerRef} className="relative h-16 w-full overflow-hidden rounded-sm border border-stage-border bg-stage-bg">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {hasWaveform && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px"
            style={{ left: `${progressRatio * 100}%`, backgroundColor: PLAYHEAD_COLOR }}
          />
        )}
        {!hasWaveform && (
          <div
            className={`absolute inset-0 flex items-center justify-center gap-1.5 font-mono text-[11px] ${
              status === "failed" ? "text-stage-fading" : "text-stage-muted"
            }`}
          >
            {status === "failed" && <TriangleAlert size={12} />}
            {placeholderText}
          </div>
        )}
      </div>
    </div>
  );
}
