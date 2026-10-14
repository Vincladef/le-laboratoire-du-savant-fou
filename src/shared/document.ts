import { z } from 'zod';

export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, any>;
  marks?: { type: string; attrs?: Record<string, any> }[];
  content?: RichNode[];
};
export const emptyDocument: RichNode = { type: 'doc', content: [{ type: 'paragraph' }] };
export const layoutSchema = z.object({
  format: z.enum(['A4', 'Letter']),
  margin: z.number().min(10).max(40),
  landscape: z.boolean(),
});
export type PageLayout = z.infer<typeof layoutSchema>;
export const defaultLayout: PageLayout = { format: 'A4', margin: 20, landscape: false };
export const fonts = [
  'Arial',
  'Georgia',
  'Times New Roman',
  'Verdana',
  'Courier New',
  'Trebuchet MS',
];
const nodes = new Set([
  'doc',
  'paragraph',
  'heading',
  'text',
  'hardBreak',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'image',
  'horizontalRule',
  'codeBlock',
  'inlineMath',
  'blockMath',
  'pageBreak',
]);
const marks = new Set([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'link',
  'textStyle',
  'highlight',
  'memoryAnchor',
]);
const validId = (value: unknown) => z.string().uuid().safeParse(value).success;
export function isSafeLink(url: string) {
  return /^(https?:\/\/|mailto:)[^\s]+$/i.test(url) && !/[\u0000-\u001f]/.test(url);
}

/** Strict allowlist for persisted editor JSON, independent of untrusted HTML. */
export function validateDocument(value: unknown): RichNode {
  let count = 0;
  const visit = (node: any, depth: number) => {
    if (++count > 50000 || depth > 32 || !node || typeof node !== 'object' || !nodes.has(node.type))
      throw new Error('Structure documentaire invalide.');
    if (node.type === 'text' && (typeof node.text !== 'string' || !node.text.length))
      throw new Error('Texte invalide.');
    if (node.type !== 'text' && node.text !== undefined) throw new Error('Nœud texte invalide.');
    if (
      node.attrs !== undefined &&
      (!node.attrs || Array.isArray(node.attrs) || typeof node.attrs !== 'object')
    )
      throw new Error('Attributs invalides.');
    const a = node.attrs || {};
    if (a.textAlign && !['left', 'center', 'right', 'justify'].includes(a.textAlign))
      throw new Error('Alignement invalide.');
    if (a.lineHeight && !['1', '1.15', '1.5', '2', '2.5'].includes(String(a.lineHeight)))
      throw new Error('Interligne invalide.');
    if (a.indent !== undefined && (!Number.isInteger(a.indent) || a.indent < 0 || a.indent > 8))
      throw new Error('Retrait invalide.');
    if (node.type === 'heading' && ![1, 2, 3, 4, 5, 6].includes(a.level))
      throw new Error('Niveau de titre invalide.');
    if (node.type === 'image') {
      if (typeof a.src !== 'string' || !/^\/api\/assets\/[0-9a-f-]{36}$/i.test(a.src))
        throw new Error('Les images doivent être importées dans votre espace privé.');
      if (
        a.width != null &&
        (!Number.isFinite(Number(a.width)) || Number(a.width) < 20 || Number(a.width) > 1600)
      )
        throw new Error('Largeur d’image invalide.');
      if (
        a.height != null &&
        (!Number.isFinite(Number(a.height)) || Number(a.height) < 20 || Number(a.height) > 1600)
      )
        throw new Error('Hauteur d’image invalide.');
    }
    if (node.type === 'inlineMath' || node.type === 'blockMath')
      if (typeof a.latex !== 'string' || a.latex.length > 10000)
        throw new Error('Équation invalide.');
    for (const key of ['colspan', 'rowspan'])
      if (a[key] != null && (!Number.isInteger(a[key]) || a[key] < 1 || a[key] > 100))
        throw new Error('Tableau invalide.');
    if (node.marks !== undefined && !Array.isArray(node.marks))
      throw new Error('Mise en forme invalide.');
    for (const m of node.marks || []) {
      if (!marks.has(m.type)) throw new Error('Marque inconnue.');
      const ma = m.attrs || {};
      if (m.type === 'link' && (typeof ma.href !== 'string' || !isSafeLink(ma.href)))
        throw new Error('Lien non autorisé.');
      if (m.type === 'memoryAnchor' && (!validId(ma.id) || (ma.sourceId && !validId(ma.sourceId))))
        throw new Error('Identité de passage invalide.');
      for (const key of ['color', 'backgroundColor'])
        if (ma[key] && !/^(#[\da-f]{3,8}|rgb\([\d.,%\s]+\)|[a-z]{1,20})$/i.test(ma[key]))
          throw new Error('Couleur invalide.');
      if (ma.fontFamily && !fonts.includes(ma.fontFamily)) throw new Error('Police invalide.');
      if (ma.fontSize && !/^(?:[89]|[1-6]\d|7[0-2])(?:pt|px)$/.test(ma.fontSize))
        throw new Error('Taille de police invalide.');
    }
    if (node.content !== undefined && !Array.isArray(node.content))
      throw new Error('Contenu invalide.');
    const children: any[] = node.content || [];
    const inline = new Set(['text', 'hardBreak', 'inlineMath']);
    const blocks = new Set([
      'paragraph',
      'heading',
      'blockquote',
      'bulletList',
      'orderedList',
      'taskList',
      'table',
      'image',
      'horizontalRule',
      'codeBlock',
      'blockMath',
      'pageBreak',
    ]);
    const allowed =
      node.type === 'doc' || ['blockquote', 'tableCell', 'tableHeader'].includes(node.type)
        ? blocks
        : ['paragraph', 'heading'].includes(node.type)
          ? inline
          : node.type === 'codeBlock'
            ? new Set(['text'])
            : node.type === 'table'
              ? new Set(['tableRow'])
              : node.type === 'tableRow'
                ? new Set(['tableCell', 'tableHeader'])
                : ['bulletList', 'orderedList'].includes(node.type)
                  ? new Set(['listItem'])
                  : node.type === 'taskList'
                    ? new Set(['taskItem'])
                    : ['listItem', 'taskItem'].includes(node.type)
                      ? blocks
                      : new Set<string>();
    if (children.some((child) => !allowed.has(child.type)))
      throw new Error('Hiérarchie documentaire invalide.');
    if (
      [
        'table',
        'tableRow',
        'tableCell',
        'tableHeader',
        'bulletList',
        'orderedList',
        'taskList',
        'listItem',
        'taskItem',
        'blockquote',
      ].includes(node.type) &&
      !children.length
    )
      throw new Error('Structure documentaire incomplète.');
    if (['listItem', 'taskItem'].includes(node.type) && children[0]?.type !== 'paragraph')
      throw new Error('Un élément de liste doit commencer par un paragraphe.');
    if (
      a.colwidth != null &&
      (!Array.isArray(a.colwidth) ||
        a.colwidth.length > 100 ||
        a.colwidth.some((w: unknown) => !Number.isInteger(w) || Number(w) < 0 || Number(w) > 2000))
    )
      throw new Error('Largeur de colonne invalide.');
    if (a.start != null && (!Number.isInteger(a.start) || a.start < 1 || a.start > 1000000))
      throw new Error('Numérotation invalide.');
    if (a.checked != null && typeof a.checked !== 'boolean')
      throw new Error('Case à cocher invalide.');
    for (const child of node.content || []) visit(child, depth + 1);
  };
  if (JSON.stringify(value).length > 2_000_000)
    throw new Error('Ce document dépasse la limite de 2 Mo de texte structuré.');
  if ((value as any)?.type !== 'doc' || !(value as any)?.content?.length)
    throw new Error('Document vide ou invalide.');
  visit(value, 0);
  return value as RichNode;
}
export const contentSchema = z.unknown().transform((value, ctx) => {
  try {
    return validateDocument(value);
  } catch (e) {
    ctx.addIssue({ code: 'custom', message: (e as Error).message });
    return z.NEVER;
  }
});
export function plainText(node: RichNode): string {
  if (node.type === 'text') return node.text || '';
  if (node.type === 'inlineMath' || node.type === 'blockMath')
    return String(node.attrs?.latex || '');
  return (node.content || [])
    .map(plainText)
    .join(
      ['doc', 'bulletList', 'orderedList', 'taskList', 'table', 'tableRow'].includes(node.type)
        ? '\n'
        : '',
    );
}
export function assetIds(node: RichNode): string[] {
  return [
    ...new Set([
      ...(node.type === 'image' ? [String(node.attrs?.src).split('/').pop()!] : []),
      ...(node.content || []).flatMap(assetIds),
    ]),
  ];
}
export type Anchor = { id: string; sourceId?: string; quote: string; slices: RichNode[] };
export function extractAnchors(node: RichNode): Anchor[] {
  const result = new Map<string, Anchor>();
  const visit = (n: RichNode) => {
    for (const mark of n.marks || [])
      if (mark.type === 'memoryAnchor') {
        const id = mark.attrs!.id;
        const anchor: Anchor = result.get(id) || {
          id,
          sourceId: mark.attrs?.sourceId,
          quote: '',
          slices: [],
        };
        anchor.quote += n.text || '';
        anchor.slices.push(n);
        result.set(id, anchor);
      }
    n.content?.forEach(visit);
  };
  visit(node);
  return [...result.values()];
}
export type DocumentRecord = {
  id: string;
  ownerId: string;
  folderId: string | null;
  title: string;
  content: RichNode;
  layout: PageLayout;
  revision: number;
  cursor: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lastOpenedAt: string | null;
};
export function copyWithNewAnchors(content: RichNode): RichNode {
  const copy = structuredClone(content);
  const identities = new Map<string, string>();
  const visit = (node: RichNode) => {
    for (const mark of node.marks || [])
      if (mark.type === 'memoryAnchor') {
        const sourceId = mark.attrs!.id;
        if (!identities.has(sourceId)) identities.set(sourceId, crypto.randomUUID());
        mark.attrs = { id: identities.get(sourceId), sourceId };
      }
    node.content?.forEach(visit);
  };
  visit(copy);
  return copy;
}
export type DocumentSummary = Omit<DocumentRecord, 'content' | 'layout' | 'ownerId' | 'cursor'>;
export type FolderRecord = { id: string; name: string; parentId: string | null; updatedAt: string };
