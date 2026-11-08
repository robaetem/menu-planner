import type { UIMessage } from "ai";

// Chat photos live in IndexedDB (localStorage is too small), keyed by user, message and part index.
// The saved chat in localStorage keeps only an "idb:<key>" pointer in the file part.
const DB = "menu-chat-images";
const STORE = "images";
const PREFIX = "idb:";

type Part = UIMessage["parts"][number];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

const keyOf = (userId: string, messageId: string, i: number) => `${userId}:${messageId}:${i}`;

/** Save the photos of these messages; returns messages whose photos are idb pointers. */
export async function saveImages(userId: string, messages: UIMessage[]): Promise<UIMessage[]> {
  const out: UIMessage[] = [];
  for (const m of messages) {
    if (!m.parts.some((p) => p.type === "file")) {
      out.push(m);
      continue;
    }
    const parts: Part[] = [];
    for (let i = 0; i < m.parts.length; i++) {
      const p = m.parts[i];
      if (p.type !== "file" || !p.url) {
        parts.push(p);
        continue;
      }
      if (p.url.startsWith(PREFIX)) {
        parts.push(p);
        continue;
      }
      const key = keyOf(userId, m.id, i);
      try {
        await run("readwrite", (s) => s.put(p.url, key));
        parts.push({ ...p, url: PREFIX + key });
      } catch {
        parts.push({ type: "text", text: "[foto]" });
      }
    }
    out.push({ ...m, parts });
  }
  return out;
}

/** Replace idb pointers by the stored data URL (or a "[foto]" text when it is gone). */
export async function loadImages(messages: UIMessage[]): Promise<UIMessage[]> {
  const out: UIMessage[] = [];
  for (const m of messages) {
    const parts: Part[] = [];
    for (const p of m.parts) {
      if (p.type === "file" && p.url?.startsWith(PREFIX)) {
        try {
          const url = await run<string | undefined>("readonly", (s) => s.get(p.url.slice(PREFIX.length)));
          parts.push(url ? { ...p, url } : { type: "text", text: "[foto]" });
        } catch {
          parts.push({ type: "text", text: "[foto]" });
        }
      } else parts.push(p);
    }
    out.push({ ...m, parts });
  }
  return out;
}

/** Delete every stored photo of this user (new chat). */
export async function clearImages(userId: string): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(IDBKeyRange.bound(`${userId}:`, `${userId}:￿`)));
  } catch {
    /* no IndexedDB: nothing stored */
  }
}
