import { BaseDirectory, exists, mkdir, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";

/**
 * Tauri(デスクトップ版)専用の音源保存バックエンド。
 * IndexedDB のストレージ容量上限を回避するため、OSのAppDataディレクトリ配下に
 * `audio/<groupId>/<sha256(fileName)>` として音源Blobを直接保存する。
 * 団体プロファイル(JSON)は容量問題の対象外のため、引き続き IndexedDB 側で管理する。
 *
 * ファイル名をハッシュ化するのは、日本語の長いファイル名を encodeURIComponent すると
 * Windows のパス長上限(260文字)や macOS のファイル名長上限(255バイト)を超えて保存に失敗するため、
 * また Windows で大文字小文字違いのファイル名が衝突するのを防ぐため。
 * 旧バージョンで保存した `encodeURIComponent(fileName)` 形式のファイルも読めるようにしてある。
 */

const base = { baseDir: BaseDirectory.AppData };

function groupDir(groupId: string): string {
  return `audio/${groupId}`;
}

async function hashedPath(groupId: string, fileName: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fileName));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${groupDir(groupId)}/${hex}`;
}

function legacyPath(groupId: string, fileName: string): string {
  return `${groupDir(groupId)}/${encodeURIComponent(fileName)}`;
}

async function existsSafe(path: string): Promise<boolean> {
  try {
    return await exists(path, base);
  } catch {
    // 旧形式のパスが長すぎる場合など、exists 自体が失敗することがある。
    return false;
  }
}

export async function saveAudioFileFs(groupId: string, fileName: string, blob: Blob): Promise<void> {
  await mkdir(groupDir(groupId), { ...base, recursive: true });
  const data = new Uint8Array(await blob.arrayBuffer());
  await writeFile(await hashedPath(groupId, fileName), data, base);
}

export async function loadAudioFileFs(groupId: string, fileName: string): Promise<Blob | undefined> {
  for (const path of [await hashedPath(groupId, fileName), legacyPath(groupId, fileName)]) {
    if (await existsSafe(path)) {
      const data = await readFile(path, base);
      return new Blob([data]);
    }
  }
  return undefined;
}

export async function deleteAudioFileFs(groupId: string, fileName: string): Promise<void> {
  for (const path of [await hashedPath(groupId, fileName), legacyPath(groupId, fileName)]) {
    if (await existsSafe(path)) {
      await remove(path, base);
    }
  }
}

export async function deleteGroupAudioFilesFs(groupId: string): Promise<void> {
  const dir = groupDir(groupId);
  if (await existsSafe(dir)) {
    await remove(dir, { ...base, recursive: true });
  }
}
