import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, json } from '../lib/api';
export function AdminPage() {
  const [after, setAfter] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const accounts = useQuery({
    queryKey: ['admin-accounts', after],
    queryFn: () =>
      api<{ accounts: any[]; next: string | null }>(
        `/admin/accounts?after=${encodeURIComponent(after)}`,
      ),
    retry: false,
  });
  const events = useQuery({
    queryKey: ['admin-events'],
    queryFn: () => api<any[]>('/admin/billing/events'),
    retry: false,
  });
  return (
    <main className="account-page">
      <Link to="/billing">← Mon abonnement</Link>
      <h1>Administration</h1>
      <p>
        Réservé au propriétaire vérifié côté serveur. Aucun outil d’attribution de privilèges depuis
        le navigateur. Le contenu des documents n’est pas affiché.
      </p>
      {(error || accounts.error) && <p role="alert">{error || accounts.error?.message}</p>}
      <div className="admin-accounts">
        {accounts.data?.accounts.map((a) => (
          <section className="account-panel" key={a.id}>
            <h2>{a.name}</h2>
            <p>
              {a.email}
              <br />
              Droit effectif : {a.rights.role} · {a.subscription?.status || 'Sans abonnement'}
              <br />
              Client : {a.subscription?.customerId || '—'} · Abonnement :{' '}
              {a.subscription?.subscriptionId || '—'}
            </p>
            <button
              className="button"
              disabled={busy || !a.subscription?.customerId}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await api('/admin/billing/reconcile', {
                    method: 'POST',
                    body: json({ userId: a.id }),
                  });
                  await accounts.refetch();
                  await events.refetch();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Resynchroniser Stripe
            </button>
          </section>
        ))}
      </div>
      <div className="account-actions">
        <button className="button" disabled={!after} onClick={() => setAfter('')}>
          Première page
        </button>
        <button
          className="button"
          disabled={!accounts.data?.next}
          onClick={() => setAfter(accounts.data!.next!)}
        >
          Comptes suivants
        </button>
      </div>
      <h2>Derniers webhooks (100 maximum)</h2>
      {events.error && <p role="alert">{events.error.message}</p>}
      <ul>
        {events.data?.map((e) => (
          <li key={e.stripeEventId}>
            {e.type} · {e.mode} · {e.outcome || 'En attente'} · {e.stripeEventId}
          </li>
        ))}
      </ul>
    </main>
  );
}
