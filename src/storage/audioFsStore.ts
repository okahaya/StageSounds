import { BaseDirectory, exists, mkdir, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";

/**
 * Tauri(デスクトップ版)専用の音源保存バックエンド。
 * IndexedDB のストレージ容量上限を回避するため、OSのAppDataディレクトリ配下に
 * `audio/<groupId>/<encodeURIComponent(fileName)>` として音源Blobを直接保存する。
 * 団体プロファイル(JSON)は容量問題の対象外のため、引き続き IndexedDB 側で管理する。
 */

function groupDir(groupId: string): string {
  return `audio/${groupId}`;
}

function filePath(groupId: string, fileName: string): string {
  return `${groupDir(groupId)}/${encodeURIComponent(fileName)}`;
}

export async function saveAudioFileFs(groupId: string, fileName: string, blob: Blob): Promise<void> {
  await mkdir(groupDir(groupId), { baseDir: BaseDirectory.AppData, recursive: true });
  const data = new Uint8Array(await blob.arrayBuffer());
  await writeFile(filePath(groupId, fileName), data, { baseDir: BaseDirectory.AppData });
}

export async function loadAudioFileFs(groupId: string, fileName: string): Promise<Blob | undefined> {
  const path = filePath(groupId, fileName);
  if (!(await exists(path, { baseDir: BaseDirectory.AppData }))) return undefined;
  const data = await readFile(path, { baseDir: BaseDirectory.AppData });
  return new Blob([data]);
}

export async function deleteAudioFileFs(groupId: string, fileName: string): Promise<void> {
  const path = filePath(groupId, fileName);
  if (await exists(path, { baseDir: BaseDirectory.AppData })) {
    await remove(path, { baseDir: BaseDirectory.AppData });
  }
}

export async function deleteGroupAudioFilesFs(groupId: string): Promise<void> {
  const dir = groupDir(groupId);
  if (await exists(dir, { baseDir: BaseDirectory.AppData })) {
    await remove(dir, { baseDir: BaseDirectory.AppData, recursive: true });
  }
}
