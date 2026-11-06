import { eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import {
  createAuthServer,
  extractNeonAuthCookies,
  handleAuthProxyRequest,
  processAuthMiddleware,
  serializeSetCookie,
} from '@neondatabase/auth/server';
import type { Context } from 'hono';
import type { AppConfig } from './config';
import type { Database } from './db';
import { authIdentities, profiles, user } from './db/schema';

export type ManagedIdentity = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image?: string | null;
};

/** Link only server-verified identities. Preserve legacy IDs, roles and every foreign key. */
export async function resolveManagedIdentity(
  db: Database,
  identity: ManagedIdentity,
  ownerSubject?: string,
) {
  if (!identity.id || !identity.email || identity.emailVerified !== true)
    throw new HTTPException(403, {
      message: 'Confirmez votre adresse email avant d’ouvrir votre espace.',
    });
  return db.transaction(async (tx) => {
    // Serialize first-login races, including two managed subjects claiming the same legacy email.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${identity.email.toLowerCase()}))`);
    const [linked] = await tx
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.subject, identity.id));
    if (linked) {
      if (ownerSubject && identity.id === ownerSubject)
        await tx.update(profiles).set({ role: 'owner' }).where(eq(profiles.userId, linked.userId));
      return linked.userId;
    }
    const legacy = await tx
      .select()
      .from(user)
      .where(sql`lower(${user.email}) = ${identity.email.toLowerCase()}`);
    if (legacy.length > 1 || (legacy[0] && !legacy[0].emailVerified))
      throw new HTTPException(409, {
        message:
          'Ce compte existant exige une migration d’identité vérifiée ; ses documents restent préservés.',
      });
    let id = legacy[0]?.id;
    if (id) {
      const [other] = await tx.select().from(authIdentities).where(eq(authIdentities.userId, id));
      if (other)
        throw new HTTPException(409, {
          message: 'Ce compte est déjà associé à une autre identité.',
        });
    } else {
      id = crypto.randomUUID();
      await tx.insert(user).values({
        id,
        email: identity.email.toLowerCase(),
        name: identity.name || 'Utilisateur',
        emailVerified: true,
        image: identity.image,
      });
    }
    await tx.insert(authIdentities).values({ subject: identity.id, userId: id });
    await tx.insert(profiles).values({ userId: id }).onConflictDoNothing();
    if (ownerSubject && identity.id === ownerSubject)
      await tx.update(profiles).set({ role: 'owner' }).where(eq(profiles.userId, id));
    return id;
  });
}

export function managedAuth(config: AppConfig, db: Database) {
  const proxy = {
    baseUrl: config.neonAuthURL!,
    cookieSecret: config.secret,
    sessionDataTtl: 60,
    sameSite: 'lax' as const,
  };
  const forRequest = (c: Context) =>
    createAuthServer({
      ...proxy,
      context: () => ({
        getCookies: () => extractNeonAuthCookies(c.req.header('cookie') || ''),
        setCookie: (name, value, options) => {
          c.header('Set-Cookie', serializeSetCookie({ name, value, ...options }), { append: true });
        },
        getHeader: (name) => c.req.header(name) ?? null,
        getOrigin: () => config.baseURL,
        getFramework: () => 'hono',
      }),
    });
  return {
    async handler(c: Context) {
      const path = c.req.path.replace(/^\/api\/auth\//, '');
      if (path === 'complete') {
        // An OAuth failure arrives on the callback URL; do not silently discard it.
        const providerError = new URL(c.req.url).searchParams.get('error');
        if (providerError) {
          const knownErrors = new Set([
            'account_not_linked',
            'unable_to_link_account',
            'email_not_verified',
            'signup_disabled',
            'access_denied',
            'state_mismatch',
          ]);
          const code = knownErrors.has(providerError) ? providerError : 'oauth_failed';
          return c.redirect(`/?authError=${code}`, 302);
        }
        const result = await processAuthMiddleware({
          ...proxy,
          request: c.req.raw,
          pathname: c.req.path,
          skipRoutes: ['/api/auth'],
          loginUrl: '/',
        });
        for (const cookie of result.cookies || []) c.header('Set-Cookie', cookie, { append: true });
        if (result.action === 'redirect_oauth')
          return c.redirect(result.redirectUrl.toString(), 302);
        if (result.action === 'redirect_login')
          return c.redirect('/?authError=session_missing', 302);

        // Only enter the library once Neon has confirmed a usable session and
        // the verified Google identity is linked to an isolated app account.
        const session = await forRequest(c).getSession({ query: { disableCookieCache: 'true' } });
        if (session.error || !session.data?.user)
          return c.redirect('/?authError=session_missing', 302);
        try {
          await resolveManagedIdentity(db, session.data.user, config.ownerNeonSubject);
        } catch (error) {
          if (error instanceof HTTPException && error.status === 403)
            return c.redirect('/?authError=email_not_verified', 302);
          if (error instanceof HTTPException && error.status === 409)
            return c.redirect('/?authError=identity_conflict', 302);
          throw error;
        }
        return c.redirect('/library', 302);
      }
      // No admin/organization/billing proxy surface. Application roles are never Neon org roles.
      if (
        !new Set([
          'get-session',
          'sign-in/email',
          'sign-in/social',
          'sign-up/email',
          'sign-out',
          'request-password-reset',
          'reset-password',
          'send-verification-email',
          'verify-email',
          'update-user',
          'revoke-sessions',
          'email-otp/send-verification-otp',
          'email-otp/verify-email',
        ]).has(path)
      )
        return c.json({ message: 'Route d’authentification indisponible.' }, 404);
      const url = new URL(c.req.url);
      if (path === 'get-session') url.searchParams.set('disableCookieCache', 'true');
      const headers = new Headers(c.req.raw.headers);
      headers.set('Origin', config.baseURL);
      const body = c.req.method === 'POST' ? await c.req.text() : undefined;
      let resetSubject: string | undefined;
      if (path === 'reset-password' && c.req.method === 'POST') {
        const token = JSON.parse(body || '{}').token;
        if (typeof token !== 'string' || token.length < 16 || token.length > 256)
          return c.json({ message: 'Lien de récupération invalide.' }, 400);
        // The opaque token is resolved in the managed store before Neon consumes it.
        // No email or subject supplied by the browser decides which sessions to revoke.
        const result = await db.execute(
          sql`select value from neon_auth.verification where identifier=${'reset-password:' + token} and "expiresAt">clock_timestamp()`,
        );
        resetSubject = result.rows[0]?.value as string | undefined;
        if (!resetSubject)
          return c.json(
            { message: 'Ce lien de récupération a expiré ou a déjà été utilisé.' },
            400,
          );
      }
      const response = await handleAuthProxyRequest({
        ...proxy,
        path,
        request: new Request(url, {
          method: c.req.method,
          headers,
          ...(body !== undefined ? { body } : {}),
        }),
      });
      if (resetSubject && response.ok) {
        // Neon currently keeps old sessions on password reset. Revoke them explicitly.
        await db.execute(sql`delete from neon_auth.session where "userId"=${resetSubject}::uuid`);
      }
      return response;
    },
    async session(c: Context) {
      // Always revalidate upstream: revoked or expired sessions never authorize document access.
      const result = await forRequest(c).getSession({ query: { disableCookieCache: 'true' } });
      if (result.error) {
        if (result.error.status === 401) return null;
        throw new HTTPException(503, {
          message: 'Le service d’authentification est temporairement indisponible.',
        });
      }
      return result.data?.user ? result.data : null;
    },
    async updateName(c: Context, name: string) {
      const result = await forRequest(c).updateUser({ name });
      if (result.error)
        throw new HTTPException(503, { message: 'La mise à jour du profil Neon a échoué.' });
    },
  };
}
