// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions, insertPageBreak } from '../src/editor/extensions';
import { extractAnchors, type RichNode } from '../src/shared/document';
import { createPassage, modifyPassage } from '../src/editor/memory-commands';
import { reidentifyPastedSlice } from '../src/editor/extensions';
it('insère un saut de page sans remplacer une image sélectionnée', () => {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions(),
    content: {
      type: 'doc',
      content: [{ type: 'image', attrs: { src: `/api/assets/${crypto.randomUUID()}` } }],
    },
  });
  editor.commands.setNodeSelection(0);
  insertPageBreak(editor);
  expect(editor.getJSON().content?.map((n) => n.type)).toEqual(['image', 'pageBreak', 'paragraph']);
  editor.destroy();
});
it('annote une sélection multistyle, modifie son indice et retire seulement l’annotation', () => {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Une ', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'réponse', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    },
  });
  const before = editor.getText();
  editor.commands.setTextSelection({ from: 1, to: 12 });
  const id = createPassage(editor, 'Indice', 'high');
  expect(extractAnchors(editor.getJSON() as RichNode)[0]).toMatchObject({
    id,
    quote: 'Une réponse',
    hint: 'Indice',
    priority: 'high',
    disconnected: false,
  });
  expect(editor.getHTML()).toContain('<strong>');
  expect(editor.getHTML()).toContain('<em>');
  expect(() => createPassage(editor, 'Autre', 'low')).toThrow('chevauche');
  modifyPassage(editor, id, { hint: 'Nouveau', priority: 'low' });
  expect(extractAnchors(editor.getJSON() as RichNode)[0].hint).toBe('Nouveau');
  const copied = reidentifyPastedSlice(editor.state.selection.content());
  const marks: any[] = [];
  copied.content.descendants((n) => {
    marks.push(...n.marks.filter((m) => m.type.name === 'memoryAnchor'));
  });
  expect(marks[0].attrs.id).not.toBe(id);
  expect(marks[0].attrs.sourceId).toBe(id);
  expect(marks[0].attrs.hint).toBe('Nouveau');
  modifyPassage(editor, id, null);
  expect(extractAnchors(editor.getJSON() as RichNode)).toHaveLength(0);
  expect(editor.getText()).toBe(before);
  expect(editor.getHTML()).toContain('<strong>');
  editor.destroy();
});
it('accepte les paragraphes, tableaux, listes et code sans supprimer leurs structures', () => {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions(),
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bêta' }] }],
            },
          ],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gamma' }] }],
                },
              ],
            },
          ],
        },
        { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1;' }] },
      ],
    },
  });
  const before = editor.getText();
  editor.commands.selectAll();
  createPassage(editor, 'Structures conservées', 'medium');
  expect(editor.getText()).toBe(before);
  expect(extractAnchors(editor.getJSON() as RichNode)).toHaveLength(1);
  expect(editor.getHTML()).toContain('<table');
  expect(editor.getHTML()).toContain('<code>');
  editor.destroy();
});
it('signale un passage devenu disjoint après insertion sans annotation', () => {
  const id = crypto.randomUUID();
  const doc: RichNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Avant', marks: [{ type: 'memoryAnchor', attrs: { id } }] },
          { type: 'text', text: 'insertion' },
          { type: 'text', text: 'après', marks: [{ type: 'memoryAnchor', attrs: { id } }] },
        ],
      },
    ],
  };
  expect(extractAnchors(doc)[0].disconnected).toBe(true);
});
it('annote une équation en ligne sans changer son expression', () => {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions(),
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: 'E=mc^2' } }] },
      ],
    },
  });
  editor.commands.selectAll();
  const id = createPassage(editor, 'Énergie', 'high');
  expect(extractAnchors(editor.getJSON() as RichNode)[0].quote).toBe('E=mc^2');
  modifyPassage(editor, id, null);
  expect((editor.getJSON() as RichNode).content?.[0].content?.[0].attrs?.latex).toBe('E=mc^2');
  editor.destroy();
});
it('conserve l’identité lors d’un couper-coller complet dans le même éditeur', () => {
  const id = crypto.randomUUID();
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions(),
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Science',
              marks: [{ type: 'memoryAnchor', attrs: { id } }, { type: 'bold' }],
            },
          ],
        },
      ],
    },
  });
  editor.commands.setTextSelection({ from: 1, to: 8 });
  const slice = editor.state.selection.content();
  const data = new Map<string, string>();
  const event = {
    clipboardData: {
      clearData: () => data.clear(),
      setData: (key: string, value: string) => data.set(key, value),
      getData: (key: string) => data.get(key) || '',
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
  const plugin = editor.state.plugins.find((p) => p.props.handleDOMEvents?.cut)!;
  const cut = plugin.props.handleDOMEvents!.cut!;
  expect(cut.call(plugin, editor.view, event)).toBe(true);
  expect(extractAnchors(editor.getJSON() as RichNode)).toHaveLength(0);
  plugin.props.handleDOMEvents!.paste!.call(plugin, editor.view, event);
  const pasted = plugin.props.transformPasted!.call(plugin, slice, editor.view, false);
  editor.view.dispatch(editor.state.tr.replaceSelection(pasted));
  expect(extractAnchors(editor.getJSON() as RichNode)[0].id).toBe(id);
  expect(editor.getHTML()).toContain('<strong>');
  editor.destroy();
});
