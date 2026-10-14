export class ApiError extends Error {
  constructor(
    public status: number,
    public data: any,
  ) {
    super(data.error || data.message || `Erreur ${status}`);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({ error: 'Réponse du serveur illisible.' }));
  if (!response.ok) throw new ApiError(response.status, data);
  return data as T;
}
export const json = (data: unknown) => JSON.stringify(data);
export async function uploadImage(file: File) {
  if (!file.size || file.size > 4 * 1024 * 1024)
    throw new Error('Choisissez une image de 4 Mo maximum.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Cette image est endommagée ou son format n’est pas pris en charge.');
  }
  const pixels = bitmap.width * bitmap.height;
  bitmap.close();
  if (pixels > 20_000_000)
    throw new Error(
      'L’image dépasse 20 millions de pixels. Réduisez ses dimensions avant de l’importer.',
    );
  const body = new FormData();
  body.append('file', file);
  return api<{ src: string; id: string }>('/assets', { method: 'POST', body });
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
