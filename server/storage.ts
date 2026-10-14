import { getStore } from '@netlify/blobs';
import type { AppConfig } from './config';
export function createStorage(config: AppConfig) {
  return {
    async put(key: string, data: ArrayBuffer) {
      if (config.development) {
        const { mkdir, writeFile } = await import('node:fs/promises');
        await mkdir(`${config.localDir}/assets`, { recursive: true });
        await writeFile(`${config.localDir}/assets/${key}`, Buffer.from(data));
      } else await getStore({ name: 'laboratoire-assets', consistency: 'strong' }).set(key, data);
    },
    async get(key: string): Promise<ArrayBuffer | null> {
      if (config.development) {
        const { readFile } = await import('node:fs/promises');
        try {
          const data = await readFile(`${config.localDir}/assets/${key}`);
          return Uint8Array.from(data).buffer;
        } catch {
          return null;
        }
      }
      return getStore({ name: 'laboratoire-assets', consistency: 'strong' }).get(key, {
        type: 'arrayBuffer',
      });
    },
    async delete(key: string) {
      if (config.development) {
        const { unlink } = await import('node:fs/promises');
        await unlink(`${config.localDir}/assets/${key}`).catch(() => {});
      } else await getStore('laboratoire-assets').delete(key);
    },
  };
}
