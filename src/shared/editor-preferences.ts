import { z } from 'zod';

export const markerSchema = z
  .object({
    opening: z.string().min(1).max(8),
    closing: z.string().min(1).max(8),
  })
  .strict();
export const shortcutSchema = z
  .object({
    create: z.string().max(32),
    link: z.string().max(32),
    edit: z.string().max(32),
  })
  .strict();
export const editorPreferencesSchema = z
  .object({
    markers: markerSchema,
    shortcuts: shortcutSchema,
  })
  .strict();
export type EditorShortcuts = z.infer<typeof shortcutSchema>;
export const DEFAULT_EDITOR_SHORTCUTS: EditorShortcuts = {
  create: 'Mod-Shift-m',
  link: 'Mod-Shift-l',
  edit: 'Alt-Enter',
};
const reserved = new Set([
  'Mod-b',
  'Mod-i',
  'Mod-u',
  'Mod-z',
  'Mod-y',
  'Mod-s',
  'Mod-f',
  'Mod-h',
  'Mod-p',
  'Mod-r',
  'Mod-l',
  'Mod-w',
  'Mod-t',
  'Mod-n',
  'Mod-Enter',
  'Alt-F4',
  'Alt-Left',
  'Alt-Right',
]);
export function validateShortcuts(shortcuts: EditorShortcuts): string | null {
  const combos = Object.values(shortcuts);
  for (const value of combos) {
    if (!/^(?:(?:Mod(?:-Shift)?(?:-Alt)?)|(?:Alt(?:-Shift)?))-(?:[a-z0-9]|Enter)$/i.test(value))
      return 'Utilisez Ctrl/⌘ ou Alt avec une lettre, un chiffre ou Entrée.';
    if (reserved.has(value)) return 'Ce raccourci est réservé au navigateur ou à l’éditeur.';
  }
  if (new Set(combos).size !== combos.length)
    return 'Chaque action doit posséder une combinaison différente.';
  return null;
}
export function shortcutFromEvent(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): string | null {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!/^(?:[a-z0-9]|Enter)$/.test(key)) return null;
  if (!event.ctrlKey && !event.metaKey && !event.altKey) return null;
  const prefix = [
    ...(event.ctrlKey || event.metaKey ? ['Mod'] : []),
    ...(event.shiftKey ? ['Shift'] : []),
    ...(event.altKey ? ['Alt'] : []),
  ];
  return [...prefix, key].join('-');
}
export function shortcutLabel(shortcut: string) {
  return shortcut.replace('Mod', 'Ctrl/⌘').replaceAll('-', ' + ').replace('Shift', 'Maj');
}
