import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, FileText, ShieldCheck, Mail, FlaskConical } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';
import { api } from '../lib/api';
import { Brand } from './Brand';
import { LegalLinks } from '../billing/LegalPage';
export function AuthPage({ returnTo = '/library' }: { returnTo?: string }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [oauthError, setOauthError] = useState(() => {
    const reason = params.get('authError') || params.get('error');
    if (!reason) return '';
    const messages: Record<string, string> = {
      account_not_linked:
        'Cette adresse est déjà utilisée par un compte Bouche-Trou. Si votre inscription par email n’a pas été terminée, confirmez cette adresse avec un code, puis réessayez Google.',
      unable_to_link_account:
        'Google n’a pas pu être associé à ce compte. Essayez la connexion par email ou confirmez votre adresse.',
      identity_conflict:
        'Une identité existe déjà pour cette adresse. Connectez-vous avec votre méthode habituelle ; vos documents restent protégés.',
      email_not_verified:
        'Cette adresse email n’est pas encore confirmée. Terminez la vérification de votre compte avant de vous connecter.',
      signup_disabled: 'La création de comptes par Google est temporairement indisponible.',
      access_denied: 'Connexion Google annulée. Vous pouvez réessayer.',
      state_mismatch: 'La connexion Google a expiré ou a été interrompue. Réessayez depuis cette page.',
      session_missing:
        'Google n’a pas pu ouvrir votre session. Réessayez ; si cela persiste, vérifiez que votre navigateur autorise les cookies.',
      oauth_failed: 'La connexion Google a échoué. Réessayez ou utilisez la connexion par email.',
    };
    return messages[reason] || messages.oauth_failed;
  });
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset' | 'verify'>(
    params.has('token') ? 'reset' : 'signin',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const config = useQuery({
    queryKey: ['config'],
    queryFn: () =>
      api<{ local: boolean; google: boolean; email: boolean; managed?: boolean }>('/config'),
    retry: false,
  });
  function changeMode(value: typeof mode) {
    setMode(value);
    setError('');
    setOauthError('');
    setNotice('');
    setPassword('');
    setOtp('');
  }
  async function sendGoogleLinkVerification() {
    const address = email.trim();
    if (!/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(address)) {
      setError('Saisissez d’abord l’adresse du compte Google dans le champ email.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: address,
        type: 'email-verification',
      });
      if (result.error)
        throw new Error(result.error.message || 'Impossible d’envoyer un code de confirmation.');
      changeMode('verify');
      setEmail(address);
      setNotice('Si cette adresse doit encore être vérifiée, un code vient de lui être envoyé.');
    } catch (cause) {
      setError((cause as Error).message || 'Impossible d’envoyer un code de confirmation.');
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result =
        mode === 'verify'
          ? await authClient.emailOtp.verifyEmail({ email, otp })
          : mode === 'signup'
            ? await authClient.signUp.email({
                name,
                email,
                password,
                callbackURL: config.data?.managed
                  ? `${window.location.origin}/api/auth/complete`
                  : '/library',
              })
            : mode === 'forgot'
              ? await authClient.requestPasswordReset({
                  email,
                  redirectTo: `${window.location.origin}/reset-password`,
                })
              : mode === 'reset'
                ? await authClient.resetPassword({
                    newPassword: password,
                    token: params.get('token') || '',
                  })
                : await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message || 'La demande a échoué.');
      if (mode === 'verify') {
        const session = await authClient.getSession({ query: { disableCookieCache: true } });
        if (session.error)
          throw new Error(session.error.message || 'La session ne peut pas être ouverte.');
        if (session.data?.user) navigate(returnTo);
        else {
          changeMode('signin');
          setNotice('Votre adresse est confirmée. Vous pouvez vous connecter.');
        }
      } else if (mode === 'signin') navigate(returnTo);
      else if (mode === 'signup' && config.data?.managed) {
        changeMode('verify');
        setNotice('Saisissez le code reçu par email pour confirmer votre adresse.');
      } else if (mode === 'signup')
        setNotice(
          'Un lien de confirmation vous a été envoyé. Confirmez votre adresse pour ouvrir votre espace.',
        );
      else if (mode === 'forgot')
        setNotice('Si ce compte existe, un email de récupération vous a été envoyé.');
      else {
        if (config.data?.managed) await authClient.signOut();
        changeMode('signin');
        setNotice('Votre mot de passe a été modifié. Vous pouvez vous connecter.');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-body">
          <h1>
            Des trous dans vos textes,
            <br />
            <em>pas dans votre mémoire.</em>
          </h1>
          <div className="story-paper">
            <div className="paper-number">CARNET N° 001</div>
            <h3>Apprendre en retrouvant.</h3>
            <div className="fake-line long" />
            <div className="fake-line" />
            <div className="fake-line short" />
            <span className="paper-seal">
              <FlaskConical size={34} />
            </span>
          </div>
          <div className="story-features">
            <span>
              <FileText size={18} /> Écrivez librement
            </span>
            <span>
              <BookOpen size={18} /> Organisez vos savoirs
            </span>
            <span>
              <ShieldCheck size={18} /> Gardez votre espace privé
            </span>
          </div>
        </div>
        <small className="story-footer">BOUCHE-TROU · APPRENDRE EN RETROUVANT</small>
      </section>
      <section className="auth-form-area">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="auth-form-wrap">
          <span className="eyebrow">BIENVENUE CHEZ BOUCHE-TROU</span>
          <h2>
            {mode === 'signup'
              ? 'Ouvrez votre carnet.'
              : mode === 'forgot'
                ? 'Retrouvez votre compte.'
                : mode === 'verify'
                  ? 'Confirmez votre adresse.'
                  : mode === 'reset'
                    ? 'Un nouveau mot de passe.'
                    : 'Heureux de vous retrouver.'}
          </h2>
          {mode !== 'signin' && (
            <p className="muted">
              {mode === 'signup'
                ? 'Créez votre compte et donnez une place à vos idées.'
                : mode === 'verify'
                  ? 'Saisissez le code reçu pour confirmer que cette adresse vous appartient.'
                  : 'Nous vous aidons à retrouver votre espace.'}
            </p>
          )}
          {config.isError && (
            <p className="alert error" role="alert">
              {config.error.message} La connexion au service n’est pas encore disponible.
            </p>
          )}
          {config.data?.local && (
            <p className="alert info">
              Environnement local : les emails sont déposés dans la boîte de développement, sans
              envoi externe.
            </p>
          )}
          {config.data && !config.data.local && !config.data.email && (
            <p className="alert info" role="status">
              L’envoi des emails est en cours de configuration. Les inscriptions et la récupération
              de compte sont temporairement indisponibles. La connexion des comptes déjà confirmés
              reste disponible.
            </p>
          )}
          {config.data?.google && ['signin', 'signup'].includes(mode) && (
            <>
              <button
                className="button google-button"
                disabled={busy}
                onClick={async () => {
                  setError('');
                  setOauthError('');
                  setBusy(true);
                  try {
                    const result = await authClient.signIn.social({
                      provider: 'google',
                      callbackURL: config.data?.managed
                        ? `${window.location.origin}/api/auth/complete`
                        : '/library',
                    });
                    if (result.error)
                      throw new Error(result.error.message || 'Connexion Google indisponible.');
                  } catch (error) {
                    setError((error as Error).message || 'Connexion Google indisponible.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <span className="google-letter">G</span> Continuer avec Google
              </button>
              <div className="divider-label">ou avec votre email</div>
            </>
          )}
          <form onSubmit={submit}>
            {mode === 'signup' && (
              <label>
                Votre nom
                <input
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  placeholder="Marie Curie"
                />
              </label>
            )}
            {mode !== 'reset' && (
              <label>
                Adresse email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.fr"
                />
              </label>
            )}
            {mode === 'verify' && (
              <label>
                Code reçu par email
                <input
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6,8}"
                  maxLength={8}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </label>
            )}
            {mode !== 'forgot' && mode !== 'verify' && (
              <label>
                Mot de passe
                <input
                  type="password"
                  required
                  minLength={mode === 'signin' ? 1 : 12}
                  maxLength={128}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signin' ? 'Votre mot de passe' : '12 caractères minimum'}
                />
              </label>
            )}
            {mode === 'signin' && (
              <button
                type="button"
                className="text-button forgot"
                onClick={() => changeMode('forgot')}
              >
                Mot de passe oublié ?
              </button>
            )}
            {(error || oauthError) && (
              <p className="alert error" role="alert">
                {error || oauthError}
              </p>
            )}
            {oauthError && mode === 'signin' && config.data?.managed &&
              ['account_not_linked', 'email_not_verified', 'unable_to_link_account'].includes(
                params.get('authError') || params.get('error') || '',
              ) && (
                <button
                  type="button"
                  className="button subtle full"
                  disabled={busy}
                  onClick={() => void sendGoogleLinkVerification()}
                >
                  <Mail size={18} /> Recevoir un code pour confirmer mon email
                </button>
              )}
            {notice && (
              <p className="alert success" role="status">
                <Mail size={18} />
                {notice}
              </p>
            )}
            <button
              className="button primary full"
              type="submit"
              disabled={busy || config.isError || (mode !== 'signin' && !config.data?.email)}
            >
              {busy
                ? 'Un instant…'
                : mode === 'signup'
                  ? 'Créer mon compte'
                  : mode === 'forgot'
                    ? 'Envoyer le lien de récupération'
                    : mode === 'verify'
                      ? 'Confirmer mon adresse'
                      : mode === 'reset'
                        ? 'Changer le mot de passe'
                        : 'Me connecter'}
              <ArrowRight size={18} />
            </button>
          </form>
          {mode === 'signin' ? (
            <p className="auth-switch">
              Pas encore de compte ?{' '}
              <button className="text-button" onClick={() => changeMode('signup')}>
                Créer mon espace
              </button>
            </p>
          ) : (
            <p className="auth-switch">
              <button className="text-button" onClick={() => changeMode('signin')}>
                Revenir à la connexion
              </button>
            </p>
          )}
          {email && (
            <button
              className="text-button resend"
              disabled={busy || !config.data?.email}
              onClick={async () => {
                const result = config.data?.managed
                  ? await authClient.emailOtp.sendVerificationOtp({
                      email,
                      type: 'email-verification',
                    })
                  : await authClient.sendVerificationEmail({
                      email,
                      callbackURL: '/library',
                    });
                if (result.error) setError(result.error.message || 'Envoi impossible.');
                else if (config.data?.managed) {
                  changeMode('verify');
                  setNotice('Si nécessaire, un nouveau code de confirmation a été envoyé.');
                } else setNotice('Si nécessaire, un nouveau lien de confirmation a été envoyé.');
              }}
            >
              {config.data?.managed
                ? 'Renvoyer le code de confirmation'
                : 'Renvoyer le lien de confirmation'}
            </button>
          )}
          <p className="auth-fine">Vos documents sont privés et rattachés à votre compte.</p>
          <LegalLinks />
        </div>
      </section>
    </main>
  );
}
