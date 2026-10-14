import { describe, it, expect } from 'vitest';
import { Schema, Fragment, Slice } from '@tiptap/pm/model';
import { reidentifyPastedSlice, findMatches } from '../src/editor/extensions';
import { validateDocument, extractAnchors, plainText, type RichNode } from '../src/shared/document';
const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', group: 'block' },
    text: { group: 'inline' },
  },
  marks: { bold: {}, memoryAnchor: { attrs: { id: {}, sourceId: { default: null } } } },
});
describe('Contrat documentaire extensible', () => {
  it('retrouve une sélection traversant plusieurs mises en forme', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('Expérience '),
        schema.text('chimique', [schema.mark('bold')]),
      ]),
    ]);
    expect(findMatches(doc, 'expérience chimique')).toEqual([{ from: 1, to: 20 }]);
  });
  it('renouvelle les identités lors du collage, en conservant texte, style et filiation', () => {
    const id = crypto.randomUUID();
    const mark = schema.mark('memoryAnchor', { id });
    const slice = new Slice(
      Fragment.from(
        schema.node('paragraph', null, [
          schema.text('alpha', [mark]),
          schema.text(' beta', [mark, schema.mark('bold')]),
        ]),
      ),
      0,
      0,
    );
    const copied = reidentifyPastedSlice(slice);
    const first = copied.content.firstChild!.firstChild!,
      second = copied.content.firstChild!.lastChild!;
    const a = first.marks.find((m) => m.type.name === 'memoryAnchor')!,
      b = second.marks.find((m) => m.type.name === 'memoryAnchor')!;
    expect(a.attrs.id).not.toBe(id);
    expect(a.attrs.id).toBe(b.attrs.id);
    expect(a.attrs.sourceId).toBe(id);
    expect(second.marks.some((m) => m.type.name === 'bold')).toBe(true);
    expect(copied.content.textBetween(0, copied.content.size)).toBe('alpha beta');
  });
  it('extrait les passages marqués sans perdre leur source formatée', () => {
    const id = crypto.randomUUID();
    const doc: RichNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'science',
              marks: [{ type: 'memoryAnchor', attrs: { id } }, { type: 'italic' }],
            },
          ],
        },
      ],
    };
    validateDocument(doc);
    expect(extractAnchors(doc)[0]).toMatchObject({ id, quote: 'science' });
    expect(extractAnchors(doc)[0].slices[0].marks).toHaveLength(2);
    expect(plainText(doc)).toBe('science');
  });
  it('rejette les métadonnées invalides, le contenu trop imbriqué et les types inconnus', () => {
    expect(() => validateDocument({ type: 'doc', content: [{ type: 'script' }] })).toThrow();
    expect(() =>
      validateDocument({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'x',
                marks: [{ type: 'memoryAnchor', attrs: { id: 'not-an-id' } }],
              },
            ],
          },
        ],
      }),
    ).toThrow();
    let nested: any = { type: 'paragraph' };
    for (let i = 0; i < 35; i++) nested = { type: 'blockquote', content: [nested] };
    expect(() => validateDocument({ type: 'doc', content: [nested] })).toThrow();
  });
});
