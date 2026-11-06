import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import type { DocumentTab } from '../shared/tabs';
import { type RichNode } from '../shared/document';
import { validateHoles, type AiHole, type AiSource } from '../shared/ai';

export type SourceRange = AiSource & { tabId: string; from: number; to: number };
// ProseMirror and JavaScript both count UTF-16 code units. Split at atoms, line breaks
// and existing annotations, while keeping adjacent runs of differently styled text together.
export function collectSources(
  doc: ProseMirrorNode,
  tabId: string,
  selection?: { from: number; to: number },
  includeAnnotated = false,
): SourceRange[] {
  const result: SourceRange[] = [];
  doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return;
    let current: SourceRange | null = null;
    block.forEach((node, offset) => {
      const start = blockPos + 1 + offset;
      const from = Math.max(start, selection?.from ?? 0);
      const to = Math.min(start + node.nodeSize, selection?.to ?? doc.content.size);
      if (
        !node.isText ||
        (!includeAnnotated && node.marks.some((m) => m.type.name === 'memoryAnchor')) ||
        to <= from
      ) {
        current = null;
        return;
      }
      const text = node.text!.slice(from - start, to - start);
      if (current && current.to === from) {
        current.text += text;
        current.to = to;
      } else {
        current = { id: `${tabId}:${result.length}`, tabId, text, from, to };
        result.push(current);
      }
    });
    return false;
  });
  return result.filter((s) => s.text.trim());
}
export function annotateTransaction(
  state: EditorState,
  tabId: string,
  sources: SourceRange[],
  holes: AiHole[],
) {
  const ranges = validateHoles(holes, sources);
  const tr = state.tr;
  holes.forEach((hole, i) => {
    const source = sources.find((s) => s.id === hole.sourceId)!;
    if (source.tabId !== tabId) return;
    tr.addMark(
      source.from + ranges[i].from,
      source.from + ranges[i].to,
      state.schema.marks.memoryAnchor.create({
        id: crypto.randomUUID(),
        sourceId: null,
        hint: hole.hint,
        priority: hole.priority,
        initialDifficulty: hole.difficulty,
      }),
    );
  });
  return tr;
}
export function annotateTabs(
  schema: Schema,
  tabs: DocumentTab[],
  sources: SourceRange[],
  holes: AiHole[],
) {
  return tabs.map((tab) => {
    const state = EditorState.create({ schema, doc: schema.nodeFromJSON(tab.content) });
    return {
      ...tab,
      content: annotateTransaction(state, tab.id, sources, holes).doc.toJSON() as RichNode,
    };
  });
}
export function generatedDocument(schema: Schema, text: string, holes: AiHole[]) {
  validateHoles(holes, [{ id: 'generated', text }]);
  const doc = schema.nodeFromJSON({
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  });
  const tr = EditorState.create({ schema, doc }).tr;
  const ranges = validateHoles(holes, [{ id: 'generated', text }]);
  // A paragraph boundary takes two ProseMirror positions and one newline in plain text.
  holes.forEach((hole, i) => {
    const start = ranges[i].from;
    const lineCount = text.slice(0, start).split('\n').length - 1;
    const from = start + lineCount + 1;
    tr.addMark(
      from,
      from + hole.quote.length,
      schema.marks.memoryAnchor.create({
        id: crypto.randomUUID(),
        sourceId: null,
        hint: hole.hint,
        priority: hole.priority,
        initialDifficulty: hole.difficulty,
      }),
    );
  });
  return tr.doc;
}
