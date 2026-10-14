// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions, insertPageBreak } from '../src/editor/extensions';
import { extractAnchors, type RichNode } from '../src/shared/document';
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
