import { getConfig } from '../../server/config';
import { openDatabase } from '../../server/db';
import { createApp } from '../../server/app';
let runtime: Promise<ReturnType<typeof createApp>> | undefined;
export default async (request: Request) => {
  try {
    runtime ??= (async () => {
      const config = getConfig();
      const { db } = await openDatabase(config);
      return createApp(db, config);
    })();
    const { app } = await runtime;
    const url = new URL(request.url);
    if (url.pathname.startsWith('/.netlify/functions/api'))
      url.pathname = url.pathname.replace('/.netlify/functions/api', '/api');
    return app.fetch(new Request(url, request));
  } catch {
    runtime = undefined;
    return Response.json(
      {
        error: 'Le service nécessite sa configuration Neon et authentification.',
        code: 'SETUP_REQUIRED',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
