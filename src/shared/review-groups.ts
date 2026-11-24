import { extractAnchors, type RichNode } from './document';
import type { MemoryPassage } from './learning';

/** A link is an explicit UUID stored on each individual memory mark.
 * The founding passage is the canonical grade whenever it still exists.
 */
export function reviewGroups(content: RichNode) {
  const anchors = extractAnchors(content);
  const byId = new Map(anchors.map((a) => [a.id, a]));
  const members = new Map<string, string[]>();
  for (const anchor of anchors) {
    const key = anchor.groupId || anchor.id;
    const group = members.get(key) || [];
    group.push(anchor.id);
    members.set(key, group);
  }
  const keys = new Map<string, string>();
  const leaders = new Map<string, string>();
  for (const [key, ids] of members) {
    const leader = ids.includes(key) ? key : ids[0];
    for (const id of ids) {
      keys.set(id, key);
      leaders.set(id, leader);
    }
  }
  return { byId, members, keys, leaders };
}

export function linkedMembers(
  content: RichNode,
  id: string,
): {
  ids: string[];
  leaderId: string;
  groupId?: string;
} {
  const groups = reviewGroups(content);
  const anchor = groups.byId.get(id);
  if (!anchor) return { ids: [id], leaderId: id };
  const key = groups.keys.get(id)!;
  return {
    ids: groups.members.get(key)!,
    leaderId: groups.leaders.get(id)!,
    ...(anchor.groupId ? { groupId: anchor.groupId } : {}),
  };
}

export function enrichReviewPassages(
  content: RichNode,
  rows: Array<Omit<MemoryPassage, 'status'> & { status: string }>,
): Array<Omit<MemoryPassage, 'status'> & { status: string }> {
  const groups = reviewGroups(content);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const needsReview = new Map(
    [...groups.members].map(([key, ids]) => [
      key,
      ids.some((id) => byId.get(id)?.status === 'needs_review'),
    ]),
  );
  return rows.map((p) => {
    const anchor = groups.byId.get(p.id);
    const leaderId = groups.leaders.get(p.id) || p.id;
    const leader = byId.get(leaderId) || p;
    const requiresCheck = needsReview.get(groups.keys.get(p.id) || p.id) || false;
    return {
      ...p,
      ...(anchor?.groupId ? { groupId: anchor.groupId } : {}),
      difficulty: leader.difficulty,
      difficultyRevision: leader.difficultyRevision,
      ...(requiresCheck ? { status: 'needs_review' as const } : {}),
    };
  });
}
