import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
type Call = (path: string, method?: string, body?: unknown, expected?: number) => Promise<Response>;
/** Exercise public signup; only a synthetic account's OTP may be read administratively. */
export async function verifyManagedSignup(client: PoolClient, call: Call, origin: string) {
  const email = `signup-${randomUUID()}@example.test`,
    password = randomBytes(32).toString('base64url');
  let subject: string | undefined;
  try {
    const result = await (
      await call('/auth/sign-up/email', 'POST', {
        email,
        password,
        name: 'Inscription de contrôle temporaire',
        callbackURL: `${origin}/api/auth/complete`,
      })
    ).json();
    subject = result.user?.id;
    if (!subject || result.user.emailVerified !== false)
      throw new Error('Inscription Neon non vérifiée attendue.');
    await call('/documents', 'GET', undefined, 401);
    await call('/auth/sign-in/email', 'POST', { email, password }, 403);
    const rows = await client.query(
      'select value from neon_auth.verification where identifier=$1 and "expiresAt">now() order by "createdAt" desc limit 1',
      [`email-verification-otp-${email}`],
    );
    const otp = String(rows.rows[0]?.value || '').match(/^(\d{6,8}):\d+$/)?.[1];
    if (!otp) {
      await call('/auth/email-otp/verify-email', 'POST', { email, otp: '000000' }, 400);
      return {
        signupAccepted: true,
        unverifiedAccessDenied: true,
        verification: 'requires-personal-inbox-test',
        emailDelivery: 'request-accepted-not-inbox-tested',
      };
    }
    await call('/auth/email-otp/verify-email', 'POST', { email, otp });
    await call('/auth/sign-in/email', 'POST', { email, password });
    const profile = await (await call('/profile')).json();
    if (profile.role !== 'free') throw new Error('Rôle initial non gratuit.');
    await call('/auth/sign-out', 'POST', {});
    return {
      signupAccepted: true,
      unverifiedAccessDenied: true,
      verification: 'completed-with-managed-db-fixture-otp',
      emailDelivery: 'request-accepted-not-inbox-tested',
    };
  } finally {
    // Exact synthetic email + name; never query or delete a real user's verification tokens.
    const created = await client.query(
      'select id from neon_auth."user" where email=$1 and name=$2',
      [email, 'Inscription de contrôle temporaire'],
    );
    if (created.rows[0]) {
      subject = created.rows[0].id;
      await client.query(
        'delete from lab."user" where email=$1 and id in (select user_id from lab.auth_identities where subject=$2)',
        [email, subject],
      );
      await client.query('delete from neon_auth."user" where id=$1 and email=$2', [subject, email]);
    }
    await client.query('delete from neon_auth.verification where identifier=$1', [
      `email-verification-otp-${email}`,
    ]);
  }
}
