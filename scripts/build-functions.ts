import { zipFunctions } from '@netlify/zip-it-and-ship-it';
const result = await zipFunctions('netlify/functions', '.netlify/verified-functions', {
  config: { '*': { nodeBundler: 'esbuild', nodeVersion: '24', externalNodeModules: ['pg'] } },
});
for (const item of result)
  console.log(
    JSON.stringify({
      name: item.name,
      path: item.path,
      size: item.size,
      runtime: item.runtime,
      runtimeAPIVersion: item.runtimeAPIVersion,
    }),
  );
if (result.length !== 1 || result[0].name !== 'api')
  throw new Error('Paquet de fonction Netlify manquant.');
