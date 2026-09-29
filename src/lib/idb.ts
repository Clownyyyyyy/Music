/** Minimal promise-based IndexedDB wrapper (no external deps). */

const DB_NAME = "bw-music";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
        if (!db.objectStoreNames.contains("audioCache")) db.createObjectStore("audioCache");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("kv", "readonly");
      const req = tx.objectStore("kv").get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* storage unavailable */
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* noop */
  }
}

/** Cache a full audio blob for offline playback (download setting). */
export async function cacheAudio(url: string, blob: Blob): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("audioCache", "readwrite");
    tx.objectStore("audioCache").put(blob, url);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedAudio(url: string): Promise<Blob | undefined> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("audioCache", "readonly");
      const req = tx.objectStore("audioCache").get(url);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function clearAudioCache(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("audioCache", "readwrite");
      tx.objectStore("audioCache").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* noop */
  }
}

export async function listCachedAudio(): Promise<string[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("audioCache", "readonly");
      const req = tx.objectStore("audioCache").getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}
