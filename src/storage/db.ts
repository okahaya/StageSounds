import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { isTauri } from "@tauri-apps/api/core";
import { BaseDirectory, exists, mkdir, readFile, remove, writeFile } from "@tauri-apps/plugin-fs";
import type { GroupProfile } from "../types";

interface StageSoundsDB extends DBSchema {
  groups: {
    key: string;
    value: GroupProfile;
  };
  audioFiles: {
    key: string; // `${groupId}/${fileName}`
    value: Blob;
  };
  meta: {
    key: string;
    value: string;
  };
}

const DB_NAME = "stagesounds";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<StageSoundsDB>> | null = null;

function getDb(): Promise<IDBPDatabase<StageSoundsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<StageSoundsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("groups")) {
          db.createObjectStore("groups", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("audioFiles")) {
          db.createObjectStore("audioFiles");
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
      },
    });
  }
  return dbPromise;
}

export function audioFileKey(groupId: string, fileName: string): string {
  return `${groupId}/${fileName}`;
}

/**
 * デスクトップ版(Tauri)での音声実体の保存先。IndexedDB はブラウザごとの容量上限が
 * 厳しいため、Tauri 実行時は OS のアプリデータ領域にファイルとして直接保存する。
 */
const AUDIO_BASE_DIR = BaseDirectory.AppData;

// パストラバーサル対策: fileName はインポートした .stagepack の manifest.json に
// 由来し得るため、区切り文字を含んでいても常に単一のファイル名として扱う。
function sanitizeFileNameSegment(name: string): string {
  const cleaned = name.replace(/[\\/]/g, "_");
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "_" : cleaned;
}

function audioDirPath(groupId: string): string {
  return `audio/${groupId}`;
}

function audioFilePath(groupId: string, fileName: string): string {
  return `${audioDirPath(groupId)}/${sanitizeFileNameSegment(fileName)}`;
}

export async function saveGroup(group: GroupProfile): Promise<void> {
  const db = await getDb();
  await db.put("groups", group);
}

export async function deleteGroup(groupId: string): Promise<void> {
  const db = await getDb();
  await db.delete("groups", groupId);

  if (isTauri()) {
    const dir = audioDirPath(groupId);
    if (await exists(dir, { baseDir: AUDIO_BASE_DIR })) {
      await remove(dir, { baseDir: AUDIO_BASE_DIR, recursive: true });
    }
    return;
  }

  const tx = db.transaction("audioFiles", "readwrite");
  const keys = await tx.store.getAllKeys();
  const prefix = `${groupId}/`;
  await Promise.all(
    keys.filter((k) => k.startsWith(prefix)).map((k) => tx.store.delete(k)),
  );
  await tx.done;
}

export async function loadAllGroups(): Promise<GroupProfile[]> {
  const db = await getDb();
  return db.getAll("groups");
}

export async function saveAudioFile(groupId: string, fileName: string, blob: Blob): Promise<void> {
  if (isTauri()) {
    await mkdir(audioDirPath(groupId), { baseDir: AUDIO_BASE_DIR, recursive: true });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await writeFile(audioFilePath(groupId, fileName), bytes, { baseDir: AUDIO_BASE_DIR });
    return;
  }
  const db = await getDb();
  await db.put("audioFiles", blob, audioFileKey(groupId, fileName));
}

export async function loadAudioFile(groupId: string, fileName: string): Promise<Blob | undefined> {
  if (isTauri()) {
    const path = audioFilePath(groupId, fileName);
    if (!(await exists(path, { baseDir: AUDIO_BASE_DIR }))) return undefined;
    const bytes = await readFile(path, { baseDir: AUDIO_BASE_DIR });
    return new Blob([bytes]);
  }
  const db = await getDb();
  return db.get("audioFiles", audioFileKey(groupId, fileName));
}

export async function deleteAudioFile(groupId: string, fileName: string): Promise<void> {
  if (isTauri()) {
    const path = audioFilePath(groupId, fileName);
    if (await exists(path, { baseDir: AUDIO_BASE_DIR })) {
      await remove(path, { baseDir: AUDIO_BASE_DIR });
    }
    return;
  }
  const db = await getDb();
  await db.delete("audioFiles", audioFileKey(groupId, fileName));
}

export async function getLastActiveGroupId(): Promise<string | undefined> {
  const db = await getDb();
  return db.get("meta", "lastActiveGroupId");
}

export async function setLastActiveGroupId(groupId: string): Promise<void> {
  const db = await getDb();
  await db.put("meta", groupId, "lastActiveGroupId");
}
