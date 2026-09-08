import { isTauri } from "@tauri-apps/api/core";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { deleteAudioFileFs, deleteGroupAudioFilesFs, loadAudioFileFs, saveAudioFileFs } from "./audioFsStore";
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
  waveforms: {
    key: string; // `${groupId}/${fileName}`
    value: Float32Array;
  };
}

const DB_NAME = "stagesounds";
const DB_VERSION = 2;

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
        if (!db.objectStoreNames.contains("waveforms")) {
          db.createObjectStore("waveforms");
        }
      },
    });
  }
  return dbPromise;
}

export function audioFileKey(groupId: string, fileName: string): string {
  return `${groupId}/${fileName}`;
}

export async function saveGroup(group: GroupProfile): Promise<void> {
  const db = await getDb();
  await db.put("groups", group);
}

async function deleteGroupWaveforms(db: IDBPDatabase<StageSoundsDB>, groupId: string): Promise<void> {
  const tx = db.transaction("waveforms", "readwrite");
  const keys = await tx.store.getAllKeys();
  const prefix = `${groupId}/`;
  await Promise.all(keys.filter((k) => k.startsWith(prefix)).map((k) => tx.store.delete(k)));
  await tx.done;
}

export async function deleteGroup(groupId: string): Promise<void> {
  const db = await getDb();
  await db.delete("groups", groupId);
  await deleteGroupWaveforms(db, groupId);
  if (isTauri()) {
    await deleteGroupAudioFilesFs(groupId);
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
    return saveAudioFileFs(groupId, fileName, blob);
  }
  const db = await getDb();
  await db.put("audioFiles", blob, audioFileKey(groupId, fileName));
}

export async function loadAudioFile(groupId: string, fileName: string): Promise<Blob | undefined> {
  if (isTauri()) {
    return loadAudioFileFs(groupId, fileName);
  }
  const db = await getDb();
  return db.get("audioFiles", audioFileKey(groupId, fileName));
}

export async function deleteAudioFile(groupId: string, fileName: string): Promise<void> {
  if (isTauri()) {
    await deleteAudioFileFs(groupId, fileName);
  } else {
    const db = await getDb();
    await db.delete("audioFiles", audioFileKey(groupId, fileName));
  }
  await deleteWaveformPeaks(groupId, fileName);
}

/** 音源1件分のピーク配列を保存する。Tauri/Web を問わず常に IndexedDB に保存する(サイズが小さいため)。 */
export async function saveWaveformPeaks(groupId: string, fileName: string, peaks: Float32Array): Promise<void> {
  const db = await getDb();
  await db.put("waveforms", peaks, audioFileKey(groupId, fileName));
}

export async function loadWaveformPeaks(groupId: string, fileName: string): Promise<Float32Array | undefined> {
  const db = await getDb();
  return db.get("waveforms", audioFileKey(groupId, fileName));
}

export async function deleteWaveformPeaks(groupId: string, fileName: string): Promise<void> {
  const db = await getDb();
  await db.delete("waveforms", audioFileKey(groupId, fileName));
}

export async function getLastActiveGroupId(): Promise<string | undefined> {
  const db = await getDb();
  return db.get("meta", "lastActiveGroupId");
}

export async function setLastActiveGroupId(groupId: string): Promise<void> {
  const db = await getDb();
  await db.put("meta", groupId, "lastActiveGroupId");
}
