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
                      if (!hidden && !readOnly) {
                        const { details, summary } = popup(
                          passage.difficulty === 'unrated'
                            ? 'Évaluer'
                            : difficultyLabels[passage.difficulty],
                          'review-evaluation',
                        );
                        summary.setAttribute(
                          'aria-label',
                          `Évaluer la difficulté du passage ${number}`,
                        );
                        const panel = document.createElement('span');
                        panel.className = 'review-inline-popover';
                        const label = document.createElement('label');
                        label.append('Difficulté ');
                        const select = document.createElement('select');
                        select.setAttribute('aria-label', `Difficulté du passage ${number}`);
                        select.disabled = value.busyId !== null;
                        for (const [key, text] of Object.entries(difficultyLabels)) {
                          const option = document.createElement('option');
                          option.value = key;
                          option.textContent = text;
                          select.append(option);
                        }
                        select.value = passage.difficulty;
                        select.addEventListener('change', () => {
                          details.open = false;
                          evaluate(id, select.value as Difficulty);
                        });
                        label.append(select);
                        panel.append(label);
                        const note = document.createElement('small');
                        note.textContent = 'Facultatif · modifiable à tout moment';
                        panel.append(note);
                        details.append(panel);
                      }
                      return root;
                    },
                    {
                      side: hidden ? -1 : 1,
                      key: `${id}/${hidden}/${passage.difficulty}/${value.busyId}/${passage.hint}/${number}`,
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
}: {
  document: DocumentRecord;
  passages: MemoryPassage[];
  selected: string[];
  hidden: string[];
  onReveal: (id: string) => void;
  onDifficulty: (id: string, difficulty: Difficulty) => void;
  busyId: string | null;
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
      } satisfies MaskState),
    );
    if (focused) {
      const root = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-passage-id]')].find(
        (el) => el.dataset.passageId === focused.dataset.passageId,
      );
      root
        ?.querySelector<HTMLElement>(
          hintFocused ? '.review-hint summary' : '.review-evaluation summary',
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
    window.document.addEventListener('pointerdown', close);
    return () => window.document.removeEventListener('pointerdown', close);
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
