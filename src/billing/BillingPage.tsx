import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, json, ApiError } from '../lib/api';
import { plans, offerVersion, type PaidPlan, type Plan } from '../shared/plans';
import { LegalLinks } from './LegalPage';

type Rights = {
  tier: Plan;
  role: string;
  permanent: boolean;
  billingExempt: boolean;
  quotas: { documents: number; bytes: number; clozes: number; versions: number };
};
type Catalog = {
  checkoutReady: boolean;
  limitsApproved: boolean;
  termsVersion: string | null;
  mode: string | null;
};
type State = {
  rights: Rights;
  usage: { documents: number; bytes: number; clozes: number };
  checkoutReady: boolean;
  manageReady: boolean;
  mode: string | null;
  subscription: null | {
    status: string;
    invoiceStatus: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
    syncedAt: string | null;
  };
};
const date = (d: string) =>
  new Intl.DateTimeFormat('fr', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(d));
const statuses: Record<string, string> = {
  active: 'Actif',
  past_due: 'Paiement en retard',
  unpaid: 'Impayé',
  canceled: 'Résilié',
  incomplete: 'Paiement à terminer',
  incomplete_expired: 'Paiement expiré',
  trialing: 'Essai sans droits payants',
  paused: 'Suspendu',
  inactive: 'Aucun abonnement',
  multiple_subscriptions: 'Plusieurs abonnements : vérification nécessaire',
  customer_deleted: 'Compte de facturation fermé',
};
export function PricingPage() {
  const catalog = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => api<Catalog>('/billing/plans'),
  });
  return (
    <main className="account-page">
      <Link to="/">Accueil</Link>
      <h1>Les formules du laboratoire</h1>
      {catalog.error && <p role="alert">{catalog.error.message}</p>}
      {!catalog.data?.checkoutReady && (
        <p className="notice">
          Les souscriptions payantes ne sont pas encore ouvertes. Les tarifs ci-dessous sont les
          tarifs cibles ; aucun paiement n’est proposé tant que le raccordement et les informations
          contractuelles ne sont pas validés.
        </p>
      )}
      <PlanCards approved={Boolean(catalog.data?.limitsApproved)} />
      <p>
        Le traitement de texte, les versions, les textes à trous et FSRS sont accessibles dans les
        trois formules. Les plafonds concernent les documents (corbeille incluse), passages actifs,
        fenêtre d’historique et images ; taille maximale d’une image : 4 Mo. Il ne s’agit pas d’un
        espace disque général.
      </p>
      <Link className="button primary" to="/billing">
        Mon abonnement
      </Link>
      <LegalLinks />
    </main>
  );
}
function PlanCards({
  approved,
  action,
  disabled,
}: {
  approved: boolean;
  action?: (plan: PaidPlan) => void;
  disabled?: boolean;
}) {
  return (
    <div className="plan-grid">
      {(Object.keys(plans) as Plan[]).map((id) => (
        <section className="plan-card" key={id}>
          <h2>{plans[id].name}</h2>
          <p className="plan-price">
            {plans[id].monthlyCents / 100} €
            <small> / mois{id !== 'free' && approved ? ' TTC' : ''}</small>
          </p>
          <p>
            {plans[id].documents} documents
            <br />
            {plans[id].bytes / 1024 / 1024} Mo d’images privées
            <br />
            {plans[id].clozes.toLocaleString('fr')} passages actifs
            <br />
            {plans[id].versions} dernières versions par document
          </p>
          {id !== 'free' && !approved && (
            <p className="muted small">
              Plafonds repris de vos offres Stripe existantes ; ventes non ouvertes.
            </p>
          )}
          {id !== 'free' && action && (
            <button className="button primary" disabled={disabled} onClick={() => action(id)}>
              Choisir {plans[id].name}
            </button>
          )}
        </section>
      ))}
    </div>
  );
}
export function BillingPage({ userId }: { userId: string }) {
  const [params] = useSearchParams(),
    client = useQueryClient();
  const [accepted, setAccepted] = useState(false),
    [immediate, setImmediate] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const catalog = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => api<Catalog>('/billing/plans'),
  });
  const state = useQuery({
    queryKey: ['billing', userId],
    queryFn: () => api<State>('/billing'),
    refetchInterval: params.has('checkout') ? 10000 : false,
  });
  async function refresh() {
    await api('/billing/refresh', { method: 'POST', body: json({}) });
    await client.invalidateQueries({ queryKey: ['billing'] });
    await client.invalidateQueries({ queryKey: ['profile'] });
    setNotice('Les droits ont été relus auprès de Stripe.');
  }
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
  useEffect(() => {
    if (params.get('checkout') === 'returned')
      setNotice(
        'Retour du paiement : cette page ne prouve pas un règlement. Les droits ci-dessous proviennent uniquement du serveur.',
      );
  }, [params]);
  async function checkout(plan: PaidPlan) {
    await run(async () => {
      const key = `lab-checkout-${userId}-${plan}-${catalog.data?.termsVersion}`;
      let requestId = sessionStorage.getItem(key);
      if (!requestId) {
        requestId = crypto.randomUUID();
        sessionStorage.setItem(key, requestId);
      }
      let result: { url: string };
      try {
        result = await api<{ url: string }>('/billing/checkout', {
          method: 'POST',
          body: json({
            plan,
            requestId,
            accepted,
            immediateAccess: immediate,
            termsVersion: catalog.data?.termsVersion,
            offerVersion,
          }),
        });
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) sessionStorage.removeItem(key);
        throw error;
      }
      window.location.assign(result.url);
    });
  }
  const s = state.data;
  return (
    <main className="account-page">
      <Link to="/library">← Mes documents</Link>
      <h1>Mon abonnement</h1>
      {(error || state.error || catalog.error) && (
        <p className="error" role="alert">
          {error || state.error?.message || catalog.error?.message}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {s ? (
        <section className="account-panel">
          <h2>
            {s.rights.permanent
              ? 'Premium permanent · Propriétaire'
              : `Formule ${plans[s.rights.tier].name}`}
          </h2>
          <p>
            {s.usage.documents} / {s.rights.quotas.documents} documents ·{' '}
            {(s.usage.bytes / 1024 / 1024).toFixed(1)} / {s.rights.quotas.bytes / 1024 / 1024} Mo
            d’images
          </p>
          <p>
            {s.usage.clozes} / {s.rights.quotas.clozes.toLocaleString('fr')} passages actifs ·{' '}
            {s.rights.quotas.versions} dernières versions consultables par document. Les comptes
            existants conservent leur fenêtre historique de 100 versions ; aucune archive n’est
            supprimée.
          </p>
          {s.rights.billingExempt ? (
            <p>
              Aucun abonnement Stripe ni paiement nécessaire. L’accès Premium du propriétaire est
              permanent.
            </p>
          ) : (
            <>
              <p>
                État : {statuses[s.subscription?.status || 'inactive'] || 'Vérification nécessaire'}
                .
              </p>
              {s.subscription?.currentPeriodEnd && (
                <p>
                  {s.subscription.cancelAtPeriodEnd ? 'Fin prévue' : 'Fin de période'} :{' '}
                  {date(s.subscription.cancelAt || s.subscription.currentPeriodEnd)}.
                </p>
              )}
              {s.subscription && s.rights.tier === 'free' && (
                <p>
                  Les droits payants ne sont pas actifs. Vos documents et révisions sont conservés ;
                  vous pouvez continuer à les ouvrir, les modifier et les exporter. Un dépassement
                  bloque seulement les nouvelles créations ou images.
                </p>
              )}
              <div className="account-actions">
                <button
                  className="button"
                  disabled={busy || !s.manageReady}
                  onClick={() =>
                    run(async () => {
                      const r = await api<{ url: string }>('/billing/portal', {
                        method: 'POST',
                        body: json({}),
                      });
                      window.location.assign(r.url);
                    })
                  }
                >
                  Gérer mon abonnement
                </button>
                <button
                  className="button"
                  disabled={busy || !s.manageReady}
                  onClick={() =>
                    run(async () => {
                      const r = await api<{ url: string }>('/billing/portal', {
                        method: 'POST',
                        body: json({}),
                      });
                      window.location.assign(r.url);
                    })
                  }
                >
                  Résilier en ligne
                </button>
                <button
                  className="button subtle"
                  disabled={busy || !s.manageReady}
                  onClick={() => run(refresh)}
                >
                  Actualiser mes droits
                </button>
              </div>
            </>
          )}
          {s.rights.role === 'owner' && (
            <Link to="/admin">Administration des comptes et abonnements</Link>
          )}
        </section>
      ) : (
        <p>Chargement des droits…</p>
      )}
      {s?.mode === 'test' && (
        <p className="notice">
          Mode test Stripe : aucun abonnement réel n’est proposé par cette configuration.
        </p>
      )}
      {!s?.checkoutReady && (
        <p className="notice">
          Les souscriptions sont fermées tant que Stripe et les informations légales ne sont pas
          finalisés. Aucun lien de paiement non rattaché à votre compte n’est proposé.
        </p>
      )}
      {!s?.rights.billingExempt && (
        <>
          <h2>Choisir une formule</h2>
          <label className="check-label">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            J’ai lu et j’accepte les <Link to="/legal/cgv">CGV</Link> et les conditions
            d’abonnement.
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={immediate}
              onChange={(e) => setImmediate(e.target.checked)}
            />
            Je demande l’accès immédiat après paiement. Mon droit de rétractation n’est pas
            automatiquement supprimé.
          </label>
          <PlanCards
            approved={Boolean(catalog.data?.limitsApproved)}
            action={checkout}
            disabled={busy || !accepted || !immediate || !s?.checkoutReady}
          />
          <p>
            Abonnement mensuel à reconduction automatique, sans durée minimale au-delà de la période
            souscrite. La résiliation arrête le prochain renouvellement et conserve l’accès payé
            jusqu’à la fin de période. Les changements de formule et leurs montants sont confirmés
            dans le portail Stripe avant validation.
          </p>
        </>
      )}
      <LegalLinks />
    </main>
  );
}
