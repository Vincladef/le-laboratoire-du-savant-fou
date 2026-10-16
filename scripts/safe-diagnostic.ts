/** Third-party exceptions may embed cookies, credentials or database URLs. */
export function safeDiagnostic(error: unknown): {
  name: string;
  message?: string;
  frames?: string[];
} {
  if (!(error instanceof Error)) return { name: 'Error' };
  const sensitive =
    error.name !== 'Error' || /cookie|authorization|password|token|bearer|eyJ/i.test(error.message);
  const message = sensitive
    ? undefined
    : error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]').slice(0, 500);
  const frames = (error.stack || '')
    .split('\n')
    .filter((line) => /^\s+at /.test(line))
    .slice(0, 6);
  return { name: error.name, ...(message ? { message } : {}), frames };
}
