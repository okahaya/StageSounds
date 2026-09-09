/** 波形表示用のピーク解像度(バケット数)。表示幅とは独立の固定値で、キャッシュ・永続化・エクスポートに共通利用する。 */
export const PEAK_RESOLUTION = 600;

/** 1チャンクあたりの処理時間の目安(ms)。この時間を超えたら一度メインスレッドに制御を返す。 */
const CHUNK_BUDGET_MS = 8;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * AudioBuffer の全チャンネルから、固定解像度の min/max ピーク列を計算する。
 * デコード直後に一度だけ実行し、結果をキャッシュ・永続化して使い回すことを想定している
 * (フェードイン/アウトは再生時の GainNode 操作であり、バッファ自体の波形は変化しないため)。
 *
 * 長尺の音源では全サンプル走査に時間がかかるため、一定時間(CHUNK_BUDGET_MS)ごとに
 * メインスレッドへ制御を返しながら分割実行する。これにより、キャッシュ未生成の状態で
 * 誤って再生・計算が走った場合でも、緊急停止やキー入力などの操作がブロックされ続けることを防ぐ
 * (ステージ本番中に操作不能になることは許容できないため)。
 */
export async function computePeaksAsync(buffer: AudioBuffer, resolution: number = PEAK_RESOLUTION): Promise<Float32Array> {
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const samplesPerBucket = Math.max(1, Math.floor(length / resolution));
  const peaks = new Float32Array(resolution * 2);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < channelCount; ch++) channels.push(buffer.getChannelData(ch));

  let x = 0;
  while (x < resolution) {
    const chunkStart = performance.now();
    while (x < resolution && performance.now() - chunkStart < CHUNK_BUDGET_MS) {
      const start = x * samplesPerBucket;
      const end = Math.min(start + samplesPerBucket, length);
      let min = 0;
      let max = 0;
      for (let ch = 0; ch < channelCount; ch++) {
        const data = channels[ch];
        for (let i = start; i < end; i++) {
          const v = data[i];
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      peaks[x * 2] = min;
      peaks[x * 2 + 1] = max;
      x++;
    }
    if (x < resolution) await yieldToEventLoop();
  }
  return peaks;
}

/** manifest.json (JSON) に埋め込むためのプレーン配列への変換。 */
export function peaksToJson(peaks: Float32Array): number[] {
  return Array.from(peaks);
}

export function peaksFromJson(values: number[]): Float32Array {
  return Float32Array.from(values);
}
