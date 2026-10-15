import { Extension, Mark, Node, mergeAttributes, type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import CodeBlock from '@tiptap/extension-code-block';
import { TextStyleKit } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import Mathematics from '@tiptap/extension-mathematics';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export function reidentifyPastedSlice(slice: Slice): Slice {
  const ids = new Map<string, string>();
  function map(fragment: Fragment): Fragment {
    const children: PMNode[] = [];
    fragment.forEach((node) => {
      const marks = node.marks.map((mark) => {
        if (mark.type.name !== 'memoryAnchor') return mark;
        const source = mark.attrs.id;
        if (!ids.has(source)) ids.set(source, crypto.randomUUID());
        return mark.type.create({ ...mark.attrs, id: ids.get(source), sourceId: source });
      });
      children.push(node.isText ? node.mark(marks) : node.copy(map(node.content)).mark(marks));
    });
    return Fragment.from(children);
  }
  return new Slice(map(slice.content), slice.openStart, slice.openEnd);
}
export const MemoryAnchor = Mark.create({
  name: 'memoryAnchor',
  inclusive: false,
  spanning: true,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute('data-memory-id') },
      sourceId: { default: null, parseHTML: (el) => el.getAttribute('data-memory-source') },
      hint: { default: null, parseHTML: (el) => el.getAttribute('data-memory-hint') },
      priority: { default: null, parseHTML: (el) => el.getAttribute('data-memory-priority') },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-memory-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        'data-memory-id': HTMLAttributes.id,
        'data-memory-source': HTMLAttributes.sourceId,
        'data-memory-hint': HTMLAttributes.hint,
        'data-memory-priority': HTMLAttributes.priority,
        class: 'memory-anchor',
      },
      0,
    ];
  },
  addProseMirrorPlugins() {
    let cutToken: string | null = null;
    let cutIds = new Set<string>();
    let preserveCut = false;
    let preserveDrag = false;
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            cut(view, event) {
              if (!event.clipboardData || view.state.selection.empty) return false;
              const slice = view.state.selection.content();
              const ids = new Set<string>();
              slice.content.descendants((node) => {
                for (const mark of node.marks)
                  if (mark.type.name === 'memoryAnchor') ids.add(mark.attrs.id);
              });
              if (!ids.size) return false;
              const serialized = view.serializeForClipboard(slice);
              cutToken = crypto.randomUUID();
              cutIds = ids;
              event.clipboardData.clearData();
              event.clipboardData.setData('text/html', serialized.dom.innerHTML);
              event.clipboardData.setData('text/plain', serialized.text);
              event.clipboardData.setData('application/x-laboratoire-cut', cutToken);
              view.dispatch(view.state.tr.deleteSelection().scrollIntoView());
              event.preventDefault();
              return true;
            },
            paste(view, event) {
              preserveCut = Boolean(
                cutToken &&
                event.clipboardData?.getData('application/x-laboratoire-cut') === cutToken,
              );
              if (preserveCut)
                view.state.doc.descendants((node) => {
                  if (
                    node.marks.some(
                      (mark) => mark.type.name === 'memoryAnchor' && cutIds.has(mark.attrs.id),
                    )
                  )
                    preserveCut = false;
                });
              return false;
            },
            drop(view, event) {
              const copying = /Mac/.test(navigator.platform) ? event.altKey : event.ctrlKey;
              preserveDrag = Boolean(view.dragging && !copying);
              return false;
            },
          },
          transformPasted(slice) {
            if (preserveCut || preserveDrag) {
              preserveCut = false;
              preserveDrag = false;
              cutToken = null;
              return slice;
            }
            return reidentifyPastedSlice(slice);
          },
        },
      }),
    ];
  },
});
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },
  renderHTML() {
    return [
      'div',
      {
        'data-page-break': 'true',
        class: 'page-break',
        contenteditable: 'false',
        'aria-label': 'Saut de page',
      },
    ];
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => insertPageBreak(this.editor) };
  },
});
export function insertPageBreak(editor: Editor) {
  return editor
    .chain()
    .focus()
    .insertContentAt(editor.state.selection.to, [{ type: 'pageBreak' }, { type: 'paragraph' }])
    .run();
}
export const BlockLayout = Extension.create({
  name: 'blockLayout',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (el) => Number(el.dataset.indent || 0),
            renderHTML: (attrs) =>
              attrs.indent
                ? { 'data-indent': attrs.indent, style: `margin-left: ${attrs.indent * 24}px` }
                : {},
          },
          lineHeight: {
            default: '1.5',
            parseHTML: (el) => el.style.lineHeight || '1.5',
            renderHTML: (attrs) => ({ style: `line-height: ${attrs.lineHeight}` }),
          },
        },
      },
    ];
  },
});
const RichImage = Image.extend({
  addAttributes() {
    return { ...this.parent?.(), width: { default: 400 }, height: { default: null } };
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        loading: 'lazy',
        referrerpolicy: 'no-referrer',
      }),
    ];
  },
});
export type SearchMatch = { from: number; to: number };
export function findMatches(doc: PMNode, query: string, caseSensitive = false): SearchMatch[] {
  if (!query) return [];
  const matches: SearchMatch[] = [];
  const needle = caseSensitive ? query : query.toLocaleLowerCase('fr');
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, '\n', '\ufffc');
    const haystack = caseSensitive ? text : text.toLocaleLowerCase('fr');
    let offset = 0;
    while (offset <= haystack.length) {
      const index = haystack.indexOf(needle, offset);
      if (index < 0) break;
      matches.push({ from: pos + 1 + index, to: pos + 1 + index + needle.length });
      offset = index + needle.length;
    }
    return false;
  });
  return matches;
}
export const searchKey = new PluginKey<{ query: string; caseSensitive: boolean }>('lab-search');
export const SearchHighlight = Extension.create({
  name: 'searchHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: () => ({ query: '', caseSensitive: false }),
          apply: (tr, state) => tr.getMeta(searchKey) || state,
        },
        props: {
          decorations(state) {
            const search = searchKey.getState(state)!;
            return DecorationSet.create(
              state.doc,
              findMatches(state.doc, search.query, search.caseSensitive).map((m) =>
                Decoration.inline(m.from, m.to, { class: 'search-match' }),
              ),
            );
          },
        },
      }),
    ];
  },
});
export function setBlockStyle(editor: Editor, attrs: { indent?: number; lineHeight?: string }) {
  const { from, to } = editor.state.selection;
  const tr = editor.state.tr;
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (['paragraph', 'heading'].includes(node.type.name))
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
  });
  editor.view.dispatch(tr);
  editor.commands.focus();
}
export const editorExtensions = () => [
  StarterKit.configure({
    link: { openOnClick: false, defaultProtocol: 'https', protocols: ['https', 'http', 'mailto'] },
    trailingNode: false,
    codeBlock: false,
  }),
  CodeBlock.extend({ marks: 'memoryAnchor' }),
  TextStyleKit.configure({ lineHeight: false }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  Highlight.configure({ multicolor: true }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({ table: { resizable: true } }),
  RichImage.configure({ allowBase64: false }),
  Mathematics.configure({ katexOptions: { throwOnError: false, trust: false, strict: 'warn' } }),
  BlockLayout,
  PageBreak,
  MemoryAnchor,
  SearchHighlight,
];
