import type { Editor } from '@tiptap/core';
import type { Difficulty, Priority } from '../shared/learning';
import { extractAnchors, type RichNode } from '../shared/document';
/** Validate a genuinely new annotation, never a fragment already masked. */
function validateNewPassageSelection(editor: Editor, linking = false) {
  const { from, to, empty } = editor.state.selection;
  if (empty || !editor.state.doc.textBetween(from, to, '\n', '\ufffc').trim())
    throw new Error(
      linking
        ? 'Sélectionnez le texte à transformer en trou lié.'
        : 'Sélectionnez le passage à mémoriser.',
    );
  return { from, to };
}
export function createPassage(
  editor: Editor,
  hint: string,
  priority: Priority,
  initialDifficulty: Difficulty = 'unrated',
  groupId: string | null = null,
) {
  const { from, to } = validateNewPassageSelection(editor, true);
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
        groupId,
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
  const anchors = extractAnchors(editor.getJSON() as RichNode);
  const anchor = anchors.find((a) => a.id === id);
  const ids = new Set(
    attributes && anchor?.groupId
      ? anchors.filter((a) => a.groupId === anchor.groupId).map((a) => a.id)
      : [id],
  );
  editor.state.doc.descendants((node, pos) => {
    const mark = node.marks.find((m) => m.type.name === 'memoryAnchor' && ids.has(m.attrs.id));
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

/** Link two distinct marked passages without fusing their content or reusing an ID.
 * The first selected passage supplies the group's hint/priority. Existing groups
 * can be merged by explicitly choosing their members.
 */
export function linkPassages(editor: Editor, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new Error('Choisissez un autre trou à associer.');
  const passages = extractAnchors(editor.getJSON() as RichNode);
  const source = passages.find((a) => a.id === sourceId);
  const target = passages.find((a) => a.id === targetId);
  if (!source || !target) throw new Error('Un des trous a disparu du document.');
  const groupId = source.groupId || source.id;
  const linked = new Set(
    passages
      .filter(
        (a) =>
          a.id === source.id ||
          a.id === target.id ||
          (source.groupId && a.groupId === source.groupId) ||
          (target.groupId && a.groupId === target.groupId),
      )
      .map((a) => a.id),
  );
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    const mark = node.marks.find((m) => m.type.name === 'memoryAnchor');
    if (!mark || !linked.has(mark.attrs.id)) return;
    tr.removeMark(pos, pos + node.nodeSize, mark);
    tr.addMark(
      pos,
      pos + node.nodeSize,
      mark.type.create({
        ...mark.attrs,
        groupId,
        hint: source.hint ?? '',
        priority: source.priority ?? 'medium',
        initialDifficulty: source.initialDifficulty ?? 'unrated',
      }),
    );
  });
  editor.view.dispatch(tr);
  return { groupId, memberCount: linked.size };
}

/** One editor transaction: either the new mark and its source are linked, or
 * neither is modified. This is important for autosave and keyboard/touch input.
 */
export function createLinkedPassage(editor: Editor, sourceId: string) {
  const source = extractAnchors(editor.getJSON() as RichNode).find((a) => a.id === sourceId);
  if (!source) throw new Error('Le trou de référence a disparu. Rechargez le document.');
  const { from, to } = validateNewPassageSelection(editor, true);
  let overlap = false,
    unsupported = false,
    count = 0;
  editor.state.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!node.isInline || pos + node.nodeSize <= from || pos >= to) return;
    if (node.marks.some((m) => m.type.name === 'memoryAnchor')) overlap = true;
    if (parent && !parent.type.allowsMarkType(editor.schema.marks.memoryAnchor)) unsupported = true;
    if (node.isText || node.type.name === 'inlineMath') count++;
  });
  if (overlap)
    throw new Error(
      'Ce texte contient déjà un trou. Sélectionnez-le pour l’associer, ou choisissez du texte neuf.',
    );
  if (unsupported || !count)
    throw new Error('Sélectionnez du texte éditable pour créer le trou lié.');
  const groupId = source.groupId || source.id;
  const id = crypto.randomUUID();
  const tr = editor.state.tr;
  if (!source.groupId) {
    editor.state.doc.descendants((node, pos) => {
      const mark = node.marks.find(
        (m) => m.type.name === 'memoryAnchor' && m.attrs.id === source.id,
      );
      if (!mark) return;
      tr.removeMark(pos, pos + node.nodeSize, mark);
      tr.addMark(pos, pos + node.nodeSize, mark.type.create({ ...mark.attrs, groupId }));
    });
  }
  tr.addMark(
    from,
    to,
    editor.schema.marks.memoryAnchor.create({
      id,
      sourceId: null,
      groupId,
      hint: source.hint || '',
      priority: source.priority || 'medium',
      initialDifficulty: source.initialDifficulty || 'unrated',
    }),
  );
  editor.view.dispatch(tr);
  return id;
}

export function unlinkPassage(editor: Editor, id: string) {
  const passages = extractAnchors(editor.getJSON() as RichNode);
  const source = passages.find((a) => a.id === id);
  if (!source?.groupId) return;
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    const mark = node.marks.find((m) => m.type.name === 'memoryAnchor' && m.attrs.id === id);
    if (!mark) return;
    tr.removeMark(pos, pos + node.nodeSize, mark);
    tr.addMark(pos, pos + node.nodeSize, mark.type.create({ ...mark.attrs, groupId: null }));
  });
  editor.view.dispatch(tr);
}
