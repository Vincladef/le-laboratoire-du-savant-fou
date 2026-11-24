/** Stable visual identity for linked passages. Never rely on document order
 * or an array index: colors should survive edits and revision restarts.
 */
export function groupTone(groupId: string) {
  let hash = 2166136261;
  for (const character of groupId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 6;
}
