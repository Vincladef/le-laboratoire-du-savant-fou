import { useEffect, useLayoutEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { editorExtensions } from '../editor/extensions';
import type { DocumentRecord } from '../shared/document';
import {
  difficultyLabels,
  priorityLabels,
  type Priority,
  type Difficulty,
  type MemoryPassage,
} from '../shared/learning';

function placeReviewPopup(details: HTMLDetailsElement) {
  const panel = details.querySelector<HTMLElement>('.review-inline-popover');
  const summary = details.querySelector('summary');
  if (!details.open || !panel || !summary) return;
  const anchor = summary.getBoundingClientRect(),
    box = panel.getBoundingClientRect();
  Object.assign(panel.style, {
    position: 'fixed',
    marginTop: '0',
    right: 'auto',
    left: `${Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8))}px`,
    top: `${Math.max(8, Math.min(anchor.bottom + 6, innerHeight - box.height - 8))}px`,
  });
}

type MaskState = {
  selected: Set<string>;
  hidden: Set<string>;
  passages: MemoryPassage[];
  busyId: string | null;
};
const empty: MaskState = { selected: new Set(), hidden: new Set(), passages: [], busyId: null };
const maskKey = new PluginKey<MaskState>('review-mask');
function maskExtension(
  reveal: (id: string) => void,
  evaluate: (id: string, value: Difficulty) => void,
  readOnly = false,
  setPriority?: (id: string, value: Priority) => void,
  setHint?: (id: string, hint: string) => void,
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
                        details.addEventListener('toggle', () => placeReviewPopup(details));
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
                      if (passage.hint || (!readOnly && setHint)) {
                        const canEdit = !readOnly && Boolean(setHint);
                        const { details, summary } = popup(passage.hint ? '?' : '+ Indice', 'review-hint');
                        summary.setAttribute(
                          'aria-label',
                          passage.hint
                            ? `Afficher ou modifier l’indice du passage ${number}`
                            : `Ajouter un indice au passage ${number}`,
                        );
                        const panel = document.createElement('span');
                        panel.className = 'review-inline-popover review-hint-panel';
                        if (canEdit) {
                          const label = document.createElement('label');
                          label.textContent = 'Indice';
                          const textarea = document.createElement('textarea');
                          textarea.rows = 2;
                          textarea.maxLength = 1000;
                          textarea.value = passage.hint;
                          textarea.placeholder = 'Un mot-clé ou une piste pour retrouver la réponse';
                          textarea.setAttribute('aria-label', `Indice du passage ${number}`);
                          textarea.disabled = value.busyId !== null;
                          label.append(textarea);
                          panel.append(label);
                          const actions = document.createElement('span');
                          actions.className = 'review-hint-actions';
                          const save = document.createElement('button');
                          save.type = 'button';
                          save.className = 'review-hint-save';
                          save.textContent = 'Enregistrer';
                          save.disabled = value.busyId !== null;
                          save.addEventListener('click', () => {
                            const hint = textarea.value.trim();
                            details.open = false;
                            if (hint !== passage.hint) setHint?.(id, hint);
                          });
                          textarea.addEventListener('keydown', (event) => {
                            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                              event.preventDefault();
                              save.click();
                            }
                          });
                          actions.append(save);
                          if (passage.hint) {
                            const remove = document.createElement('button');
                            remove.type = 'button';
                            remove.className = 'review-hint-delete';
                            remove.textContent = 'Supprimer';
                            remove.disabled = value.busyId !== null;
                            remove.addEventListener('click', () => {
                              details.open = false;
                              setHint?.(id, '');
                            });
                            actions.append(remove);
                          }
                          panel.append(actions);
                          details.addEventListener('toggle', () => {
                            if (details.open) textarea.focus({ preventScroll: true });
                          });
                        } else {
                          const hint = document.createElement('span');
                          hint.textContent = passage.hint;
                          hint.setAttribute('role', 'note');
                          panel.append(hint);
                        }
                        details.append(panel);
                      }
                      if (!hidden && !readOnly) {
                        const label = document.createElement('label');
                        label.className = 'review-inline-select review-evaluation';
                        const caption = document.createElement('span');
                        caption.textContent = 'Difficulté';
                        const select = document.createElement('select');
                        select.setAttribute('aria-label', `Difficulté du passage ${number}`);
                        select.disabled = value.busyId !== null;
                        for (const [key, text] of Object.entries(difficultyLabels)) {
                          const option = document.createElement('option');
                          option.value = key;
                          option.textContent = key === 'unrated' ? 'Évaluer' : text;
                          select.append(option);
                        }
                        select.value = passage.difficulty;
                        select.addEventListener('change', () => {
                          if (select.value !== passage.difficulty)
                            evaluate(id, select.value as Difficulty);
                        });
                        label.append(caption, select);
                        root.append(label);
                      }
                      if (!hidden && setPriority) {
                        const label = document.createElement('label');
                        label.className = 'review-inline-select review-priority';
                        const caption = document.createElement('span');
                        caption.textContent = 'Priorité';
                        const select = document.createElement('select');
                        select.setAttribute('aria-label', `Priorité du passage ${number}`);
                        select.disabled = value.busyId !== null;
                        for (const [key, text] of Object.entries(priorityLabels)) {
                          const option = document.createElement('option');
                          option.value = key;
                          option.textContent = text;
                          select.append(option);
                        }
                        select.value = passage.priority;
                        select.addEventListener('change', () => {
                          if (select.value !== passage.priority)
                            setPriority(id, select.value as Priority);
                        });
                        label.append(caption, select);
                        root.append(label);
                      }
                      return root;
                    },
                    {
                      side: hidden ? -1 : 1,
                      key: `${id}/${hidden}/${passage.difficulty}/${value.busyId}/${passage.hint}/${passage.priority}/${number}`,
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
  readOnly = false,
  onPriority,
  onHint,
}: {
  document: DocumentRecord;
  passages: MemoryPassage[];
  selected: string[];
  hidden: string[];
  onReveal: (id: string) => void;
  onDifficulty: (id: string, difficulty: Difficulty) => void;
  busyId: string | null;
  readOnly?: boolean;
  onPriority?: (id: string, value: Priority) => void;
  onHint?: (id: string, hint: string) => void;
}) {
  const callbacks = useRef({ onReveal, onDifficulty, onPriority, onHint });
  callbacks.current = { onReveal, onDifficulty, onPriority, onHint };
  const editor = useEditor({
    extensions: [
      ...editorExtensions(),
      maskExtension(
        (id) => callbacks.current.onReveal(id),
        (id, difficulty) => callbacks.current.onDifficulty(id, difficulty),
        readOnly && !onPriority,
        onPriority ? (id, value) => callbacks.current.onPriority?.(id, value) : undefined,
        onHint ? (id, hint) => callbacks.current.onHint?.(id, hint) : undefined,
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
    const priorityFocused =
      active instanceof HTMLElement && Boolean(active.closest('.review-priority'));
    editor.view.dispatch(
      editor.state.tr.setMeta(maskKey, {
        selected: new Set(selected),
        hidden: new Set(hidden),
        passages,
        busyId,
      } satisfies MaskState),
    );
    if (focused) {
      const root = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-passage-id]')].find(
        (el) => el.dataset.passageId === focused.dataset.passageId,
      );
      root
        ?.querySelector<HTMLElement>(
          hintFocused
            ? '.review-hint summary'
            : priorityFocused
              ? '.review-priority select'
              : '.review-evaluation select',
        )
        ?.focus();
    }
  }, [editor, selected.join(','), hidden.join(','), passages, busyId]);
  useEffect(() => {
    if (!editor) return;
    const close = (event: PointerEvent) => {
      for (const popup of editor.view.dom.querySelectorAll<HTMLDetailsElement>('details[open]'))
        if (!popup.contains(event.target as Node)) popup.open = false;
    };
    const place = () => {
      for (const popup of editor.view.dom.querySelectorAll<HTMLDetailsElement>('details[open]'))
        placeReviewPopup(popup);
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.document.addEventListener('pointerdown', close);
    return () => {
      window.document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [editor]);
  return (
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
  );
}
