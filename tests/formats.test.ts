import { it, expect } from 'vitest';
import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import mammoth from 'mammoth';
import { makeDocx } from '../src/editor/docx-export';
import { inspectDocxArchive } from '../src/editor/docx-safety';
import { defaultLayout } from '../src/shared/document';
it('génère un DOCX réel avec titres, styles, tableaux, liens et sauts de page', async () => {
  const blob = await makeDocx(
    'Carnet',
    {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Recherche' }] },
        {
          type: 'paragraph',
          attrs: { textAlign: 'center', lineHeight: '2', indent: 1 },
          content: [
            {
              type: 'text',
              text: 'Mesure',
              marks: [
                { type: 'bold' },
                {
                  type: 'textStyle',
                  attrs: { fontFamily: 'Georgia', fontSize: '18pt', color: '#123456' },
                },
              ],
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Source',
              marks: [{ type: 'link', attrs: { href: 'https://example.org' } }],
            },
          ],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cellule' }] }],
                },
              ],
            },
          ],
        },
        { type: 'pageBreak' },
        { type: 'blockMath', attrs: { latex: 'E=mc^2' } },
      ],
    },
    defaultLayout,
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  inspectDocxArchive(bytes);
  const archive = unzipSync(bytes);
  const xml = strFromU8(archive['word/document.xml']);
  expect(xml).toContain('w:before="0"');
  expect(xml).toContain('w:after="0"');
  expect(strFromU8(archive['word/styles.xml'])).toContain('w:sz w:val="22"');
  expect(xml).toContain('Recherche');
  expect(xml).toContain('w:tbl');
  expect(xml).toContain('w:type="page"');
  expect(xml).toContain('123456');
  expect(xml).toContain('w:sz w:val="36"');
  expect(xml).toContain('E=mc^2');
  const imported = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  expect(imported.value).toContain('<h1>Recherche</h1>');
  expect(imported.value).toContain('<strong>Mesure</strong>');
  expect(imported.value).toContain('https://example.org');
  expect(imported.value).toContain('Cellule');
});
it('rejette les archives non DOCX et les bombes ZIP avant décompression', () => {
  expect(() => inspectDocxArchive(zipSync({ 'other.txt': strToU8('not a document') }))).toThrow(
    'Word valide',
  );
  const huge = zipSync({ 'word/document.xml': new Uint8Array(21 * 1024 * 1024) });
  expect(huge.byteLength).toBeLessThan(100000);
  expect(() => inspectDocxArchive(huge)).toThrow('limites');
});
