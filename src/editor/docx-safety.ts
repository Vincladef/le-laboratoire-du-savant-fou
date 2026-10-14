import { unzipSync } from 'fflate';
/** Inspect ZIP sizes before Mammoth allocates decompressed document/image buffers. */
export function inspectDocxArchive(bytes: Uint8Array) {
  let total = 0;
  let count = 0;
  let hasDocument = false;
  unzipSync(bytes, {
    filter(file) {
      total += file.originalSize;
      count++;
      if (file.originalSize > 20 * 1024 * 1024 || total > 40 * 1024 * 1024 || count > 1500) {
        throw new Error(
          'Le DOCX décompressé dépasse les limites d’import (40 Mo / 1 500 éléments).',
        );
      }
      if (file.name === 'word/document.xml') hasDocument = true;
      return false;
    },
  });
  if (!hasDocument) throw new Error('Ce fichier ne contient pas de document Word valide.');
}
