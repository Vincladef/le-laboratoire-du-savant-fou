import { openDB } from 'idb';
import type { RichNode, PageLayout } from '../shared/document';
export type Draft = {
  key: string;
  ownerId: string;
  documentId: string;
  baseRevision: number;
  title: string;
  content: RichNode;
  layout: PageLayout;
  updatedAt: number;
  generation: number;
};
let connection: ReturnType<typeof openDB> | undefined;
const db = () =>
  (connection ??= openDB('laboratoire-recovery', 1, {
    upgrade(db) {
      db.createObjectStore('drafts', { keyPath: 'key' });
    },
  }));
const prefix = 'lab-recovery:';
// A fresh page instance gets its own key, even when the browser duplicates a tab's sessionStorage.
export const tabId = () => crypto.randomUUID();
export async function storeDraft(draft: Draft) {
  // Synchronous emergency copy protects the last keystrokes during tab termination.
  let emergency = false;
  try {
    localStorage.setItem(prefix + draft.key, JSON.stringify(draft));
    emergency = true;
  } catch {
    /* IndexedDB may still be available. */
  }
  try {
    await (await db()).put('drafts', draft);
  } catch (error) {
    if (!emergency) throw error;
  }
}
export async function removeDraft(key: string, generation?: number) {
  const existing = localStorage.getItem(prefix + key);
  if (existing && (generation === undefined || JSON.parse(existing).generation <= generation))
    localStorage.removeItem(prefix + key);
  const database = await db();
  const tx = database.transaction('drafts', 'readwrite');
  const draft = await tx.store.get(key);
  if (draft && (generation === undefined || draft.generation <= generation))
    await tx.store.delete(key);
  await tx.done;
}
export async function getDrafts(ownerId: string, documentId: string): Promise<Draft[]> {
  const all = new Map<string, Draft>();
  try {
    for (const draft of await (await db()).getAll('drafts'))
      if (draft.ownerId === ownerId && draft.documentId === documentId) all.set(draft.key, draft);
  } catch {
    /* Emergency copies are independent. */
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith(prefix))
      try {
        const draft = JSON.parse(localStorage.getItem(key)!);
        if (
          draft.ownerId === ownerId &&
          draft.documentId === documentId &&
          (!all.has(draft.key) || all.get(draft.key)!.updatedAt < draft.updatedAt)
        )
          all.set(draft.key, draft);
      } catch {
        /* Unrelated damaged copy. */
      }
  }
  return [...all.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
