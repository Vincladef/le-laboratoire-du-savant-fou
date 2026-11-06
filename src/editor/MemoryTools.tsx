import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Brain, Plus, Trash2, X, Sparkles } from 'lucide-react';
import { api, json } from '../lib/api';
import { extractAnchors, type RichNode } from '../shared/document';
import {
  priorityLabels,
  difficultyLabels,
  type Difficulty,
  type MemoryPassage,
  type Priority,
} from '../shared/learning';
import { createPassage, modifyPassage, selectPassage } from './memory-commands';
import type { SaveState } from './useAutosave';

export function MemoryTools({
  editor,
  documentId,
  ownerId,
  status,
  flush,
  hasLocal,
  onAI,
  children,
}: {
  editor: Editor;
  documentId: string;
  ownerId: string;
  status: SaveState;
  flush: () => Promise<void>;
  hasLocal: () => boolean;
  onAI: () => void;
  children: (parts: { actions: ReactNode; reviews: ReactNode; panel: ReactNode }) => ReactNode;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [hint, setHint] = useState(''),
    [priority, setPriority] = useState<Priority>('medium'),
    [difficulty, setDifficulty] = useState<Difficulty>('unrated');
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const popover = useRef<HTMLDivElement>(null);
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
  function openPassage(id: string) {
    const a = live.anchors.find((a) => a.id === id),
      p = remote.data?.find((p) => p.id === id);
    if (!a) return;
    setError('');
    setHint(a.hint ?? p?.hint ?? '');
    setPriority(a.priority ?? p?.priority ?? 'medium');
    setDifficulty(p?.difficulty ?? a.initialDifficulty ?? 'unrated');
    setActive(id);
  }
  function create() {
    setError('');
    try {
      const to = editor.state.selection.to;
      createPassage(editor, '', 'medium', 'unrated');
      editor.chain().focus().setTextSelection(to).unsetMark('memoryAnchor').run();
      setActive(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const callbacks = useRef({ create, openPassage });
  callbacks.current = { create, openPassage };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        callbacks.current.create();
      }
      if (e.altKey && e.key === 'Enter') {
        const mark = editor.state.selection.$from
          .marks()
          .find((m) => m.type.name === 'memoryAnchor');
        if (mark) {
          e.preventDefault();
          callbacks.current.openPassage(mark.attrs.id);
        }
      }
    };
    const click = (e: MouseEvent) => {
      const span = (e.target as Element).closest('[data-memory-id]');
      if (span) callbacks.current.openPassage(span.getAttribute('data-memory-id')!);
    };
    const dom = editor.view.dom;
    dom.addEventListener('keydown', handler);
    dom.addEventListener('click', click);
    return () => {
      dom.removeEventListener('keydown', handler);
      dom.removeEventListener('click', click);
    };
  }, [editor]);
  useEffect(() => {
    if (!active) return;
    function place() {
      const span = Array.from(editor.view.dom.querySelectorAll('[data-memory-id]')).find(
        (el) => el.getAttribute('data-memory-id') === active,
      );
      if (!span) {
        setActive(null);
        return;
      }
      const rect = span.getBoundingClientRect();
      const height = popover.current?.offsetHeight || 360;
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - 336)),
        top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - height - 12)),
      });
    }
    const outside = (e: PointerEvent) => {
      if (!busy && !popover.current?.contains(e.target as Node)) setActive(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.stopPropagation();
        setActive(null);
        editor.commands.focus();
      }
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.document.addEventListener('pointerdown', outside);
    window.document.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      window.document.removeEventListener('pointerdown', outside);
      window.document.removeEventListener('keydown', key);
    };
  }, [active, editor, busy]);
  async function saved() {
    await flush();
    if (hasLocal())
      throw new Error(
        'Attendez la synchronisation ou résolvez le conflit de sauvegarde avant de continuer.',
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
  async function setPassageDifficulty(id: string, value: Difficulty, previous?: MemoryPassage) {
    await saved();
    const p =
      previous ||
      (await api<MemoryPassage[]>(`/documents/${documentId}/anchors`)).find((p) => p.id === id);
    if (!p) throw new Error('Le passage n’est pas encore synchronisé. Réessayez.');
    if (p.difficulty !== value)
      await api(`/anchors/${id}/difficulty`, {
        method: 'PATCH',
        body: json({ difficulty: value, difficultyRevision: p.difficultyRevision }),
      });
    await remote.refetch();
  }
  const panel = expanded ? (
    <div className="memory-list">
      {!live.anchors.length && (
        <p>
          Sélectionnez du texte puis « Texte à trous ». Ctrl/Cmd + Maj + M crée immédiatement le
          passage. Cliquez ensuite dessus pour le régler.
        </p>
      )}
      {live.anchors.map((a, index) => {
        const p = remote.data?.find((p) => p.id === a.id);
        return (
          <article className="memory-row" key={a.id}>
            <button
              className="text-button passage-label"
              onClick={() => {
                selectPassage(editor, a.id);
                openPassage(a.id);
              }}
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
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Difficulté
              <select
                aria-label={`Difficulté du passage ${index + 1}`}
                value={p?.difficulty ?? a.initialDifficulty ?? 'unrated'}
                disabled={busy}
                onChange={(e) =>
                  void run(() => setPassageDifficulty(a.id, e.target.value as Difficulty, p))
                }
              >
                {Object.entries(difficultyLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button className="button subtle" onClick={() => openPassage(a.id)}>
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
                <p>Le texte a changé. Vérifiez ce passage avant de le masquer à nouveau.</p>
                <button
                  className="button subtle"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await saved();
                      await api(`/anchors/${p.id}/confirm`, {
                        method: 'POST',
                        body: json({ revision: p.revision }),
                      });
                      await remote.refetch();
                    })
                  }
                >
                  Valider le passage
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  ) : null;
  return (
    <>
      {children({
        actions: (
          <div
            className="memory-actions"
            role="toolbar"
            aria-label="Outils contextuels de mémorisation"
          >
            <button
              className="button primary create-cloze"
              aria-label="Créer un texte à trous"
              title="Créer un texte à trous (Ctrl/Cmd+Maj+M)"
              onMouseDown={(e) => e.preventDefault()}
              disabled={live.empty}
              onClick={create}
            >
              <Plus size={16} />
              <span>Texte à trous</span>
            </button>
            <button
              className="button subtle ai-trigger"
              aria-label="Ouvrir l’assistant IA"
              title="Assistant IA"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onAI}
            >
              <Sparkles size={15} />
              <span>Assistant</span>
            </button>
            <button
              className="button subtle"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              <Brain size={16} />
              Passages ({live.anchors.length})
            </button>
          </div>
        ),
        reviews: (
          <button
            className="button primary review-document-button"
            aria-label="Réviser ce document"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await saved();
                navigate(`/study/${documentId}`);
              })
            }
          >
            <BookOpen size={16} />
            Réviser
          </button>
        ),
        panel,
      })}
      {error && (
        <p role="alert" className="alert error">
          {error}
        </p>
      )}
      {!live.empty && !active && (
        <div className="selection-float">
          <button onMouseDown={(e) => e.preventDefault()} onClick={create}>
            <Plus size={16} />
            Texte à trous
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={onAI}>
            <Sparkles size={15} />
            Avec l’IA
          </button>
        </div>
      )}
      {active && (
        <div
          ref={popover}
          className="passage-popover"
          role="region"
          aria-label="Réglages du passage"
          style={position}
        >
          <div className="context-heading">
            <strong>Ce passage</strong>
            <button
              className="icon-button"
              aria-label="Fermer les réglages du passage"
              disabled={busy}
              onClick={() => {
                setActive(null);
                editor.commands.focus();
              }}
            >
              <X size={16} />
            </button>
          </div>
          <p className="passage-quote">
            {live.anchors.find((a) => a.id === active)?.quote.slice(0, 160)}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const p = remote.data?.find((p) => p.id === active);
                const a = live.anchors.find((a) => a.id === active);
                if (!a) throw new Error('Ce passage a été supprimé.');
                modifyPassage(editor, active, { hint, priority });
                if (difficulty !== (p?.difficulty ?? a.initialDifficulty ?? 'unrated'))
                  await setPassageDifficulty(active, difficulty, p);
                setActive(null);
                editor.commands.focus();
              });
            }}
          >
            <label>
              Indice facultatif
              <textarea
                maxLength={1000}
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                rows={2}
              />
            </label>
            <div className="context-fields">
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
              <label>
                Difficulté
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                >
                  {Object.entries(difficultyLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="context-actions">
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  modifyPassage(editor, active, null);
                  setActive(null);
                  editor.commands.focus();
                }}
              >
                Retirer le trou
              </button>
              <button className="button primary" disabled={busy} type="submit">
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
          </form>
        </div>
      )}
    </>
  );
}
