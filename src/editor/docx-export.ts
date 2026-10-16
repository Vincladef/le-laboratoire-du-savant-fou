import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ExternalHyperlink,
  ImageRun,
  PageBreak,
  HeadingLevel,
  AlignmentType,
  WidthType,
  LevelFormat,
  PageOrientation,
  type ParagraphChild,
  type IRunOptions,
} from 'docx';
import type { RichNode, PageLayout } from '../shared/document';
type Block = Paragraph | Table;
function hex(value?: string): string | undefined {
  if (!value) return;
  if (value.startsWith('#')) {
    const c = value.slice(1);
    return (
      c.length === 3
        ? c
            .split('')
            .map((x) => x + x)
            .join('')
        : c.slice(0, 6)
    ).toUpperCase();
  }
  const rgb = value.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
  if (rgb)
    return rgb
      .slice(1)
      .map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0'))
      .join('');
  return (
    {
      black: '000000',
      white: 'FFFFFF',
      red: 'FF0000',
      blue: '0000FF',
      yellow: 'FFFF00',
      green: '008000',
    } as Record<string, string>
  )[value];
}
export async function makeDocx(
  title: string,
  content: RichNode,
  layout: PageLayout,
  fetchImage = async (src: string) => {
    const response = await fetch(src, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Une image du document ne peut pas être exportée.');
    return new Uint8Array(await response.arrayBuffer());
  },
) {
  const numbering: any[] = [];
  let listId = 0;
  async function inline(nodes: RichNode[] = []): Promise<ParagraphChild[]> {
    const result: ParagraphChild[] = [];
    for (const node of nodes) {
      if (node.type === 'hardBreak') {
        result.push(new TextRun({ break: 1 }));
        continue;
      }
      if (node.type === 'inlineMath') {
        result.push(new TextRun({ text: `\\(${node.attrs?.latex}\\)`, font: 'Cambria Math' }));
        continue;
      }
      if (node.type !== 'text') continue;
      const options: { -readonly [K in keyof IRunOptions]: IRunOptions[K] } = {
        text: node.text || '',
      };
      for (const mark of node.marks || []) {
        if (mark.type === 'bold') options.bold = true;
        if (mark.type === 'italic') options.italics = true;
        if (mark.type === 'underline') options.underline = {};
        if (mark.type === 'strike') options.strike = true;
        if (mark.type === 'code') options.font = 'Courier New';
        if (mark.type === 'highlight')
          options.shading = { fill: hex(mark.attrs?.color) || 'FFFF00' };
        if (mark.type === 'textStyle') {
          if (mark.attrs?.fontFamily) options.font = mark.attrs.fontFamily;
          if (mark.attrs?.fontSize)
            options.size = Math.round(
              parseFloat(mark.attrs.fontSize) * (mark.attrs.fontSize.endsWith('px') ? 1.5 : 2),
            );
          if (mark.attrs?.color) options.color = hex(mark.attrs.color);
          if (mark.attrs?.backgroundColor)
            options.shading = { fill: hex(mark.attrs.backgroundColor) };
        }
      }
      const run = new TextRun(options);
      const link = node.marks?.find((m) => m.type === 'link');
      result.push(link ? new ExternalHyperlink({ children: [run], link: link.attrs!.href }) : run);
    }
    return result;
  }
  async function blocks(
    nodes: RichNode[] = [],
    list?: { reference: string; level: number; task?: boolean; checked?: boolean },
  ): Promise<Block[]> {
    const result: Block[] = [];
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      const a = node.attrs || {};
      if (node.type === 'documentTab') {
        result.push(
          new Paragraph({ text: a.title || 'Onglet', heading: HeadingLevel.HEADING_1 }),
          ...(await blocks(node.content)),
        );
      } else if (['paragraph', 'heading', 'codeBlock', 'blockMath'].includes(node.type)) {
        const children =
          node.type === 'blockMath'
            ? [new TextRun({ text: `\\[${a.latex}\\]`, font: 'Cambria Math' })]
            : await inline(node.content);
        if (list?.task && index === 0) children.unshift(new TextRun(list.checked ? '☑ ' : '☐ '));
        result.push(
          new Paragraph({
            children,
            heading:
              node.type === 'heading'
                ? [
                    HeadingLevel.HEADING_1,
                    HeadingLevel.HEADING_2,
                    HeadingLevel.HEADING_3,
                    HeadingLevel.HEADING_4,
                    HeadingLevel.HEADING_5,
                    HeadingLevel.HEADING_6,
                  ][(a.level || 1) - 1]
                : undefined,
            alignment: (
              {
                left: AlignmentType.LEFT,
                center: AlignmentType.CENTER,
                right: AlignmentType.RIGHT,
                justify: AlignmentType.JUSTIFIED,
              } as any
            )[a.textAlign],
            spacing: { line: Math.round(Number(a.lineHeight || 1.5) * 240), after: 100 },
            indent: a.indent ? { left: a.indent * 360 } : undefined,
            numbering:
              list && !list.task && index === 0
                ? { reference: list.reference, level: Math.min(list.level, 8) }
                : undefined,
            keepNext: node.type === 'heading',
          }),
        );
      } else if (['bulletList', 'orderedList', 'taskList'].includes(node.type)) {
        const reference = `list-${++listId}`;
        const level = list ? list.level + 1 : 0;
        numbering.push({
          reference,
          levels: Array.from({ length: 9 }, (_, n) => ({
            level: n,
            format: node.type === 'orderedList' ? LevelFormat.DECIMAL : LevelFormat.BULLET,
            text: node.type === 'orderedList' ? `%${n + 1}.` : '•',
            start: a.start || 1,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (n + 1), hanging: 360 } } },
          })),
        });
        for (const item of node.content || [])
          result.push(
            ...(await blocks(item.content, {
              reference,
              level,
              task: node.type === 'taskList',
              checked: item.attrs?.checked,
            })),
          );
      } else if (node.type === 'table') {
        const rows: TableRow[] = [];
        for (const row of node.content || []) {
          const cells: TableCell[] = [];
          for (const cell of row.content || []) {
            const content = await blocks(cell.content);
            if (!content.length || content.at(-1) instanceof Table) content.push(new Paragraph(''));
            cells.push(
              new TableCell({
                children: content,
                columnSpan: cell.attrs?.colspan || 1,
                rowSpan: cell.attrs?.rowspan || 1,
                shading: cell.type === 'tableHeader' ? { fill: 'EDF2EE' } : undefined,
              }),
            );
          }
          rows.push(
            new TableRow({
              children: cells,
              tableHeader: row.content?.every((c) => c.type === 'tableHeader'),
            }),
          );
        }
        result.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      } else if (node.type === 'image') {
        let data = await fetchImage(a.src);
        let type: 'png' | 'jpg' = data[0] === 137 ? 'png' : 'jpg';
        if (data[0] === 82) {
          if (typeof window === 'undefined')
            throw new Error('La conversion WebP pour Word nécessite un navigateur.');
          const bitmap = await createImageBitmap(new Blob([Uint8Array.from(data)]));
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
          bitmap.close();
          const png = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) => (b ? resolve(b) : reject(new Error('Conversion de l’image impossible.'))),
              'image/png',
            ),
          );
          data = new Uint8Array(await png.arrayBuffer());
          type = 'png';
        }
        const width = Math.min(Number(a.width) || 400, 630);
        let height = Number(a.height) || Math.round(width * 0.65);
        if (!a.height && typeof createImageBitmap !== 'undefined') {
          const image = await createImageBitmap(new Blob([Uint8Array.from(data)]));
          height = Math.round((width * image.height) / image.width);
          image.close();
        }
        result.push(
          new Paragraph({
            children: [
              new ImageRun({
                data,
                type,
                transformation: { width, height },
                altText: {
                  title: a.alt || 'Image',
                  description: a.alt || '',
                  name: a.alt || 'Image',
                },
              }),
            ],
          }),
        );
      } else if (node.type === 'pageBreak')
        result.push(new Paragraph({ children: [new PageBreak()] }));
      else if (node.type === 'horizontalRule')
        result.push(
          new Paragraph({ border: { bottom: { color: '999999', size: 6, style: 'single' } } }),
        );
      else result.push(...(await blocks(node.content, list)));
    }
    return result;
  }
  const children = await blocks(content.content);
  const mm = (n: number) => Math.round((n * 1440) / 25.4);
  return Packer.toBlob(
    new Document({
      title,
      creator: 'Bouche-trou',
      numbering: { config: numbering },
      styles: {
        default: {
          document: {
            run: {
              font: layout.typography?.fontFamily || 'Arial',
              size: (layout.typography?.fontSize || 11) * 2,
            },
            paragraph: { spacing: { line: 360 } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: {
                width: mm(layout.format === 'A4' ? 210 : 215.9),
                height: mm(layout.format === 'A4' ? 297 : 279.4),
                orientation: layout.landscape
                  ? PageOrientation.LANDSCAPE
                  : PageOrientation.PORTRAIT,
              },
              margin: {
                top: mm(layout.margin),
                right: mm(layout.margin),
                bottom: mm(layout.margin),
                left: mm(layout.margin),
              },
            },
          },
          children,
        },
      ],
    }),
  );
}
