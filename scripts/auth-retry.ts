/** Test harness only: wait for the provider's window, never change auth limits or client IPs. */
export function authRetryDelay(
  response: Pick<Response, 'status' | 'headers'>,
  attempt: number,
  now = Date.now(),
): number | null {
  if (response.status !== 429 || attempt >= 2) return null;
  const raw = response.headers.get('retry-after');
  const delay =
    raw && /^\d+$/.test(raw)
      ? Number(raw) * 1000
      : raw && Number.isFinite(Date.parse(raw))
        ? Date.parse(raw) - now
        : 65000;
  if (delay > 120000) return null;
  return Math.max(1000, delay);
}
export const waitForAuthWindow = (delay: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delay));
