import JSZip from "jszip";
import { peaksFromJson, peaksToJson } from "../audio/waveformPeaks";
import { createDefaultSlots } from "../utils/keys";
import type { GroupProfile, ManifestV1, SlotConfig } from "../types";

const MANIFEST_FILENAME = "manifest.json";
const AUDIO_DIR = "audio";
const MAX_FADE_SECONDS = 5;
const MAX_LABEL_LENGTH = 100;

function sanitizeFade(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_FADE_SECONDS) : 0;
}

/** ディレクトリ区切りや制御文字を含む不正なファイル名を拒否する(パス・トラバーサル対策)。 */
function sanitizeFileName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > 255 || /[\\/\u0000-\u001f]/.test(name) || name === "." || name === "..") return null;
  return name;
}

/**
 * manifest 内のスロット定義を検証・正規化する。壊れた値や手で編集された manifest でも、
 * 再生時に例外(NaN のフェード秒数など)が出ないことを保証し、既定のキー配列に揃える。
 */
function sanitizeSlots(raw: unknown[]): SlotConfig[] {
  const byKey = new Map<string, SlotConfig>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.key !== "string") continue;
    byKey.set(s.key, {
      key: s.key,
      label: typeof s.label === "string" ? s.label.slice(0, MAX_LABEL_LENGTH) : "未設定",
      fileName: sanitizeFileName(s.fileName),
      fadeIn: sanitizeFade(s.fadeIn),
      fadeOut: sanitizeFade(s.fadeOut),
      loop: s.loop === true,
    });
  }
  return createDefaultSlots().map((d) => byKey.get(d.key) ?? d);
}

export interface ImportedGroup {
  profile: GroupProfile;
  /** ファイル名 -> 実体音声データ。呼び出し側で IndexedDB 保存 & AudioBuffer デコードを行う。 */
  audioBlobs: Map<string, Blob>;
  /** ファイル名 -> 波形ピーク配列。manifest に含まれていた場合のみ。呼び出し側でキャッシュ・永続化する。 */
  waveforms: Map<string, Float32Array>;
  /** manifest で参照されているがアーカイブ内に実体が無かった音源ファイル名。 */
  missingFiles: string[];
}

/**
 * 団体プリセットの ZIP (.stagepack) 入出力を担うサービス。
 * アーカイブ内は manifest.json + audio/ の相対参照のみで完結させ、
 * 別PC・別OSに展開してもファイルパス不一致が起きないようにする。
 */
export class PresetStorageService {
  async exportGroup(
    group: GroupProfile,
    resolveAudioBlob: (fileName: string) => Promise<Blob | undefined>,
    resolveWaveformPeaks?: (fileName: string) => Promise<Float32Array | undefined>,
  ): Promise<Blob> {
    const zip = new JSZip();

    const waveforms: Record<string, number[]> = {};
    const audioFolder = zip.folder(AUDIO_DIR)!;
    const seenFiles = new Set<string>();
    for (const slot of group.slots) {
      if (!slot.fileName || seenFiles.has(slot.fileName)) continue;
      seenFiles.add(slot.fileName);
      const blob = await resolveAudioBlob(slot.fileName);
      if (blob) {
        // 音源は既に圧縮済み形式が多く、再圧縮は時間がかかる割に縮まない。
        // 大きな団体の書き出しで画面が固まらないよう無圧縮で格納する。
        audioFolder.file(slot.fileName, blob, { compression: "STORE" });
      }
      const peaks = await resolveWaveformPeaks?.(slot.fileName);
      if (peaks) {
        waveforms[slot.fileName] = peaksToJson(peaks);
      }
    }

    const manifest: ManifestV1 = {
      version: "1.0",
      groupName: group.groupName,
      updatedAt: new Date().toISOString(),
      slots: group.slots.map((s) => ({
        key: s.key,
        label: s.label,
        fileName: s.fileName,
        fadeIn: s.fadeIn,
        fadeOut: s.fadeOut,
        loop: s.loop,
      })),
      waveforms,
    };
    zip.file(MANIFEST_FILENAME, JSON.stringify(manifest, null, 2));

    return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  triggerDownload(blob: Blob, groupName: string): void {
    const safeName = groupName.trim().replace(/[\\/:*?"<>|]/g, "_") || "group";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}_preset.stagepack`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async importGroup(file: File | Blob, newId: string): Promise<ImportedGroup> {
    const zip = await JSZip.loadAsync(file);
    const manifestEntry = zip.file(MANIFEST_FILENAME);
    if (!manifestEntry) {
      throw new Error("manifest.json が見つかりません。有効な .stagepack / .zip ファイルではありません。");
    }
    const manifestText = await manifestEntry.async("string");
    let manifest: ManifestV1;
    try {
      manifest = JSON.parse(manifestText) as ManifestV1;
    } catch {
      throw new Error("manifest.json が壊れています（JSONとして読めません）。");
    }

    if (!manifest || !manifest.version || !Array.isArray(manifest.slots)) {
      throw new Error("manifest.json の形式が不正です。");
    }

    const slots = sanitizeSlots(manifest.slots);
    const audioBlobs = new Map<string, Blob>();
    const waveforms = new Map<string, Float32Array>();
    const missingFiles: string[] = [];
    for (const slot of slots) {
      if (!slot.fileName || audioBlobs.has(slot.fileName)) continue;
      const entry = zip.file(`${AUDIO_DIR}/${slot.fileName}`);
      if (entry) {
        const blob = await entry.async("blob");
        audioBlobs.set(slot.fileName, blob);
      } else {
        missingFiles.push(slot.fileName);
      }
      const peaks = manifest.waveforms?.[slot.fileName];
      if (Array.isArray(peaks) && peaks.length >= 2 && peaks.every((v) => typeof v === "number")) {
        waveforms.set(slot.fileName, peaksFromJson(peaks));
      }
    }

    const profile: GroupProfile = {
      id: newId,
      groupName: (typeof manifest.groupName === "string" && manifest.groupName.slice(0, MAX_LABEL_LENGTH)) || "無題の団体",
      updatedAt: typeof manifest.updatedAt === "string" ? manifest.updatedAt : new Date().toISOString(),
      slots,
    };

    return { profile, audioBlobs, waveforms, missingFiles };
  }
}

export const presetStorageService = new PresetStorageService();
