import JSZip from "jszip";
import type { GroupProfile, ManifestV1, SlotConfig } from "../types";

const MANIFEST_FILENAME = "manifest.json";
const AUDIO_DIR = "audio";

export interface ImportedGroup {
  profile: GroupProfile;
  /** ファイル名 -> 実体音声データ。呼び出し側で IndexedDB 保存 & AudioBuffer デコードを行う。 */
  audioBlobs: Map<string, Blob>;
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
  ): Promise<Blob> {
    const zip = new JSZip();

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
    };
    zip.file(MANIFEST_FILENAME, JSON.stringify(manifest, null, 2));

    const audioFolder = zip.folder(AUDIO_DIR)!;
    const seenFiles = new Set<string>();
    for (const slot of group.slots) {
      if (!slot.fileName || seenFiles.has(slot.fileName)) continue;
      seenFiles.add(slot.fileName);
      const blob = await resolveAudioBlob(slot.fileName);
      if (blob) {
        audioFolder.file(slot.fileName, blob);
      }
    }

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
    const manifest = JSON.parse(manifestText) as ManifestV1;

    if (!manifest.version || !Array.isArray(manifest.slots)) {
      throw new Error("manifest.json の形式が不正です。");
    }

    const audioBlobs = new Map<string, Blob>();
    for (const slot of manifest.slots) {
      if (!slot.fileName) continue;
      const entry = zip.file(`${AUDIO_DIR}/${slot.fileName}`);
      if (entry) {
        const blob = await entry.async("blob");
        audioBlobs.set(slot.fileName, blob);
      }
    }

    const slots: SlotConfig[] = manifest.slots.map((s) => ({
      key: s.key,
      label: s.label,
      fileName: s.fileName,
      fadeIn: s.fadeIn ?? 0,
      fadeOut: s.fadeOut ?? 0,
      loop: s.loop ?? false,
    }));

    const profile: GroupProfile = {
      id: newId,
      groupName: manifest.groupName || "無題の団体",
      updatedAt: manifest.updatedAt || new Date().toISOString(),
      slots,
    };

    return { profile, audioBlobs };
  }
}

export const presetStorageService = new PresetStorageService();
