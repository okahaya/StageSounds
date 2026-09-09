/** 波形表示用のピーク解像度(バケット数)。表示幅とは独立の固定値で、キャッシュ・永続化・エクスポートに共通利用する。 */
export const PEAK_RESOLUTION = 600;

/**
 * AudioBuffer の全チャンネルから、固定解像度の min/max ピーク列を計算する。
 * デコード直後に一度だけ実行し、結果をキャッシュ・永続化して使い回すことを想定している
 * (フェードイン/アウトは再生時の GainNode 操作であり、バッファ自体の波形は変化しないため)。
 */
export function computePeaks(buffer: AudioBuffer, resolution: number = PEAK_RESOLUTION): Float32Array {
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const samplesPerBucket = Math.max(1, Math.floor(length / resolution));
  const peaks = new Float32Array(resolution * 2);

  for (let x = 0; x < resolution; x++) {
    const start = x * samplesPerBucket;
    const end = Math.min(start + samplesPerBucket, length);
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

/** manifest.json (JSON) に埋め込むためのプレーン配列への変換。 */
export function peaksToJson(peaks: Float32Array): number[] {
  return Array.from(peaks);
}

export function peaksFromJson(values: number[]): Float32Array {
  return Float32Array.from(values);
}
