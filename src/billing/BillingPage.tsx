import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowUpRight, Check, FlaskConical } from 'lucide-react';
import { api, json } from '../lib/api';
import { plans, type Plan } from '../shared/plans';
import { LegalLinks } from './LegalPage';
import { paymentLinks } from './payment-links';

type State = {
  rights: {
    tier: Plan;
    role: string;
    permanent: boolean;
    billingExempt: boolean;
    quotas: { documents: number; bytes: number; clozes: number; versions: number };
  };
  usage: { documents: number; bytes: number; clozes: number };
  manageReady: boolean;
  mode: string | null;
  subscription: null | {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
  };
};
const date = (d: string) =>
  new Intl.DateTimeFormat('fr', { dateStyle: 'long' }).format(new Date(d));
const statuses: Record<string, string> = {
  active: 'Actif',
  past_due: 'Paiement en retard',
  unpaid: 'Impayé',
  canceled: 'Résilié',
  incomplete: 'Paiement à terminer',
  incomplete_expired: 'Paiement expiré',
  trialing: 'Essai sans droits payants',
  paused: 'Suspendu',
  inactive: 'Aucun abonnement synchronisé',
};
function PlanCards({ current, exempt = false }: { current?: Plan; exempt?: boolean }) {
  return (
    <div className="plan-grid">
      {(Object.keys(plans) as Plan[]).map((id) => (
        <section className={`plan-card ${id === 'pro' ? 'featured' : ''}`} key={id}>
          <span className="plan-label">
            {id === 'free'
              ? 'Pour commencer'
              : id === 'pro'
                ? 'Pour approfondir'
                : 'Pour aller plus loin'}
          </span>
          <h2>{plans[id].name}</h2>
          <p className="plan-price">
            {plans[id].monthlyCents / 100} €<small> / mois</small>
          </p>
          <ul className="plan-features">
            {[
              `${plans[id].documents.toLocaleString('fr')} documents`,
              `${plans[id].clozes.toLocaleString('fr')} passages à mémoriser`,
              `${plans[id].bytes / 1024 / 1024} Mo d’images privées`,
              `${plans[id].versions} dernières versions par document`,
            ].map((text) => (
              <li key={text}>
                <Check size={15} aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
          {id === 'free' ? (
            <Link className="button full" to="/library">
              {current === 'free' ? 'Ma formule actuelle' : 'Ouvrir mon laboratoire'}
            </Link>
          ) : exempt ? (
            <span className="plan-current">Inclus avec votre accès propriétaire</span>
          ) : current === id ? (
            <span className="plan-current">Votre formule actuelle</span>
          ) : (
            <a
              className={`button full ${id === 'pro' ? 'primary' : ''}`}
              href={paymentLinks[id]}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Choisir ${plans[id].name} (Stripe, nouvel onglet)`}
            >
              Choisir {plans[id].name}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
        </section>
      ))}
    </div>
  );
}
function OfferNote() {
  return (
    <div className="offer-note">
      <p>
        Éditeur complet, textes à trous et révisions FSRS dans toutes les formules. Images : 4 Mo
        maximum par fichier. Les limites de la formule gratuite restent provisoires.
      </p>
      <p>
        Les boutons ouvrent vos liens de paiement Stripe. Le rattachement automatique du paiement à
        votre compte n’est pas encore actif : payer via ces liens ne débloque pas automatiquement
        Pro ou Premium dans l’application.
      </p>
    </div>
  );
}
export function PricingPage() {
  return (
    <main className="account-page pricing-page">
      <Link className="back-link" to="/library">
        <ArrowLeft size={16} /> Le laboratoire
      </Link>
      <header className="pricing-heading">
        <span className="eyebrow">UN ESPACE POUR VOS IDÉES</span>
        <h1>Les formules du laboratoire</h1>
        <p>Écrivez librement. Faites durer vos découvertes.</p>
      </header>
      <PlanCards />
      <OfferNote />
      <LegalLinks />
    </main>
  );
}
export function BillingPage({ userId }: { userId: string }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const state = useQuery({ queryKey: ['billing', userId], queryFn: () => api<State>('/billing') });
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const s = state.data;
  return (
    <main className="account-page pricing-page">
      <Link className="back-link" to="/library">
        <ArrowLeft size={16} /> Mes documents
      </Link>
      <header className="pricing-heading">
        <span className="eyebrow">VOTRE LABORATOIRE</span>
        <h1>Mon abonnement</h1>
        <p>Un peu plus de place pour vos grandes idées.</p>
      </header>
      {(error || state.error) && (
        <p className="alert error" role="alert">
          {error || state.error?.message}
          <button className="text-button" onClick={() => void state.refetch()}>
            Réessayer
          </button>
        </p>
      )}
      {notice && (
        <p className="alert info" role="status">
          {notice}
        </p>
      )}
      {s ? (
        <section className="account-panel current-plan">
          <div className="current-plan-title">
            <span className="brand-symbol">
              <FlaskConical size={24} aria-hidden="true" />
            </span>
            <div>
              <span className="eyebrow">VOS DROITS ACTUELS</span>
              <h2>
                {s.rights.permanent
                  ? 'Premium permanent · Propriétaire'
                  : `Formule ${plans[s.rights.tier].name}`}
              </h2>
            </div>
          </div>
          <p className="usage-line">
            {s.usage.documents} / {s.rights.quotas.documents} documents <span>·</span>{' '}
            {s.usage.clozes} / {s.rights.quotas.clozes.toLocaleString('fr')} passages <span>·</span>{' '}
            {(s.usage.bytes / 1024 / 1024).toFixed(1)} / {s.rights.quotas.bytes / 1024 / 1024} Mo
            d’images
          </p>
          <p className="muted small">
            {s.rights.quotas.versions} dernières versions consultables par document. Aucune archive
            ni aucun document n’est supprimé lors d’un changement de formule.
          </p>
          {s.rights.billingExempt ? (
            <p>Votre accès Premium est permanent, gratuit et sans abonnement Stripe.</p>
          ) : (
            s.subscription && (
              <p>
                {statuses[s.subscription.status] || 'Vérification nécessaire'}
                {s.subscription.currentPeriodEnd &&
                  ` · ${s.subscription.cancelAtPeriodEnd ? 'Fin prévue' : 'Fin de période'} : ${date(s.subscription.cancelAt || s.subscription.currentPeriodEnd)}`}
              </p>
            )
          )}
          {s.manageReady && !s.rights.billingExempt && (
            <div className="account-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await api<{ url: string }>('/billing/portal', {
                      method: 'POST',
                      body: json({}),
                    });
                    window.location.assign(r.url);
                  })
                }
              >
                Gérer ou résilier mon abonnement
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api('/billing/refresh', { method: 'POST', body: json({}) });
                    await client.invalidateQueries({ queryKey: ['billing', userId] });
                    await client.invalidateQueries({ queryKey: ['profile', userId] });
                    setNotice('Les droits ont été relus auprès de Stripe.');
                  })
                }
              >
                Actualiser mes droits
              </button>
            </div>
          )}
          {s.rights.role === 'owner' && (
            <Link to="/admin">Administration des comptes et abonnements</Link>
          )}
        </section>
      ) : state.isPending ? (
        <p role="status">Chargement des droits…</p>
      ) : null}
      {s?.mode === 'test' && (
        <p className="alert info">
          Le suivi des droits est en mode test. Les liens publics ci-dessous ouvrent les offres
          Stripe fournies par l’éditeur, indépendamment de ce mode.
        </p>
      )}
      <PlanCards current={s?.rights.tier} exempt={s?.rights.billingExempt} />
      {!s?.rights.billingExempt && <OfferNote />}
      <LegalLinks />
    </main>
  );
}
