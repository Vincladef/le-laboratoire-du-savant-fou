import { copyWithNewAnchors, emptyDocument, type RichNode } from './document';

export type DocumentTab = { id: string; title: string; parentId: string | null; content: RichNode };
export function readTabs(content: RichNode): DocumentTab[] {
  if (content.content?.[0]?.type !== 'documentTab')
    return [{ id: 'main', title: 'Onglet 1', parentId: null, content }];
  return content.content.map((node) => ({
    id: node.attrs!.id,
    title: node.attrs!.title,
    parentId: node.attrs!.parentId || null,
    content: { type: 'doc', content: node.content },
  }));
}
export function writeTabs(tabs: DocumentTab[]): RichNode {
  if (tabs.length === 1 && tabs[0].id === 'main') return tabs[0].content;
  return {
    type: 'doc',
    content: tabs.map((tab) => ({
      type: 'documentTab',
      attrs: { id: tab.id, title: tab.title, parentId: tab.parentId },
      content: tab.content.content,
    })),
  };
}
export function tabDepth(tabs: DocumentTab[], id: string): number {
  let depth = 0,
    tab = tabs.find((t) => t.id === id);
  const visited = new Set<string>();
  while (tab?.parentId) {
    if (visited.has(tab.id)) throw new Error('Cycle entre onglets.');
    visited.add(tab.id);
    depth++;
    tab = tabs.find((t) => t.id === tab!.parentId);
  }
  return depth;
}
export function addTab(
  tabs: DocumentTab[],
  parentId: string | null = null,
  sourceId?: string,
): DocumentTab[] {
  if (tabs.length >= 100) throw new Error('Ce document contient déjà 100 onglets.');
  if (parentId && (!tabs.some((t) => t.id === parentId) || tabDepth(tabs, parentId) >= 2))
    throw new Error('Les onglets sont limités à trois niveaux.');
  const source = tabs.find((t) => t.id === sourceId);
  const tab: DocumentTab = {
    id: crypto.randomUUID(),
    title: source ? `${source.title.slice(0, 90)} (copie)` : `Onglet ${tabs.length + 1}`,
    parentId,
    content: source ? copyWithNewAnchors(source.content) : structuredClone(emptyDocument),
  };
  const next = [...tabs];
  if (parentId) {
    const descendants = new Set([parentId]);
    let index = next.findIndex((t) => t.id === parentId) + 1;
    while (index < next.length && next[index].parentId && descendants.has(next[index].parentId!)) {
      descendants.add(next[index].id);
      index++;
    }
    next.splice(index, 0, tab);
  } else next.push(tab);
  return next;
}
export function removeTab(tabs: DocumentTab[], id: string): DocumentTab[] {
  const removed = new Set([id]);
  for (let i = 0; i < tabs.length; i++)
    for (const t of tabs) if (t.parentId && removed.has(t.parentId)) removed.add(t.id);
  const next = tabs.filter((t) => !removed.has(t.id));
  if (!next.length) throw new Error('Conservez au moins un onglet dans le document.');
  return next;
}
