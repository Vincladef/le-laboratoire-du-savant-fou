import 'dotenv/config';
import { serve } from '@hono/node-server';
import { getConfig } from '../server/config';
import { openDatabase } from '../server/db';
import { createApp } from '../server/app';
import { openLocalDatabase } from './local-database';
process.env.LAB_LOCAL ??= '1';
const config = getConfig();
const connection = await (config.development ? openLocalDatabase(config) : openDatabase(config));
const { app } = createApp(connection.db, config);
const server = serve({
  fetch: app.fetch,
  hostname: '127.0.0.1',
  port: Number(process.env.API_PORT || 3001),
});
console.log(
  `API démarrée. Base ${config.development ? 'PostgreSQL locale persistante' : 'distante'}.`,
);
async function shutdown() {
  server.close();
  await connection.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
