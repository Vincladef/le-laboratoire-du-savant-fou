import { describe, it, expect } from 'vitest';
import { addTab, readTabs, writeTabs, removeTab, tabDepth } from '../src/shared/tabs';
import {
  validateDocument,
  extractAnchors,
  plainText,
  type RichNode,
  defaultLayout,
} from '../src/shared/document';
import { makeDocx } from '../src/editor/docx-export';
import { unzipSync, strFromU8 } from 'fflate';
const id = crypto.randomUUID();
const legacy: RichNode = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Une réponse',
          marks: [
            { type: 'bold' },
            { type: 'memoryAnchor', attrs: { id, hint: 'Indice', priority: 'high' } },
          ],
        },
      ],
    },
  ],
};
describe('Onglets persistants, sans réécrire les anciens documents', () => {
  it('conserve exactement le contrat historique tant qu’un onglet n’est pas ajouté', () => {
    expect(writeTabs(readTabs(legacy))).toEqual(legacy);
  });
  it('ajoute des onglets et sous-onglets sans toucher au texte ou aux annotations', () => {
    let tabs = addTab(readTabs(legacy));
    tabs = addTab(tabs, tabs[1].id);
    tabs = addTab(tabs, tabs[2].id);
    const full = validateDocument(writeTabs(tabs));
    expect(readTabs(full)).toEqual(tabs);
    expect(extractAnchors(full)).toHaveLength(1);
    expect(plainText(full)).toContain('Une réponse');
    expect(tabDepth(tabs, tabs[3].id)).toBe(2);
    expect(() => addTab(tabs, tabs[3].id)).toThrow();
    expect(removeTab(tabs, tabs[1].id)).toHaveLength(1);
    expect(() => removeTab(readTabs(legacy), 'main')).toThrow();
  });
  it('duplique le style et l’indice avec une nouvelle identité, pas le calendrier FSRS', () => {
    const tabs = addTab(readTabs(legacy), null, 'main');
    const anchors = extractAnchors(validateDocument(writeTabs(tabs)));
    expect(anchors).toHaveLength(2);
    expect(anchors[1]).toMatchObject({
      sourceId: id,
      hint: 'Indice',
      priority: 'high',
      quote: 'Une réponse',
    });
    expect(anchors[1].id).not.toBe(id);
    expect(tabs[1].content.content?.[0].content?.[0].marks?.some((m) => m.type === 'bold')).toBe(
      true,
    );
  });
  it('rejette cycles, identités dupliquées, parents absents, onglets imbriqués et documents mixtes', () => {
    const full = writeTabs(addTab(readTabs(legacy)));
    for (const mutate of [
      (x: RichNode) => {
        x.content![1].attrs!.id = 'main';
      },
      (x: RichNode) => {
        x.content![1].attrs!.parentId = crypto.randomUUID();
      },
      (x: RichNode) => {
        x.content![0].attrs!.parentId = x.content![1].attrs!.id;
        x.content![1].attrs!.parentId = 'main';
      },
      (x: RichNode) => {
        x.content![0].content = [x.content![1]];
      },
      (x: RichNode) => {
        x.content!.push({ type: 'paragraph' });
      },
    ]) {
      const bad = structuredClone(full);
      mutate(bad);
      expect(() => validateDocument(bad)).toThrow();
    }
  });
  it('exporte le contenu de tous les onglets dans Word', async () => {
    const tabs = addTab(readTabs(legacy));
    tabs[1].content = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Deuxième onglet conservé' }] },
      ],
    };
    const blob = await makeDocx('Onglets', writeTabs(tabs), defaultLayout);
    const zip = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const xml = strFromU8(zip['word/document.xml']);
    expect(xml).toContain('Une réponse');
    expect(xml).toContain('Deuxième onglet conservé');
    expect(xml).toContain('Onglet 2');
  });
});
