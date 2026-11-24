import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Brain, Plus, Trash2, X, Sparkles, Link2 } from 'lucide-react';
import { api, json } from '../lib/api';
import { extractAnchors, type RichNode } from '../shared/document';
import {
  priorityLabels,
  difficultyLabels,
  type Difficulty,
  type MemoryPassage,
  type Priority,
} from '../shared/learning';
import {
  createPassage,
  createLinkedPassage,
  linkPassages,
  modifyPassage,
  selectPassage,
  unlinkPassage,
} from './memory-commands';
import {
  DEFAULT_EDITOR_SHORTCUTS,
  shortcutFromEvent,
  shortcutLabel,
  type EditorShortcuts,
} from '../shared/editor-preferences';
import type { SaveState } from './useAutosave';

export function MemoryTools({
  editor,
  documentId,
  ownerId,
  status,
  flush,
  hasLocal,
  onAI,
  shortcuts = DEFAULT_EDITOR_SHORTCUTS,
  children,
}: {
  editor: Editor;
  documentId: string;
  ownerId: string;
  status: SaveState;
  flush: () => Promise<void>;
  hasLocal: () => boolean;
  onAI: () => void;
  shortcuts?: EditorShortcuts;
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
  const lastCreatedId = useRef<string | null>(null);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const live = useEditorState({
    editor,
    selector: ({ editor }) => ({
      empty: editor.state.selection.empty,
      from: editor.state.selection.from,
      to: editor.state.selection.to,
      anchors: extractAnchors(editor.getJSON() as RichNode),
    }),
  });
  const [floatPosition, setFloatPosition] = useState<{ top: number; left: number } | undefined>();
  useEffect(() => {
    const place = () => {
      if (live.empty || window.innerWidth <= 760) {
        setFloatPosition(undefined);
        return;
      }
      if (editor.isDestroyed) return;
      const current = editor.state.selection;
      if (current.empty || current.to > editor.state.doc.content.size) {
        setFloatPosition(undefined);
        return;
      }
      const start = editor.view.coordsAtPos(current.from),
        end = editor.view.coordsAtPos(current.to);
      const top = Math.min(window.innerHeight - 60, end.bottom + 8);
      setFloatPosition({
        top: Math.max(8, top),
        left: Math.max(12, Math.min((start.left + end.left) / 2 - 135, window.innerWidth - 292)),
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [editor, live.from, live.to, live.empty]);
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
    lastCreatedId.current = id;
  }
  function create() {
    setError('');
    try {
      const to = editor.state.selection.to;
      lastCreatedId.current = createPassage(editor, '', 'medium', 'unrated');
      editor.chain().focus().setTextSelection(to).unsetMark('memoryAnchor').run();
      setActive(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function createLinked() {
    setError('');
    try {
      const base = lastCreatedId.current || live.anchors.at(-1)?.id;
      if (!base) throw new Error('Créez ou sélectionnez d’abord un trou de référence.');
      const selected = editor.state.selection.$from
        .marks()
        .find((m) => m.type.name === 'memoryAnchor');
      if (selected && selected.attrs.id !== base) {
        linkPassages(editor, base, selected.attrs.id);
      } else {
        const to = editor.state.selection.to;
        lastCreatedId.current = createLinkedPassage(editor, base);
        editor.chain().focus().setTextSelection(to).unsetMark('memoryAnchor').run();
      }
      setActive(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const callbacks = useRef({ create, createLinked, openPassage });
  callbacks.current = { create, createLinked, openPassage };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const pressed = shortcutFromEvent(e);
      if (pressed === shortcutsRef.current.create) {
        e.preventDefault();
        callbacks.current.create();
      }
      if (pressed === shortcutsRef.current.link) {
        e.preventDefault();
        callbacks.current.createLinked();
      }
      if (pressed === shortcutsRef.current.edit) {
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
              {a.groupId && (
                <small>
                  {' '}
                  (lié à {live.anchors.filter((x) => x.groupId === a.groupId).length} occurrences)
                </small>
              )}
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
              title={`Créer un texte à trous (${shortcutLabel(shortcuts.create)})`}
              onMouseDown={(e) => e.preventDefault()}
              disabled={live.empty}
              onClick={create}
            >
              <Plus size={16} />
              <span>Texte à trous</span>
            </button>
            {live.anchors.length > 0 && (
              <button
                className="button subtle"
                aria-label="Lier la sélection au dernier trou"
                title={'Lier au dernier trou (' + shortcutLabel(shortcuts.link) + ')'}
                onMouseDown={(e) => e.preventDefault()}
                disabled={live.empty}
                onClick={createLinked}
              >
                <Link2 size={15} /> Lier
              </button>
            )}
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
        <div
          className={`selection-float ${floatPosition ? 'selection-near' : ''}`}
          style={floatPosition}
        >
          <button onMouseDown={(e) => e.preventDefault()} onClick={create}>
            <Plus size={16} />
            Texte à trous
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={createLinked}>
            Lier au dernier trou
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
          <div className="context-fields">
            <label>
              Associer à un autre trou
              <select
                aria-label="Associer le trou à un autre passage"
                value=""
                onChange={(e) => {
                  if (!active || !e.target.value) return;
                  try {
                    linkPassages(editor, active, e.target.value);
                    setError('');
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                <option value="">Choisir un trou…</option>
                {live.anchors
                  .filter((a) => a.id !== active)
                  .map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.quote.slice(0, 72)}
                    </option>
                  ))}
              </select>
            </label>
            {live.anchors.some(
              (a) =>
                a.id !== active &&
                a.quote.trim() === live.anchors.find((p) => p.id === active)?.quote.trim() &&
                a.groupId !== live.anchors.find((p) => p.id === active)?.groupId,
            ) && (
              <button
                type="button"
                className="button subtle"
                onClick={() => {
                  const source = live.anchors.find((a) => a.id === active);
                  if (!source || !source.quote.trim()) return;
                  try {
                    const copies = live.anchors.filter(
                      (a) => a.id !== source.id && a.quote.trim() === source.quote.trim(),
                    );
                    for (const copy of copies) linkPassages(editor, source.id, copy.id);
                    setError('');
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                Associer les occurrences identiques
              </button>
            )}
            {live.anchors.find((a) => a.id === active)?.groupId &&
              live.anchors.some(
                (a) =>
                  a.id !== active &&
                  a.groupId === live.anchors.find((p) => p.id === active)?.groupId,
              ) && (
                <button
                  type="button"
                  className="button subtle"
                  onClick={() => {
                    unlinkPassage(editor, active);
                    setError('');
                  }}
                >
                  Dissocier ce trou
                </button>
              )}
          </div>
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
