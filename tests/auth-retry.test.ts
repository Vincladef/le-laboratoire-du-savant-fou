import { describe, it, expect } from 'vitest';
import { authRetryDelay } from '../scripts/auth-retry';
const response = (status: number, retryAfter?: string) => ({
  status,
  headers: new Headers(retryAfter ? { 'Retry-After': retryAfter } : {}),
});
describe('La recette respecte les limites du fournisseur sans les contourner', () => {
  it('ne rejoue ni les refus d’identité ni les réponses normales', () => {
    for (const status of [200, 400, 401, 403, 409, 500])
      expect(authRetryDelay(response(status), 0)).toBeNull();
  });
  it('respecte Retry-After en secondes ou sous forme de date', () => {
    expect(authRetryDelay(response(429, '12'), 0)).toBe(12000);
    expect(
      authRetryDelay(
        response(429, 'Fri, 16 Oct 2026 16:00:30 GMT'),
        0,
        Date.parse('2026-10-16T16:00:00Z'),
      ),
    ).toBe(30000);
  });
  it('attend une fenêtre complète sans en-tête exploitable et borne le nombre d’essais', () => {
    expect(authRetryDelay(response(429), 0)).toBe(65000);
    expect(authRetryDelay(response(429, 'invalide'), 0)).toBe(65000);
    expect(authRetryDelay(response(429), 2)).toBeNull();
    expect(authRetryDelay(response(429, '180'), 0)).toBeNull();
  });
});
