import { Extension } from '@tiptap/core';
import { Plugin, type Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';

export type ClozeMarkerSettings = { opening: string; closing: string };
export const DEFAULT_CLOZE_MARKERS: ClozeMarkerSettings = { opening: '<<', closing: '>>' };
const SETTINGS_PREFIX = 'bouche-cloze-markers-v1-';

export function validateClozeMarkers(settings: ClozeMarkerSettings): string | null {
  const valid = (part: string) =>
    part.length >= 1 &&
    part.length <= 8 &&
    !/[\s\\\uFFFC]/u.test(part);
  if (!valid(settings.opening) || !valid(settings.closing))
    return 'Utilisez entre 1 et 8 caractères, sans espace ni antislash.';
  if (
    settings.opening === settings.closing ||
    settings.opening.includes(settings.closing) ||
    settings.closing.includes(settings.opening)
  )
    return 'Les deux balises doivent être distinctes et ne pas se contenir.';
  return null;
}

export function readClozeMarkers(ownerId: string): ClozeMarkerSettings {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_PREFIX + ownerId) || 'null');
    if (
      value &&
      typeof value.opening === 'string' &&
      typeof value.closing === 'string' &&
      !validateClozeMarkers(value)
    )
      return { opening: value.opening, closing: value.closing };
  } catch {
    // Private browsing may disable storage.
  }
  return { ...DEFAULT_CLOZE_MARKERS };
}

export function saveClozeMarkers(ownerId: string, settings: ClozeMarkerSettings): void {
  const error = validateClozeMarkers(settings);
  if (error) throw new Error(error);
  localStorage.setItem(SETTINGS_PREFIX + ownerId, JSON.stringify(settings));
}

function escaped(text: string, offset: number): boolean {
  let slashes = 0;
  for (let i = offset - 1; i >= 0 && text[i] === '\\'; i--) slashes++;
  return slashes % 2 === 1;
}

export type ClozeMarkerPair = { open: number; contentStart: number; contentEnd: number; end: number };

/** Pure parser, shared by typing and paste; it never reads or changes the editor. */
export function findClozeMarkerPairs(text: string, settings: ClozeMarkerSettings): ClozeMarkerPair[] {
  if (validateClozeMarkers(settings)) return [];
  const pairs: ClozeMarkerPair[] = [];
  const { opening, closing } = settings;
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf(opening, cursor);
    if (open === -1) break;
    if (escaped(text, open)) {
      cursor = open + opening.length;
      continue;
    }
    let contentEnd = text.indexOf(closing, open + opening.length);
    while (contentEnd !== -1 && escaped(text, contentEnd))
      contentEnd = text.indexOf(closing, contentEnd + closing.length);
    if (contentEnd === -1) break;
    const contentStart = open + opening.length;
    const middle = text.slice(contentStart, contentEnd);
    if (middle.trim() && !middle.includes('\uFFFC') && !middle.includes(opening)) {
      pairs.push({ open, contentStart, contentEnd, end: contentEnd + closing.length });
      cursor = contentEnd + closing.length;
    } else {
      // Do not partially convert ambiguous nested or empty delimiters.
      cursor = contentEnd + closing.length;
    }
  }
  return pairs;
}

type Match = { openStart: number; openEnd: number; closeStart: number; closeEnd: number };

/** Map character positions to document positions even across differently styled text runs. */
function matchesInBlocks(
  doc: PMNode,
  from: number,
  to: number,
  settings: ClozeMarkerSettings,
  closingAt?: number,
): Match[] {
  const matches: Match[] = [];
  const visited = new Set<number>();
  const left = Math.max(0, Math.min(from, doc.content.size));
  const right = Math.max(left, Math.min(doc.content.size, to));
  doc.nodesBetween(left, right, (node, pos) => {
    if (!node.isTextblock) return true;
    if (visited.has(pos)) return false;
    visited.add(pos);
    if (!node.type.allowsMarkType(doc.type.schema.marks.memoryAnchor)) return false;
    let text = '';
    const positions: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        const chunk = child.text || '';
        text += chunk;
        for (let i = 0; i < chunk.length; i++) positions.push(pos + 1 + offset + i);
      } else {
        text += '\uFFFC';
        positions.push(-1);
      }
    });
    for (const pair of findClozeMarkerPairs(text, settings)) {
      const openStart = positions[pair.open];
      const closeStart = positions[pair.contentEnd];
      const closeEnd = positions[pair.end - 1] + 1;
      if (openStart < 0 || closeStart < 0 || closeEnd < 1) continue;
      if (closingAt !== undefined && closeEnd !== closingAt) continue;
      let overlap = false;
      doc.nodesBetween(openStart, closeEnd, (child) => {
        if (child.isInline && child.marks.some((m) => m.type.name === 'memoryAnchor'))
          overlap = true;
      });
      if (overlap) continue;
      matches.push({
        openStart,
        openEnd: positions[pair.contentStart - 1] + 1,
        closeStart,
        closeEnd,
      });
    }
    return false;
  });
  return matches;
}

function applyMarkerMatches(tr: Transaction, matches: Match[]): boolean {
  if (!matches.length) return false;
  for (const match of [...matches].sort((a, b) => b.openStart - a.openStart)) {
    const id = crypto.randomUUID();
    tr.delete(match.closeStart, match.closeEnd);
    tr.delete(match.openStart, match.openEnd);
    tr.addMark(
      match.openStart,
      match.closeStart - (match.openEnd - match.openStart),
      tr.doc.type.schema.marks.memoryAnchor.create({
        id,
        sourceId: null,
        hint: '',
        priority: 'medium',
        initialDifficulty: 'unrated',
      }),
    );
  }
  return true;
}

/** Input and paste conversions are editor transactions, not HTML rewrites. */
export function clozeMarkerExtension(settingsRef: { current: ClozeMarkerSettings }) {
  return Extension.create({
    name: 'clozeMarkerInput',
    priority: 1100,
    addProseMirrorPlugins() {
      return [
        new Plugin({
          props: {
            handleTextInput(view, from, to, text) {
              if (!view.editable || view.composing) return false;
              const settings = settingsRef.current;
              if (
                validateClozeMarkers(settings) ||
                !text.endsWith(settings.closing.slice(-1))
              )
                return false;
              const tr = view.state.tr.insertText(text, from, to);
              const cursor = from + text.length;
              const matches = matchesInBlocks(
                tr.doc,
                Math.max(0, cursor - 1),
                cursor,
                settings,
                cursor,
              );
              if (!applyMarkerMatches(tr, matches)) return false;
              view.dispatch(tr.scrollIntoView());
              return true;
            },
          },
          appendTransaction(transactions, _oldState, state) {
            const pastes = transactions.filter(
              (tr) => tr.docChanged && (tr.getMeta('paste') || tr.getMeta('uiEvent') === 'paste'),
            );
            if (!pastes.length || validateClozeMarkers(settingsRef.current)) return null;
            const matches = new Map<number, Match>();
            for (const pasted of pastes) {
              pasted.mapping.maps.forEach((map) => {
                map.forEach((_oldStart, _oldEnd, start, end) => {
                  const found = matchesInBlocks(
                    state.doc,
                    Math.max(0, start - 1),
                    Math.min(state.doc.content.size, end + 1),
                    settingsRef.current,
                  );
                  for (const match of found) matches.set(match.openStart, match);
                });
              });
            }
            const tr = state.tr;
            return applyMarkerMatches(tr, [...matches.values()]) ? tr : null;
          },
        }),
      ];
    },
  });
}
