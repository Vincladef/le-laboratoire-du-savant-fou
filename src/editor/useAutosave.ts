import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, json } from '../lib/api';
import { getDrafts, storeDraft, removeDraft, tabId, type Draft } from '../lib/drafts';
import {
  copyWithNewAnchors,
  type DocumentRecord,
  type RichNode,
  type PageLayout,
} from '../shared/document';
export type SaveState = 'saved' | 'local' | 'saving' | 'offline' | 'conflict' | 'error';
export type Snapshot = { title: string; content: RichNode; layout: PageLayout };
export function useAutosave(document: DocumentRecord, ownerId: string) {
  const [status, setStatus] = useState<SaveState>('saved');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<DocumentRecord | null>(null);
  const [recovery, setRecovery] = useState<Draft[]>([]);
  const baseRevision = useRef(document.revision);
  const generation = useRef(0);
  const latest = useRef<Draft | null>(null);
  const busy = useRef(false);
  const blocked = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = useRef(`${ownerId}/${document.id}/${tabId()}`);
  const mounted = useRef(true);
  const localWrites = useRef(Promise.resolve());
  const localFailure = useRef(false);
  const persist = useCallback((draft: Draft) => {
    const task = storeDraft(draft); // Executes the emergency copy synchronously before its first await.
    localWrites.current = task
      .then(() => {
        localFailure.current = false;
      })
      .catch(() => {
        localFailure.current = true;
        setError(
          'Le navigateur ne peut pas conserver la copie locale. Exportez votre document avant de fermer.',
        );
        setStatus('error');
      });
    return task;
  }, []);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const flush = useCallback(async () => {
    if (busy.current || blocked.current || !latest.current) return;
    busy.current = true;
    const sent = { ...latest.current, baseRevision: baseRevision.current };
    setStatus('saving');
    try {
      const saved = await api<DocumentRecord>(`/documents/${document.id}`, {
        method: 'PUT',
        body: json({
          revision: sent.baseRevision,
          title: sent.title,
          content: sent.content,
          layout: sent.layout,
        }),
      });
      baseRevision.current = saved.revision;
      await localWrites.current;
      if (latest.current?.generation === sent.generation) {
        latest.current = null;
        await removeDraft(sent.key, sent.generation);
        if (mounted.current && !latest.current) {
          setStatus('saved');
          setError('');
        }
      } else if (latest.current) {
        latest.current = { ...latest.current, baseRevision: saved.revision };
        await persist(latest.current);
        setStatus('local');
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data.current) {
        blocked.current = true;
        setConflict(e.data.current);
        setStatus('conflict');
      } else {
        const offline = !(e instanceof ApiError);
        setStatus(offline && !localFailure.current ? 'offline' : 'error');
        setError(
          localFailure.current
            ? 'La sauvegarde distante et la copie locale ont échoué. Exportez immédiatement votre document.'
            : offline
              ? 'Connexion interrompue. Votre copie est conservée sur cet appareil.'
              : (e as Error).message,
        );
      }
    } finally {
      busy.current = false;
      if (latest.current && !blocked.current && mounted.current)
        timer.current = setTimeout(() => void flushRef.current(), 5000);
    }
  }, [document.id, persist]);
  flushRef.current = flush;
  const change = useCallback(
    (snapshot: Snapshot) => {
      const draft: Draft = {
        ...snapshot,
        key: key.current,
        ownerId,
        documentId: document.id,
        baseRevision: baseRevision.current,
        generation: ++generation.current,
        updatedAt: Date.now(),
      };
      latest.current = draft;
      void persist(draft).catch(() => {});
      if (!blocked.current) setStatus('local');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flushRef.current(), 900);
    },
    [document.id, ownerId, persist],
  );
  useEffect(() => {
    mounted.current = true;
    void getDrafts(ownerId, document.id).then((drafts) => {
      if (mounted.current)
        setRecovery(
          drafts.filter(
            (d) =>
              d.title !== document.title ||
              JSON.stringify(d.content) !== JSON.stringify(document.content) ||
              JSON.stringify(d.layout) !== JSON.stringify(document.layout),
          ),
        );
    });
    const online = () => void flushRef.current();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (latest.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [ownerId, document.id]);
  return {
    status,
    error,
    conflict,
    recovery,
    change,
    flush,
    baseRevision,
    async recover(draft: Draft) {
      blocked.current = draft.baseRevision !== baseRevision.current;
      if (blocked.current) {
        setConflict(document);
        setStatus('conflict');
      }
      change(draft);
      setRecovery([]);
      await localWrites.current;
      if (draft.key !== key.current && !localFailure.current) await removeDraft(draft.key);
    },
    async discardRecovery(draft: Draft) {
      await removeDraft(draft.key);
      setRecovery((r) => r.filter((d) => d.key !== draft.key));
    },
    async acceptRemote() {
      if (!conflict) return;
      const remote = conflict;
      await localWrites.current;
      await removeDraft(key.current);
      latest.current = null;
      baseRevision.current = remote.revision;
      blocked.current = false;
      setConflict(null);
      setStatus('saved');
      setError('');
      return remote;
    },
    async replaceRemote() {
      if (!conflict || conflict.deletedAt) return;
      baseRevision.current = conflict.revision;
      blocked.current = false;
      setConflict(null);
      await flush();
    },
    async copyLocal() {
      if (!latest.current) return;
      const draft = latest.current;
      return api<DocumentRecord>('/documents', {
        method: 'POST',
        body: json({
          title: `${draft.title.slice(0, 170)} — copie récupérée`,
          content: copyWithNewAnchors(draft.content),
          layout: draft.layout,
        }),
      });
    },
    getLocal: () => latest.current,
  };
}
