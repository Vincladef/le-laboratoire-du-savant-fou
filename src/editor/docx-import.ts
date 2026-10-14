import mammoth from 'mammoth';
import DOMPurify from 'dompurify';
import { generateJSON } from '@tiptap/core';
import { editorExtensions } from './extensions';
import { uploadImage } from '../lib/api';
import { validateDocument } from '../shared/document';
import { inspectDocxArchive } from './docx-safety';
export const IMPORT_LIMITS =
  'L’import conserve le texte, les titres, les listes, les liens, les tableaux simples et les images compatibles. Polices, couleurs, marges, objets flottants, équations Word, en-têtes et pieds de page peuvent être perdus ou modifiés. Le fichier original reste votre référence.';
export async function importDocx(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error('L’import DOCX est limité à 10 Mo.');
  const buffer = await file.arrayBuffer();
  inspectDocxArchive(new Uint8Array(buffer));
  const result = await mammoth.convertToHtml(
    { arrayBuffer: buffer },
    {
      styleMap: ['u => u', 'strike => s'],
      convertImage: mammoth.images.imgElement(async (image) => {
        const base64 = await image.read('base64');
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const result = await uploadImage(
          new File([bytes], 'image-importee', { type: image.contentType }),
        );
        return { src: result.src };
      }),
    },
  );
  const safe = DOMPurify.sanitize(result.value, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'object', 'form'],
    FORBID_ATTR: ['style'],
    ADD_ATTR: ['data-type'],
  });
  const content = generateJSON(safe || '<p></p>', editorExtensions());
  return { content: validateDocument(content), warnings: result.messages.map((m) => m.message) };
}
