// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../src/editor/extensions';
import {
  DEFAULT_CLOZE_MARKERS,
  findClozeMarkerPairs,
  readClozeMarkers,
  saveClozeMarkers,
  validateClozeMarkers,
  type ClozeMarkerSettings,
} from '../src/editor/cloze-markers';
import { extractAnchors, type RichNode } from '../src/shared/document';
import {
  shortcutFromEvent,
  validateShortcuts,
  DEFAULT_EDITOR_SHORTCUTS,
} from '../src/shared/editor-preferences';

function makeEditor(text = '', settings?: { current: ClozeMarkerSettings }) {
  return new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions(undefined, settings),
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
    },
  });
}
function pasteText(editor: Editor, text: string) {
  const tr = editor.state.tr.insertText(text);
  tr.setMeta('paste', true);
  editor.view.dispatch(tr);
}

describe('balises des trous', () => {
  it('analyse plusieurs trous et ignore les balises échappées et incomplètes', () => {
    const text = String.raw`Un <<chat>>, un <<chien>> et \<<texte littéral>> puis <<incomplet`;
    const pairs = findClozeMarkerPairs(text, DEFAULT_CLOZE_MARKERS);
    expect(pairs.map((pair) => text.slice(pair.contentStart, pair.contentEnd))).toEqual([
      'chat',
      'chien',
    ]);
    expect(findClozeMarkerPairs('<<  >>', DEFAULT_CLOZE_MARKERS)).toEqual([]);
    expect(findClozeMarkerPairs('<<extérieur <<intérieur>>', DEFAULT_CLOZE_MARKERS)).toEqual([]);
  });
  it('convertit lors de la frappe de la dernière balise et permet d’annuler', () => {
    const editor = makeEditor('Les <<chats>');
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const from = editor.state.selection.from;
    const plugin = editor.state.plugins.find(
      (p) => p.props.handleTextInput && p.spec.appendTransaction,
    );
    expect(plugin).toBeDefined();
    const handled = plugin!.props.handleTextInput!.call(
      plugin!,
      editor.view,
      from,
      from,
      '>',
      () => editor.state.tr,
    );
    expect(handled).toBe(true);
    expect(editor.getText()).toBe('Les chats');
    expect(extractAnchors(editor.getJSON() as RichNode)).toMatchObject([
      { quote: 'chats', priority: 'medium', initialDifficulty: 'unrated', disconnected: false },
    ]);
    editor.commands.undo();
    expect(editor.getText()).toBe('Les <<chats>');
    editor.destroy();
  });
  it('convertit plusieurs passages collés en préservant des identifiants uniques', () => {
    const editor = makeEditor();
    pasteText(editor, 'Les <<chats>> et les <<chiens>>.');
    expect(editor.getText()).toBe('Les chats et les chiens.');
    const anchors = extractAnchors(editor.getJSON() as RichNode);
    expect(anchors.map((a) => a.quote)).toEqual(['chats', 'chiens']);
    expect(new Set(anchors.map((a) => a.id)).size).toBe(2);
    expect(anchors.every((a) => a.priority === 'medium')).toBe(true);
    editor.destroy();
  });
  it('conserve les formats existants lors de la conversion', () => {
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: editorExtensions(),
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'La <<', marks: [{ type: 'bold' }] },
              { type: 'text', text: 'photosynthèse', marks: [{ type: 'italic' }] },
              { type: 'text', text: '>>' },
            ],
          },
        ],
      },
    });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    pasteText(editor, ' est essentielle.');
    expect(editor.getText()).toBe('La photosynthèse est essentielle.');
    expect(editor.getHTML()).toContain('<strong>');
    expect(editor.getHTML()).toContain('<em>');
    expect(extractAnchors(editor.getJSON() as RichNode)[0].quote).toBe('photosynthèse');
    editor.destroy();
  });
  it('ne modifie pas un trou existant qui chevauche des balises', () => {
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
              { type: 'text', text: '<<' },
              { type: 'text', text: 'existant', marks: [{ type: 'memoryAnchor', attrs: { id } }] },
              { type: 'text', text: '>>' },
            ],
          },
        ],
      },
    });
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    pasteText(editor, '!');
    expect(editor.getText()).toContain('<<existant>>');
    expect(extractAnchors(editor.getJSON() as RichNode).map((a) => a.id)).toEqual([id]);
    editor.destroy();
  });
  it('utilise immédiatement les balises personnalisées pour les nouveaux trous', () => {
    const settings = { current: { opening: '[[', closing: ']]' } };
    const editor = makeEditor('', settings);
    pasteText(editor, 'Les [[oiseaux]] chantent.');
    expect(extractAnchors(editor.getJSON() as RichNode).map((a) => a.quote)).toEqual(['oiseaux']);
    settings.current = { opening: '{{', closing: '}}' };
    pasteText(editor, ' Puis {{hiboux}}.');
    expect(extractAnchors(editor.getJSON() as RichNode).map((a) => a.quote)).toEqual([
      'oiseaux',
      'hiboux',
    ]);
    editor.destroy();
  });
  it('valide les paramètres et les conserve par compte', () => {
    const ownerId = crypto.randomUUID();
    expect(validateClozeMarkers({ opening: 'x', closing: 'x' })).not.toBeNull();
    expect(validateClozeMarkers({ opening: ' ', closing: '>>' })).not.toBeNull();
    expect(validateClozeMarkers({ opening: '{{', closing: '}}' })).toBeNull();
    saveClozeMarkers(ownerId, { opening: '{{', closing: '}}' });
    expect(readClozeMarkers(ownerId)).toEqual({ opening: '{{', closing: '}}' });
    expect(readClozeMarkers(crypto.randomUUID())).toEqual(DEFAULT_CLOZE_MARKERS);
  });
});

it('capte les raccourcis et refuse les collisions avec le navigateur', () => {
  expect(validateShortcuts(DEFAULT_EDITOR_SHORTCUTS)).toBeNull();
  expect(
    shortcutFromEvent({ key: 'K', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false }),
  ).toBe('Mod-Shift-k');
  expect(
    shortcutFromEvent({
      key: 'Enter',
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: true,
    }),
  ).toBe('Alt-Enter');
  expect(validateShortcuts({ create: 'Mod-s', link: 'Mod-Shift-l', edit: 'Alt-Enter' })).toContain(
    'réservé',
  );
  expect(
    validateShortcuts({ create: 'Alt-Enter', link: 'Alt-Enter', edit: 'Mod-Shift-l' }),
  ).toContain('différente');
});
