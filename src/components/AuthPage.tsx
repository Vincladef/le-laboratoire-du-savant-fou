import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, FileText, ShieldCheck, Mail, FlaskConical } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { authClient } from '../lib/auth-client';
import { api } from '../lib/api';
import { Brand } from './Brand';
export function AuthPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
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
    setNotice('');
    setPassword('');
    setOtp('');
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
        if (session.data?.user) navigate('/library');
        else {
          changeMode('signin');
          setNotice('Votre adresse est confirmée. Vous pouvez vous connecter.');
        }
      } else if (mode === 'signin') navigate('/library');
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
          <span className="eyebrow">L’ATELIER DE VOS CONNAISSANCES</span>
          <h1>
            Les grandes idées
            <br />
            commencent par
            <br />
            <em>une page blanche.</em>
          </h1>
          <p>
            Un espace à vous pour écrire, organiser
            <br />
            et faire grandir vos connaissances.
          </p>
          <div className="story-paper">
            <div className="paper-number">CARNET N° 001</div>
            <h3>Tout commence par une idée.</h3>
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
        <small className="story-footer">
          LE LABORATOIRE DU SAVANT FOU · VOTRE ESPACE D’ÉCRITURE
        </small>
      </section>
      <section className="auth-form-area">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="auth-form-wrap">
          <span className="eyebrow">BIENVENUE AU LABORATOIRE</span>
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
          <p className="muted">
            {mode === 'signup'
              ? 'Créez votre compte et donnez une place à vos idées.'
              : mode === 'signin'
                ? 'Vos documents vous attendent. Reprenons le fil.'
                : 'Nous vous aidons à retrouver votre espace.'}
          </p>
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
                  setBusy(true);
                  const result = await authClient.signIn.social({
                    provider: 'google',
                    callbackURL: config.data?.managed
                      ? `${window.location.origin}/api/auth/complete`
                      : '/library',
                  });
                  if (result.error) {
                    setError(result.error.message || 'Connexion Google indisponible.');
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
            {error && (
              <p className="alert error" role="alert">
                {error}
              </p>
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
                        : 'Entrer dans mon laboratoire'}
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
        </div>
      </section>
    </main>
  );
}
