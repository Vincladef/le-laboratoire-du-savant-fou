import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { editorExtensions } from '../editor/extensions';
import type { DocumentRecord } from '../shared/document';
import type { MemoryPassage } from '../shared/learning';
import { groupTone } from './group-palette';

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
  activeKey: string | null;
  showGroups: boolean;
};
const empty: MaskState = {
  selected: new Set(),
  hidden: new Set(),
  passages: [],
  busyId: null,
  activeKey: null,
  showGroups: true,
};
const maskKey = new PluginKey<MaskState>('review-mask');
function maskExtension(
  reveal: (id: string) => void,
  readOnly = false,
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
              const groupNumbers = new Map<string, number>();
              const groupMembers = new Map<string, number>();
              for (const passage of value.passages) {
                if (passage.groupId)
                  groupMembers.set(passage.groupId, (groupMembers.get(passage.groupId) || 0) + 1);
              }
              for (const [id, range] of ranges) {
                const passage = passagesById.get(id);
                if (!passage) continue;
                const groupKey = passage.groupId || id;
                if (!groupNumbers.has(groupKey)) groupNumbers.set(groupKey, ++index);
                const number = groupNumbers.get(groupKey)!;
                if (!value.selected.has(id)) continue;
                const hidden = value.hidden.has(id);
                const grouped =
                  value.showGroups &&
                  passage.groupId &&
                  (groupMembers.get(passage.groupId) || 0) > 1;
                const tone = grouped ? groupTone(passage.groupId!) : -1;
                const active = value.activeKey === groupKey;
                for (const segment of range.segments)
                  decorations.push(
                    Decoration.inline(segment.from, segment.to, {
                      class: [
                        hidden ? 'review-hidden' : 'review-revealed',
                        grouped ? 'review-grouped review-tone-' + tone : '',
                        active ? 'review-group-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' '),
                      ...(hidden ? { 'aria-hidden': 'true' } : {}),
                      ...(grouped ? { 'data-review-group': groupKey } : {}),
                    }),
                  );
                decorations.push(
                  Decoration.widget(
                    hidden ? range.from : range.to,
                    () => {
                      const root = document.createElement('span');
                      root.className = [
                        'review-inline-tools',
                        grouped ? 'review-grouped-tools review-tone-' + tone : '',
                        active ? 'review-group-active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      root.contentEditable = 'false';
                      root.dataset.passageId = id;
                      if (grouped) root.dataset.reviewGroup = groupKey;
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
                      if (grouped) {
                        const chip = document.createElement('span');
                        chip.className = 'review-group-chip';
                        chip.title = `Groupe ${number} · ${groupMembers.get(passage.groupId!)} occurrences liées`;
                        chip.setAttribute('aria-label', chip.title);
                        chip.textContent = `↔${number}`;
                        root.append(chip);
                      }
                      if (passage.hint || (!readOnly && setHint)) {
                        const canEdit = !readOnly && Boolean(setHint);
                        const { details, summary } = popup('?', 'review-hint');
                        summary.setAttribute(
                          'aria-label',
                          passage.hint
                            ? 'Afficher l’indice du passage ' + number
                            : 'Ajouter un indice au passage ' + number,
                        );
                        summary.title = 'Indice';
                        const panel = document.createElement('span');
                        panel.className = 'review-inline-popover review-hint-panel';
                        const note = document.createElement('span');
                        note.textContent = passage.hint;
                        note.setAttribute('role', 'note');
                        if (passage.hint) panel.append(note);
                        if (canEdit) {
                          const edit = document.createElement('button');
                          edit.type = 'button';
                          edit.className = 'review-hint-edit';
                          edit.textContent = 'Modifier';
                          edit.setAttribute('aria-label', 'Modifier l’indice du passage ' + number);
                          if (passage.hint) panel.append(edit);
                          const form = document.createElement('span');
                          form.className = 'review-hint-form';
                          form.hidden = Boolean(passage.hint);
                          const label = document.createElement('label');
                          label.textContent = 'Indice';
                          const textarea = document.createElement('textarea');
                          textarea.rows = 2;
                          textarea.maxLength = 1000;
                          textarea.value = passage.hint;
                          textarea.placeholder =
                            'Un mot-clé ou une piste pour retrouver la réponse';
                          textarea.setAttribute('aria-label', 'Indice du passage ' + number);
                          textarea.disabled = value.busyId !== null;
                          label.append(textarea);
                          form.append(label);
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
                          form.append(actions);
                          panel.append(form);
                          edit.addEventListener('click', () => {
                            note.hidden = true;
                            edit.hidden = true;
                            form.hidden = false;
                            textarea.focus({ preventScroll: true });
                            placeReviewPopup(details);
                          });
                          details.addEventListener('toggle', () => {
                            if (details.open && !passage.hint)
                              textarea.focus({ preventScroll: true });
                            if (!details.open && passage.hint) {
                              note.hidden = false;
                              edit.hidden = false;
                              form.hidden = true;
                              textarea.value = passage.hint;
                            }
                          });
                        }
                        details.append(panel);
                      }
                      return root;
                    },
                    {
                      side: hidden ? -1 : 1,
                      key: `${id}/${hidden}/${value.busyId}/${passage.hint}/${number}/${tone}/${active}`,
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
  busyId,
  readOnly = false,
  onHint,
  onSelect,
  activeKey = null,
  showGroups = true,
}: {
  document: DocumentRecord;
  passages: MemoryPassage[];
  selected: string[];
  hidden: string[];
  onReveal: (id: string) => void;
  busyId: string | null;
  readOnly?: boolean;
  onHint?: (id: string, hint: string) => void;
  onSelect?: (id: string) => void;
  activeKey?: string | null;
  showGroups?: boolean;
}) {
  const callbacks = useRef({ onReveal, onHint, onSelect });
  callbacks.current = { onReveal, onHint, onSelect };
  const editor = useEditor({
    extensions: [
      ...editorExtensions(),
      maskExtension(
        (id) => callbacks.current.onReveal(id),
        readOnly,
        onHint ? (id, hint) => callbacks.current.onHint?.(id, hint) : undefined,
      ),
    ],
    content: doc.content,
    editable: false,
    editorProps: { attributes: { 'aria-label': 'Document de révision', role: 'document' } },
  });
  // Preserve scroll position and the current question when an index or priority
  // changes the document revision. Replacing the whole React editor would jump.
  const contentVersion = useRef(doc.revision);
  useEffect(() => {
    if (!editor || doc.revision === contentVersion.current) return;
    contentVersion.current = doc.revision;
    editor.commands.setContent(doc.content, { emitUpdate: false });
  }, [editor, doc.revision, doc.content]);
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
        activeKey,
        showGroups,
      } satisfies MaskState),
    );
    if (focused) {
      const root = [...editor.view.dom.querySelectorAll<HTMLElement>('[data-passage-id]')].find(
        (el) => el.dataset.passageId === focused.dataset.passageId,
      );
      if (hintFocused)
        root?.querySelector<HTMLElement>('.review-hint summary')?.focus({ preventScroll: true });
    }
  }, [editor, selected.join(','), hidden.join(','), passages, busyId, activeKey, showGroups]);
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
  const paperRef = useRef<HTMLElement>(null);
  function groupFromTarget(event: ReactPointerEvent<HTMLElement>) {
    const el =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-review-group]')
        : null;
    return el?.dataset.reviewGroup || null;
  }
  function setHoveredGroup(id: string | null) {
    const root = paperRef.current;
    if (!root) return;
    for (const item of root.querySelectorAll<HTMLElement>('[data-review-group]')) {
      item.classList.toggle('review-group-hovered', Boolean(id) && item.dataset.reviewGroup === id);
    }
  }
  return (
    <article
      ref={paperRef}
      onClick={(event) => {
        const el =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>('[data-memory-id]')
            : null;
        const id = el?.dataset.memoryId;
        if (id && selected.includes(id) && !hidden.includes(id)) callbacks.current.onSelect?.(id);
      }}
      onPointerOver={(event) => {
        if (showGroups && event.pointerType !== 'touch') setHoveredGroup(groupFromTarget(event));
      }}
      onPointerLeave={() => setHoveredGroup(null)}
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
