import { useEffect, useLayoutEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { editorExtensions } from '../editor/extensions';
import type { DocumentRecord } from '../shared/document';
import { difficultyLabels, type Difficulty, type MemoryPassage } from '../shared/learning';

type MaskState = {
  selected: Set<string>;
  hidden: Set<string>;
  passages: MemoryPassage[];
  busyId: string | null;
  activeRatingId?: string | null;
};
const empty: MaskState = { selected: new Set(), hidden: new Set(), passages: [], busyId: null };
const maskKey = new PluginKey<MaskState>('review-mask');
function maskExtension(
  reveal: (id: string) => void,
  evaluate: (id: string, value: Difficulty) => void,
  readOnly = false,
) {
  return Extension.create({
    name: 'reviewMask',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: maskKey,
          state: { init: () => empty, apply: (tr, previous) => tr.getMeta(maskKey) ?? previous },
          props: {
            decorations(state) {
              const value = maskKey.getState(state)!;
              const passagesById = new Map(value.passages.map((p) => [p.id, p]));
              const decorations: Decoration[] = [];
              const ranges = new Map<
                string,
                { from: number; to: number; segments: { from: number; to: number }[] }
              >();
              state.doc.descendants((node, pos) => {
                const id = node.marks.find((m) => m.type.name === 'memoryAnchor')?.attrs.id;
                if (!id) return;
                const previous = ranges.get(id);
                const segment = { from: pos, to: pos + node.nodeSize };
                if (previous) {
                  previous.to = segment.to;
                  previous.segments.push(segment);
                } else ranges.set(id, { ...segment, segments: [segment] });
              });
              let index = 0;
              for (const [id, range] of ranges) {
                const number = ++index;
                if (!value.selected.has(id)) continue;
                const passage = passagesById.get(id);
                if (!passage) continue;
                const hidden = value.hidden.has(id);
                for (const segment of range.segments)
                  decorations.push(
                    Decoration.inline(
                      segment.from,
                      segment.to,
                      hidden
                        ? {
                            class: 'review-hidden',
                            'aria-hidden': 'true',
                          }
                        : { class: 'review-revealed' },
                    ),
                  );
                decorations.push(
                  Decoration.widget(
                    hidden ? range.from : range.to,
                    () => {
                      const root = document.createElement('span');
                      root.className = 'review-inline-tools';
                      root.contentEditable = 'false';
                      root.dataset.passageId = id;
                      if (hidden) {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = 'review-reveal';
                        button.textContent = '•••';
                        button.setAttribute('aria-label', `Révéler le passage ${number}`);
                        button.addEventListener('click', () => reveal(id));
                        root.append(button);
                      }
                      function popup(label: string, className: string) {
                        const details = document.createElement('details');
                        details.className = className;
                        details.name = 'review-inline-popup';
                        const summary = document.createElement('summary');
                        summary.textContent = label;
                        details.append(summary);
                        details.addEventListener('keydown', (e) => {
                          if (e.key === 'Escape') {
                            details.open = false;
                            summary.focus();
                            e.stopPropagation();
                          }
                        });
                        root.append(details);
                        return { details, summary };
                      }
                      if (passage.hint) {
                        const { details, summary } = popup('?', 'review-hint');
                        summary.setAttribute(
                          'aria-label',
                          `Afficher l’indice du passage ${number}`,
                        );
                        const hint = document.createElement('span');
                        hint.className = 'review-inline-popover';
                        hint.textContent = passage.hint;
                        hint.setAttribute('role', 'note');
                        details.append(hint);
                      }
                      return root;
                    },
                    {
                      side: hidden ? -1 : 1,
                      key: `${id}/${hidden}/${passage.difficulty}/${value.busyId}/${passage.hint}/${number}/${value.activeRatingId === id}`,
                      stopEvent: () => true,
                    },
                  ),
                );
              }
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}
export function StudyDocument({
  document: doc,
  passages,
  selected,
  hidden,
  onReveal,
  onDifficulty,
  busyId,
  activeRatingId,
  readOnly = false,
}: {
  document: DocumentRecord;
  passages: MemoryPassage[];
  selected: string[];
  hidden: string[];
  onReveal: (id: string) => void;
  onDifficulty: (id: string, difficulty: Difficulty) => void;
  busyId: string | null;
  activeRatingId?: string | null;
  readOnly?: boolean;
}) {
  const callbacks = useRef({ onReveal, onDifficulty });
  callbacks.current = { onReveal, onDifficulty };
  const editor = useEditor({
    extensions: [
      ...editorExtensions(),
      maskExtension(
        (id) => callbacks.current.onReveal(id),
        (id, difficulty) => callbacks.current.onDifficulty(id, difficulty),
        readOnly,
      ),
    ],
    content: doc.content,
    editable: false,
    editorProps: { attributes: { 'aria-label': 'Document de révision', role: 'document' } },
  });
  useLayoutEffect(() => {
    if (!editor) return;
    const active = window.document.activeElement;
    const focused =
      active instanceof HTMLElement && editor.view.dom.contains(active)
        ? active.closest<HTMLElement>('[data-passage-id]')
        : null;
    const hintFocused = active instanceof HTMLElement && Boolean(active.closest('.review-hint'));
    editor.view.dispatch(
      editor.state.tr.setMeta(maskKey, {
        selected: new Set(selected),
        hidden: new Set(hidden),
        passages,
        busyId,
        activeRatingId,
      } satisfies MaskState),
    );
    if (focused) {
      const root = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-passage-id]')].find(
        (el) => el.dataset.passageId === focused.dataset.passageId,
      );
      const target = hintFocused
        ? root?.querySelector<HTMLElement>('.review-hint summary')
        : window.document.querySelector<HTMLElement>(
            `summary[data-rating-id="${focused.dataset.passageId}"]`,
          );
      target?.focus({ preventScroll: true });
    }
  }, [editor, selected.join(','), hidden.join(','), passages, busyId, activeRatingId]);
  useEffect(() => {
    if (!editor) return;
    const close = (event: PointerEvent) => {
      for (const popup of editor.view.dom.querySelectorAll<HTMLDetailsElement>('details[open]'))
        if (!popup.contains(event.target as Node)) popup.open = false;
    };
    window.document.addEventListener('pointerdown', close);
    return () => window.document.removeEventListener('pointerdown', close);
  }, [editor]);
  return (
    <>
      <article
        className="review-paper document-page"
        aria-label={doc.title}
        style={{
          fontFamily: doc.layout.typography?.fontFamily || 'Arial',
          fontSize: `${doc.layout.typography?.fontSize || 11}pt`,
        }}
      >
        <EditorContent editor={editor} />
      </article>
      {!readOnly && (
        <div className="review-evaluations" aria-label="Évaluations des réponses">
          {passages
            .filter((p) => selected.includes(p.id) && !hidden.includes(p.id))
            .map((p) => {
              const number = passages.findIndex((item) => item.id === p.id) + 1;
              return (
                <details key={p.id} className="review-evaluation">
                  <summary
                    data-rating-id={p.id}
                    aria-label={`Évaluer la difficulté du passage ${number}`}
                  >
                    Passage {number} · {difficultyLabels[p.difficulty]}
                  </summary>
                  <label>
                    {p.quote}
                    <select
                      aria-label={`Difficulté du passage ${number}`}
                      value={p.difficulty}
                      disabled={busyId !== null}
                      onChange={(e) => {
                        e.target.closest('details')!.open = false;
                        onDifficulty(p.id, e.target.value as Difficulty);
                      }}
                    >
                      {Object.entries(difficultyLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </details>
              );
            })}
        </div>
      )}

      {!readOnly &&
        activeRatingId &&
        selected.includes(activeRatingId) &&
        !hidden.includes(activeRatingId) && (
          <aside className="review-rating-bar" aria-label="Évaluer la réponse révélée">
            <span>
              Passage {passages.findIndex((p) => p.id === activeRatingId) + 1} ·{' '}
              {passages.find((p) => p.id === activeRatingId)?.quote}
            </span>
            {(
              [
                ['easy', 'Facile'],
                ['medium', 'Moyen'],
                ['hard', 'Difficile'],
              ] as const
            ).map(([rating, label]) => (
              <button
                key={rating}
                className="button subtle"
                disabled={busyId !== null}
                aria-label={`${label} · passage ${passages.findIndex((p) => p.id === activeRatingId) + 1}`}
                onClick={() => onDifficulty(activeRatingId, rating)}
              >
                {label}
              </button>
            ))}
          </aside>
        )}
    </>
  );
}
