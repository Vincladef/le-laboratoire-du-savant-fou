// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../src/editor/extensions';
import { collectSources, annotateTabs, generatedDocument } from '../src/editor/ai-document';
import { extractAnchors, plainText, validateDocument, type RichNode } from '../src/shared/document';
import { aiRequestSchema, validateHoles, type AiHole } from '../src/shared/ai';
const hole = (sourceId: string, quote: string, occurrence = 1): AiHole => ({
  sourceId,
  quote,
  occurrence,
  hint: 'Indice',
  priority: 'medium',
  difficulty: 'unrated',
});
it('annote tous les onglets sans réécrire styles, liens, tableaux ou anciennes annotations', () => {
  const oldId = crypto.randomUUID();
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions(),
    content: `<p><strong>La </strong><em>cellule</em> et <span data-memory-id="${oldId}" data-memory-hint="Conserver">le noyau</span> 🧬 cellule.</p><table><tr><td><p><a href="https://example.com">Une membrane</a></p></td></tr></table>`,
  });
  const original = editor.getJSON() as RichNode;
  const tabs = [
    { id: 'main', title: 'A', parentId: null, content: original },
    { id: 'second', title: 'B', parentId: 'main', content: structuredClone(original) },
  ];
  const sources = tabs.flatMap((tab) =>
    collectSources(editor.schema.nodeFromJSON(tab.content), tab.id),
  );
  expect(sources.some((s) => s.text.includes('le noyau'))).toBe(false);
  const source = sources.find((s) => s.text.startsWith('La '))!;
  const second = sources.find((s) => s.tabId === 'second' && s.text.includes('membrane'))!;
  const next = annotateTabs(editor.schema, tabs, sources, [
    hole(source.id, 'La cellule'),
    hole(second.id, 'membrane'),
  ]);
  expect(next.map((t) => plainText(t.content))).toEqual(tabs.map((t) => plainText(t.content)));
  expect(extractAnchors(next[0].content).map((a) => a.quote)).toContain('La cellule');
  expect(extractAnchors(next[1].content).map((a) => a.quote)).toContain('membrane');
  expect(extractAnchors(next[0].content).find((a) => a.id === oldId)?.hint).toBe('Conserver');
  const withoutNewMarks = (node: RichNode): RichNode => ({
    ...node,
    ...(node.marks
      ? { marks: node.marks.filter((m) => m.type !== 'memoryAnchor' || m.attrs?.id === oldId) }
      : {}),
    ...(node.content ? { content: node.content.map(withoutNewMarks) } : {}),
  });
  expect(withoutNewMarks(next[0].content)).toEqual(withoutNewMarks(original));
  editor.destroy();
});
it('limite une sélection multistyle et positionne les réponses Unicode et répétées exactement', () => {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions(),
    content: '<p>🧬 cellule et <b>cellule</b>.</p>',
  });
  const sources = collectSources(editor.state.doc, 'main', { from: 4, to: 22 });
  expect(sources[0].text).toBe('cellule et cellule');
  const next = annotateTabs(
    editor.schema,
    [{ id: 'main', title: 'A', parentId: null, content: editor.getJSON() as RichNode }],
    sources,
    [hole(sources[0].id, 'cellule', 2)],
  );
  expect(extractAnchors(next[0].content)[0].quote).toBe('cellule');
  const doc = editor.schema.nodeFromJSON(next[0].content);
  let start = 0;
  doc.descendants((node, pos) => {
    if (node.marks.some((m) => m.type.name === 'memoryAnchor')) start = pos;
  });
  expect(start).toBe(15);
  editor.destroy();
});
it('convertit le texte généré en paragraphes sûrs et trous natifs, sans interpréter le HTML', () => {
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: editorExtensions(),
  });
  const text = '🧬 cellule\n\n<script>alert(1)</script> et noyau.';
  const doc = generatedDocument(editor.schema, text, [hole('generated', 'noyau')]);
  validateDocument(doc.toJSON());
  expect(extractAnchors(doc.toJSON())[0].quote).toBe('noyau');
  expect(plainText(doc.toJSON())).toContain('<script>');
  expect(doc.content.childCount).toBe(3);
  editor.destroy();
});
it('refuse sources trop longues, réponses inventées, chevauchements et occurrences invalides', () => {
  const input = {
    mode: 'cloze',
    instructions: '',
    count: 5,
    length: 'short',
    priority: 'medium',
    difficulty: 'unrated',
    sources: [{ id: 'a', text: 'cellule cellule' }],
  };
  expect(
    aiRequestSchema.safeParse({ ...input, sources: [{ id: 'a', text: 'a'.repeat(30001) }] })
      .success,
  ).toBe(false);
  expect(() => validateHoles([hole('a', 'cellule', 3)], input.sources)).toThrow();
  expect(() => validateHoles([hole('a', 'inventé')], input.sources)).toThrow();
  expect(() =>
    validateHoles([hole('a', 'cellule'), hole('a', 'cellule cellule')], input.sources),
  ).toThrow('chevauchent');
});
