import { it, expect } from 'vitest';
import { safeDiagnostic } from '../scripts/safe-diagnostic';
it('ne publie ni cookie de session ni message interne de transport', () => {
  const error = new TypeError(
    'Headers.append: __Secure-example.session_token=synthetic-private-value\n__Secure-example.session_data=synthetic-value',
  );
  const diagnostic = safeDiagnostic(error);
  expect(diagnostic).not.toHaveProperty('message');
  expect(JSON.stringify(diagnostic)).not.toContain('synthetic-private-value');
  expect(diagnostic.name).toBe('TypeError');
});
it('conserve le diagnostic contrôlé et masque les URL de connexion', () => {
  expect(
    safeDiagnostic(new Error('MANAGED_CHECK_FAILED /auth/sign-in/email: 429 attendu 200')).message,
  ).toContain('429');
  expect(
    safeDiagnostic(new Error('Échec postgres://test:synthetic-secret@localhost/database')).message,
  ).not.toContain('synthetic-secret');
  expect(safeDiagnostic(null)).toEqual({ name: 'Error' });
});
