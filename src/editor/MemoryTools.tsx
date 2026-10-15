import { useEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Brain, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { api, json } from '../lib/api';
import { extractAnchors, type RichNode } from '../shared/document';
import { priorityLabels, type MemoryPassage, type Priority } from '../shared/learning';
import { createPassage, modifyPassage, selectPassage } from './memory-commands';
import type { SaveState } from './useAutosave';
export function MemoryTools({
  editor,
  documentId,
  ownerId,
  status,
  flush,
  hasLocal,
}: {
  editor: Editor;
  documentId: string;
  ownerId: string;
  status: SaveState;
  flush: () => Promise<void>;
  hasLocal: () => boolean;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{ id: string | null; doc: typeof editor.state.doc } | null>(
    null,
  );
  const [hint, setHint] = useState(''),
    [priority, setPriority] = useState<Priority>('medium');
  const live = useEditorState({
    editor,
    selector: ({ editor }) => ({
      empty: editor.state.selection.empty,
      anchors: extractAnchors(editor.getJSON() as RichNode),
    }),
  });
  const remote = useQuery({
    queryKey: ['anchors', ownerId, documentId],
    queryFn: () => api<MemoryPassage[]>(`/documents/${documentId}/anchors`),
  });
  useEffect(() => {
    if (status === 'saved') void remote.refetch();
  }, [status]);
  const open = useRef<() => void>(() => {});
  open.current = () => {
    setError('');
    setHint('');
    setPriority('medium');
    setModal({ id: null, doc: editor.state.doc });
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        open.current();
      }
    };
    editor.view.dom.addEventListener('keydown', handler);
    return () => editor.view.dom.removeEventListener('keydown', handler);
  }, [editor]);
  async function saved() {
    await flush();
    if (hasLocal())
      throw new Error(
        'Attendez la synchronisation ou résolvez le conflit de sauvegarde avant de réviser.',
      );
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(p: MemoryPassage, resetSchedule: boolean) {
    await saved();
    await api(`/anchors/${p.id}/confirm`, {
      method: 'POST',
      body: json({ revision: p.revision, resetSchedule }),
    });
    await remote.refetch();
  }
  const present = new Set(live.anchors.map((a) => a.id));
  return (
    <section className="memory-tools" aria-label="Textes à trous">
      <div
        className="memory-actions"
        role="toolbar"
        aria-label="Outils contextuels de mémorisation"
      >
        {!live.empty && (
          <button
            className="button primary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => open.current()}
          >
            <Plus size={16} />
            Créer un texte à trous
          </button>
        )}
        <button
          className="button subtle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <Brain size={16} />
          Passages mémorisés ({live.anchors.length})
        </button>
        <button
          className="button subtle"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await saved();
              navigate(`/study/free/${documentId}`);
            })
          }
        >
          <BookOpen size={16} />
          Révision libre
        </button>
        <button
          className="button subtle"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await saved();
              navigate(`/study?document=${documentId}`);
            })
          }
        >
          Révision programmée
        </button>
      </div>
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {expanded && (
        <div className="memory-list">
          {!live.anchors.length && (
            <p>
              Sélectionnez du texte puis choisissez « Créer un texte à trous ». Raccourci : Ctrl/Cmd
              + Maj + M.
            </p>
          )}
          {live.anchors.map((a, index) => {
            const p = remote.data?.find((p) => p.id === a.id);
            return (
              <article className="memory-row" key={a.id}>
                <button
                  className="text-button passage-label"
                  onClick={() => selectPassage(editor, a.id)}
                >
                  Passage {index + 1} : {a.quote.slice(0, 120)}
                </button>
                <label>
                  Priorité
                  <select
                    aria-label={`Priorité du passage ${index + 1}`}
                    value={a.priority ?? p?.priority ?? 'medium'}
                    onChange={(e) =>
                      modifyPassage(editor, a.id, {
                        hint: a.hint ?? p?.hint ?? '',
                        priority: e.target.value as Priority,
                      })
                    }
                  >
                    {Object.entries(priorityLabels).map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button subtle"
                  onClick={() => {
                    setHint(a.hint ?? p?.hint ?? '');
                    setPriority(a.priority ?? p?.priority ?? 'medium');
                    setModal({ id: a.id, doc: editor.state.doc });
                  }}
                >
                  Modifier l’indice
                </button>
                <button
                  className="icon-button"
                  aria-label={`Supprimer l’annotation du passage ${index + 1}`}
                  onClick={() => modifyPassage(editor, a.id, null)}
                >
                  <Trash2 size={16} />
                </button>
                {p?.status === 'needs_review' && (
                  <div className="passage-warning">
                    <p>
                      La réponse a changé. Ce passage est suspendu du calendrier jusqu’à votre
                      validation.
                    </p>
                    <button
                      className="button subtle"
                      disabled={busy}
                      onClick={() => void run(() => confirm(p, false))}
                    >
                      Valider et conserver le calendrier
                    </button>
                    <button
                      className="button subtle"
                      disabled={busy}
                      onClick={() => void run(() => confirm(p, true))}
                    >
                      Valider et recommencer l’apprentissage
                    </button>
                  </div>
                )}
              </article>
            );
          })}
          {remote.data?.some((p) => p.status === 'deleted' && !present.has(p.id)) && (
            <p className="muted">
              Les passages supprimés sont exclus des révisions. Restaurer une version contenant
              leurs annotations permet de les retrouver.
            </p>
          )}
        </div>
      )}
      {modal && (
        <Modal
          title={modal.id ? 'Modifier le passage' : 'Créer un texte à trous'}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                if (!editor.state.doc.eq(modal.doc))
                  throw new Error(
                    'Le document a changé. Rouvrez cette action avec une sélection actuelle.',
                  );
                if (modal.id) modifyPassage(editor, modal.id, { hint, priority });
                else createPassage(editor, hint, priority);
                setExpanded(true);
                setModal(null);
              } catch (e) {
                setError((e as Error).message);
                setModal(null);
              }
            }}
          >
            <p>Le texte et sa mise en forme restent dans votre document.</p>
            <label>
              Indice facultatif
              <textarea maxLength={1000} value={hint} onChange={(e) => setHint(e.target.value)} />
            </label>
            <label>
              Priorité
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {Object.entries(priorityLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" type="submit">
              {modal.id ? 'Enregistrer l’indice' : 'Créer le passage'}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
