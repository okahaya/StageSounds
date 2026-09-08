import { useEffect, useRef, useState } from "react";
import { AudioWaveform } from "lucide-react";
import type { AudioManager } from "../audio/AudioManager";
import type { KeyCode, PlaybackState } from "../types";

interface WaveformDisplayProps {
  audioManager: AudioManager;
  slotKey: KeyCode | null;
  buffer: AudioBuffer | null;
  label: string;
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

/** buffer の波形を、キャンバス幅ぶんのピーク(min/max)列に間引く。 */
function computePeaks(buffer: AudioBuffer, width: number): Float32Array {
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const samplesPerPixel = Math.max(1, Math.floor(length / width));
  const peaks = new Float32Array(width * 2);

  for (let x = 0; x < width; x++) {
    const start = x * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, length);
    let min = 0;
    let max = 0;
    for (let ch = 0; ch < channelCount; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = start; i < end; i++) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    peaks[x * 2] = min;
    peaks[x * 2 + 1] = max;
  }
  return peaks;
}

export function WaveformDisplay({ audioManager, slotKey, buffer, label, playbackState }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const isPlaying = playbackState === "playing" || playbackState === "fading-out";

  // 波形の描画(バッファまたはキャンバスサイズが変わった時のみ)
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

      if (!buffer) return;

      const mid = height / 2;
      const peaks = computePeaks(buffer, Math.max(1, Math.floor(width)));
      ctx.fillStyle = WAVEFORM_COLOR;
      for (let x = 0; x < peaks.length / 2; x++) {
        const min = peaks[x * 2];
        const max = peaks[x * 2 + 1];
        const y1 = mid + min * mid;
        const y2 = mid + max * mid;
        ctx.fillRect(x, Math.min(y1, y2), 1, Math.max(1, Math.abs(y2 - y1)));
      }
    }

    draw();
    const resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [buffer]);

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

  const duration = buffer?.duration ?? 0;
  const progressRatio = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  return (
    <div className="border-t border-stage-border bg-stage-surface2 px-4 py-2">
      <div className="mb-1 flex items-center justify-between font-mono text-[11px] uppercase tracking-wide text-stage-muted">
        <span className="flex items-center gap-1.5 truncate">
          <AudioWaveform size={12} />
          {buffer ? label : "波形表示"}
        </span>
        <span className="tabular-nums text-white">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
      <div ref={containerRef} className="relative h-16 w-full overflow-hidden rounded-sm border border-stage-border bg-stage-bg">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {buffer && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px"
            style={{ left: `${progressRatio * 100}%`, backgroundColor: PLAYHEAD_COLOR }}
          />
        )}
        {!buffer && (
          <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-stage-muted">
            音源を再生すると波形が表示されます
          </div>
        )}
      </div>
    </div>
  );
}
