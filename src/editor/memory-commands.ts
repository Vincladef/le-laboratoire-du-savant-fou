import type { Editor } from '@tiptap/core';
import type { Difficulty, Priority } from '../shared/learning';
export function createPassage(
  editor: Editor,
  hint: string,
  priority: Priority,
  initialDifficulty: Difficulty = 'unrated',
) {
  const { from, to, empty } = editor.state.selection;
  if (empty || !editor.state.doc.textBetween(from, to, '\n', '\ufffc').trim())
    throw new Error('Sélectionnez le passage à mémoriser.');
  let overlap = false,
    unsupported = false,
    count = 0;
  editor.state.doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (!node.isInline) return;
    if (node.marks.some((m) => m.type.name === 'memoryAnchor')) overlap = true;
    if (parent && !parent.type.allowsMarkType(editor.schema.marks.memoryAnchor)) unsupported = true;
    if (node.isText || node.type.name === 'inlineMath') count++;
  });
  if (overlap)
    throw new Error(
      'Cette sélection chevauche un passage existant. Modifiez ce passage ou choisissez une autre sélection.',
    );
  if (unsupported || !count)
    throw new Error(
      'Cette sélection ne peut pas recevoir une annotation. Sélectionnez son texte éditable.',
    );
  const id = crypto.randomUUID();
  editor.view.dispatch(
    editor.state.tr.addMark(
      from,
      to,
      editor.schema.marks.memoryAnchor.create({
        id,
        sourceId: null,
        hint,
        priority,
        initialDifficulty,
      }),
    ),
  );
  return id;
}
export function modifyPassage(
  editor: Editor,
  id: string,
  attributes: { hint: string; priority: Priority } | null,
) {
  const tr = editor.state.tr;
  let found = false;
  editor.state.doc.descendants((node, pos) => {
    const mark = node.marks.find((m) => m.type.name === 'memoryAnchor' && m.attrs.id === id);
    if (!mark) return;
    found = true;
    tr.removeMark(pos, pos + node.nodeSize, mark);
    if (attributes)
      tr.addMark(pos, pos + node.nodeSize, mark.type.create({ ...mark.attrs, ...attributes }));
  });
  if (!found) throw new Error('Ce passage n’existe plus dans le document.');
  editor.view.dispatch(tr);
}
export function selectPassage(editor: Editor, id: string) {
  let from = Infinity,
    to = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.marks.some((m) => m.type.name === 'memoryAnchor' && m.attrs.id === id)) {
      from = Math.min(from, pos);
      to = Math.max(to, pos + node.nodeSize);
    }
  });
  if (!to) return;
  editor.chain().focus().setTextSelection({ from, to }).scrollIntoView().run();
}
