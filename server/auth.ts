import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import type { Database } from './db';
import * as schema from './db/schema';
import type { AppConfig } from './config';
import { createMailer } from './mail';

export function createAuth(db: Database, config: AppConfig) {
  const mail = createMailer(config);
  return betterAuth({
    appName: 'Bouche-trou',
    baseURL: config.baseURL,
    basePath: '/api/auth',
    secret: config.secret,
    trustedOrigins: [config.baseURL],
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mail(user.email, 'Réinitialiser votre mot de passe', url);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mail(user.email, 'Confirmer votre adresse email', url);
      },
    },
    socialProviders: config.google
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {},
    account: { accountLinking: { enabled: false } },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 8 },
        '/sign-up/email': { window: 60, max: 5 },
        '/request-password-reset': { window: 60, max: 3 },
      },
    },
    advanced: {
      useSecureCookies: !config.development,
      ipAddress: {
        ipAddressHeaders: config.development ? ['x-forwarded-for'] : ['x-nf-client-connection-ip'],
        // Vite appends its loopback hop. Never trust arbitrary forwarded chains in production.
        ...(config.development ? { trustedProxies: ['127.0.0.1/32', '::1/128'] } : {}),
      },
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: !config.development },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await db.insert(schema.profiles).values({ userId: user.id }).onConflictDoNothing();
          },
        },
      },
    },
  });
}
