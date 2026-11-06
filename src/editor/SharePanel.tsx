import { useEffect, useState } from 'react';
import { api, json } from '../lib/api';
export function SharePanel({
  id,
  flush,
  onClose,
}: {
  id: string;
  flush: () => Promise<void>;
  onClose: () => void;
}) {
  const [share, setShare] = useState<{ token: string; mode: string } | null>(null),
    [mode, setMode] = useState('snapshot'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    void api<typeof share>(`/documents/${id}/share`)
      .then((s) => {
        setShare(s);
        if (s) setMode(s.mode);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const link = share ? `${location.origin}/s/${share.token}` : '';
  return (
    <aside className="share-panel" aria-label="Partager le document">
      <div className="context-heading">
        <strong>Partager en lecture seule</strong>
        <button className="icon-button" aria-label="Fermer le partage" onClick={onClose}>
          ×
        </button>
      </div>
      <p>
        Toute personne disposant du lien pourra lire et réviser ce document, puis en créer sa propre
        copie.
      </p>
      {share ? (
        <>
          <label>
            Lien public
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
          <p>
            {share.mode === 'live'
              ? 'Les modifications enregistrées sont visibles par les visiteurs.'
              : 'Cette version est figée au moment de la création du lien.'}
          </p>
          <button
            className="button primary"
            onClick={() =>
              void run(async () => {
                await navigator.clipboard.writeText(link);
                setNotice('Lien copié.');
              })
            }
          >
            Copier le lien
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(`/documents/${id}/share`, { method: 'DELETE' });
                setShare(null);
                setNotice('Lien révoqué.');
              })
            }
          >
            Révoquer le lien
          </button>
        </>
      ) : (
        <>
          <label>
            Version partagée
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="snapshot">Version figée</option>
              <option value="live">Toujours à jour</option>
            </select>
          </label>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await flush();
                setShare(
                  await api(`/documents/${id}/share`, { method: 'POST', body: json({ mode }) }),
                );
              })
            }
          >
            Créer le lien public
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </aside>
  );
}
