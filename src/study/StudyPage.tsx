import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ArrowLeft, BookOpen, RotateCcw } from 'lucide-react';
import { Brand } from '../components/Brand';
import { api, ApiError, json } from '../lib/api';
import {
  priorityLabels,
  ratingLabels,
  type MemoryPassage,
  type Priority,
  type StudyFilters,
  type StudySession,
} from '../shared/learning';
import type { DocumentRecord, DocumentSummary, FolderRecord } from '../shared/document';
import { StudyDocument } from './StudyDocument';
type Props = { user: { id: string } };
const localDate = (value: string) =>
  new Intl.DateTimeFormat('fr', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
const levels = (level: string): Priority[] =>
  level === 'high' ? ['high'] : level === 'medium' ? ['high', 'medium'] : ['high', 'medium', 'low'];
function LevelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label>
      Priorités
      <select
        aria-label="Priorités à réviser"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="high">Haute seulement</option>
        <option value="medium">Haute et moyenne</option>
        <option value="all">Toutes les priorités</option>
      </select>
    </label>
  );
}
function Header({ title, back = '/library' }: { title: string; back?: string }) {
  return (
    <header className="study-header">
      <Link className="icon-button" aria-label="Revenir à la bibliothèque" to={back}>
        <ArrowLeft size={21} />
      </Link>
      <Brand compact />
      <h1>{title}</h1>
    </header>
  );
}
function useKeys(handler: (event: KeyboardEvent) => void) {
  const live = useRef(handler);
  live.current = handler;
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(
          e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(e.target.tagName))
        )
      )
        live.current(e);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
}
export function StudyPage({ user }: Props) {
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const [scope, setScope] = useState(
    params.has('document') ? 'documents' : params.has('folder') ? 'folders' : 'all',
  );
  const [documentIds, setDocuments] = useState<string[]>(
      params.get('document') ? [params.get('document')!] : [],
    ),
    [folderIds, setFolders] = useState<string[]>(
      params.get('folder') ? [params.get('folder')!] : [],
    );
  const [level, setLevel] = useState('all'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const docs = useQuery({
    queryKey: ['study-documents', user.id],
    queryFn: () => api<DocumentSummary[]>('/documents'),
  });
  const folders = useQuery({
    queryKey: ['folders', user.id],
    queryFn: () => api<FolderRecord[]>('/folders'),
  });
  const sessions = useQuery({
    queryKey: ['study-sessions', user.id],
    queryFn: () =>
      api<Omit<StudySession, 'current' | 'total' | 'completed' | 'skipped'>[]>(
        '/learning/sessions',
      ),
  });
  const filters: StudyFilters = {
    documentIds: scope === 'documents' ? documentIds : [],
    folderIds: scope === 'folders' ? folderIds : [],
    priorities: levels(level),
  };
  const valid =
    scope === 'all' ||
    (scope === 'documents' && documentIds.length > 0) ||
    (scope === 'folders' && folderIds.length > 0);
  const due = useQuery({
    queryKey: ['eligible', user.id, filters],
    queryFn: () =>
      api<{ count: number; sessionLimit: number }>('/learning/eligible', {
        method: 'POST',
        body: json(filters),
      }),
    enabled: valid,
    refetchInterval: 30000,
  });
  const startId = useRef<string | null>(null);
  useEffect(() => {
    startId.current = null;
  }, [JSON.stringify(filters)]);
  async function start() {
    setBusy(true);
    setError('');
    try {
      startId.current ??= crypto.randomUUID();
      const session = await api<StudySession>('/learning/sessions', {
        method: 'POST',
        body: json({ id: startId.current, filters }),
      });
      navigate(`/study/session/${session.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="study-shell">
      <Header title="Vos révisions" />
      <div className="study-settings">
        <section className="study-card">
          <span className="eyebrow">RÉVISION PROGRAMMÉE</span>
          <h2>Reprendre au bon moment.</h2>
          <p>
            Chaque passage suit son propre calendrier. Choisissez ce que vous souhaitez réviser
            aujourd’hui.
          </p>
          <label>
            Périmètre
            <select
              aria-label="Périmètre de révision"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="all">Tous mes documents</option>
              <option value="documents">Choisir des documents</option>
              <option value="folders">Choisir des dossiers et leurs sous-dossiers</option>
            </select>
          </label>
          {scope !== 'all' && (
            <fieldset className="study-scope">
              <legend>{scope === 'documents' ? 'Documents' : 'Dossiers'}</legend>
              {(scope === 'documents' ? docs.data : folders.data)?.map((item) => (
                <label key={item.id}>
                  <input
                    type="checkbox"
                    checked={(scope === 'documents' ? documentIds : folderIds).includes(item.id)}
                    onChange={(e) => {
                      const setter = scope === 'documents' ? setDocuments : setFolders;
                      setter((ids) =>
                        e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id),
                      );
                    }}
                  />
                  {'title' in item ? item.title : item.name}
                </label>
              ))}
            </fieldset>
          )}
          <LevelPicker value={level} onChange={setLevel} />
          {(error || due.error || docs.error || folders.error || sessions.error) && (
            <p role="alert" className="alert error">
              {error ||
                due.error?.message ||
                docs.error?.message ||
                folders.error?.message ||
                sessions.error?.message}
            </p>
          )}
          <p role="status">
            {!valid
              ? 'Choisissez au moins un élément.'
              : due.isPending
                ? 'Recherche des passages…'
                : `${due.data?.count ?? 0} passage(s) à réviser maintenant.`}
          </p>
          {(due.data?.count ?? 0) > 200 && (
            <p>
              Chaque séance contient jusqu’à 200 passages. Les suivants restent disponibles pour une
              autre séance.
            </p>
          )}
          <button
            className="button primary"
            disabled={busy || !valid || !due.data?.count}
            onClick={() => void start()}
          >
            <BookOpen size={17} />
            {busy ? 'Préparation…' : 'Commencer la révision'}
          </button>
        </section>
        <section className="study-card">
          <span className="eyebrow">ENTRAÎNEMENT LIBRE</span>
          <h2>À votre rythme.</h2>
          <p>
            Masquez et révélez les réponses autant que vous le souhaitez. Le calendrier reste
            inchangé.
          </p>
          <label>
            Document
            <select
              aria-label="Document en révision libre"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) navigate(`/study/free/${e.target.value}`);
              }}
            >
              <option value="">Choisir un document…</option>
              {docs.data?.map((doc) => (
                <option value={doc.id} key={doc.id}>
                  {doc.title}
                </option>
              ))}
            </select>
          </label>
        </section>
        <section className="study-card">
          <h2>Séances à reprendre</h2>
          {!sessions.data?.some((s) => s.status === 'active') && (
            <p className="muted">Aucune séance interrompue.</p>
          )}
          {sessions.data
            ?.filter((s) => s.status === 'active')
            .map((s) => (
              <Link className="button subtle" key={s.id} to={`/study/session/${s.id}`}>
                Reprendre la séance du {localDate(s.createdAt)}
              </Link>
            ))}
        </section>
      </div>
    </main>
  );
}
export function FreeStudyPage({ user }: Props) {
  const { id } = useParams();
  const [level, setLevel] = useState('all'),
    [revealed, setRevealed] = useState<Set<string>>(new Set()),
    [hints, setHints] = useState<Set<string>>(new Set());
  const doc = useQuery({
    queryKey: ['free-document', user.id, id],
    queryFn: () => api<DocumentRecord>(`/documents/${id}`),
  });
  const passages = useQuery({
    queryKey: ['free-anchors', user.id, id],
    queryFn: () => api<MemoryPassage[]>(`/documents/${id}/anchors`),
  });
  const selected = (passages.data || []).filter(
    (p) => p.status === 'active' && levels(level).includes(p.priority),
  );
  const hidden = selected.filter((p) => !revealed.has(p.id)).map((p) => p.id);
  const reveal = (id: string) => setRevealed((s) => new Set([...s, id]));
  useKeys((e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (hidden[0]) reveal(hidden[0]);
    }
    if (e.key.toLowerCase() === 'r') {
      setRevealed(new Set());
      setHints(new Set());
    }
  });
  if (doc.isPending || passages.isPending)
    return <p className="app-loading">Ouverture de la révision…</p>;
  if (doc.error || passages.error)
    return (
      <p role="alert" className="alert error">
        {doc.error?.message || passages.error?.message}
        <Link to="/study">Revenir aux révisions</Link>
      </p>
    );
  if (doc.data.deletedAt)
    return (
      <main>
        <Header title="Document dans la corbeille" />
        <p>Restaurez ce document pour le réviser.</p>
      </main>
    );
  return (
    <main className="study-shell">
      <Header title={`Révision libre · ${doc.data.title}`} back={`/document/${id}`} />
      <div className="study-controls">
        <LevelPicker
          value={level}
          onChange={(v) => {
            setLevel(v);
            setRevealed(new Set());
            setHints(new Set());
          }}
        />
        <p role="status">
          {selected.length - hidden.length} / {selected.length} réponses révélées · calendrier
          inchangé
        </p>
        <button
          className="button primary"
          onClick={() => setRevealed(new Set(selected.map((p) => p.id)))}
        >
          Révéler toutes les réponses
        </button>
        <button
          className="button subtle"
          onClick={() => {
            setRevealed(new Set());
            setHints(new Set());
          }}
        >
          <RotateCcw size={16} />
          Recommencer
        </button>
        <small>Espace : révéler le passage suivant · R : recommencer</small>
      </div>
      {passages.data?.some((p) => p.status === 'needs_review') && (
        <p className="alert info">
          Certains passages ont changé et restent visibles. Validez-les dans l’éditeur pour les
          réactiver.
        </p>
      )}
      {!selected.length && (
        <p className="alert info">
          Aucun passage actif pour ces priorités. Créez ou validez des annotations dans l’éditeur.
        </p>
      )}
      <div className="study-workspace">
        <aside className="study-passages" aria-label="Passages de la révision">
          {selected.map((p, i) => (
            <article key={p.id}>
              <strong>Passage {i + 1}</strong>
              <small>Priorité {priorityLabels[p.priority].toLowerCase()}</small>
              {p.hint && (
                <>
                  <button
                    className="text-button"
                    onClick={() => setHints((s) => new Set([...s, p.id]))}
                  >
                    Afficher l’indice du passage {i + 1}
                  </button>
                  {hints.has(p.id) && <p className="hint">{p.hint}</p>}
                </>
              )}
              <button
                className="button subtle"
                disabled={revealed.has(p.id)}
                onClick={() => reveal(p.id)}
              >
                {revealed.has(p.id) ? 'Réponse révélée' : `Révéler la réponse ${i + 1}`}
              </button>
            </article>
          ))}
        </aside>
        <StudyDocument key={doc.data.id} document={doc.data} hidden={hidden} onReveal={reveal} />
      </div>
    </main>
  );
}

const pendingRatingSchema = z
  .object({
    sessionId: z.string().uuid(),
    itemId: z.string().uuid(),
    actionId: z.string().uuid(),
    rating: z.number().int().min(1).max(4),
  })
  .strict();
type PendingRating = z.infer<typeof pendingRatingSchema>;
export function ScheduledStudyPage({ user }: Props) {
  const { id } = useParams();
  const [session, setSession] = useState<StudySession | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [showHint, setShowHint] = useState(false),
    [hasPending, setHasPending] = useState(false);
  const storageKey = `lab-rating/${user.id}/${id}`;
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  async function load() {
    setSession(await api<StudySession>(`/learning/sessions/${id}`));
  }
  async function sendPending() {
    let raw: string | null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      throw new Error(
        'Le navigateur ne permet pas de lire la réponse conservée. Autorisez le stockage local pour reprendre la séance.',
      );
    }
    if (!raw) {
      setHasPending(false);
      return false;
    }
    setHasPending(true);
    let pending: PendingRating;
    try {
      pending = pendingRatingSchema.parse(JSON.parse(raw));
    } catch {
      throw new Error(
        'La réponse locale est illisible. Vérifiez l’état enregistré de la séance avant de l’écarter.',
      );
    }
    setPendingItemId(pending.itemId);
    if (pending.sessionId !== id)
      throw new Error('La réponse locale ne correspond pas à cette séance.');
    const result = await api<{ recorded: boolean; session: StudySession }>(
      `/learning/sessions/${id}/items/${pending.itemId}/rate`,
      { method: 'POST', body: json({ actionId: pending.actionId, rating: pending.rating }) },
    );
    localStorage.removeItem(storageKey);
    setHasPending(false);
    setSession(result.session);
    setShowHint(false);
    return true;
  }
  async function run(action: () => Promise<void>) {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    setSession(null);
    void run(async () => {
      const sent = await sendPending();
      if (!sent) await load();
    });
  }, [id, user.id]);
  useEffect(() => {
    const online = () =>
      void run(async () => {
        if (!(await sendPending())) await load();
      });
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [id, user.id]);
  async function reveal() {
    if (!session?.current || session.current.revealed || hasPending) return;
    await run(async () => {
      setSession(
        await api<StudySession>(
          `/learning/sessions/${id}/items/${session.current!.itemId}/reveal`,
          { method: 'POST', body: json({}) },
        ),
      );
    });
  }
  async function rate(rating: number) {
    if (!session?.current?.revealed || hasPending) return;
    await run(async () => {
      const pending: PendingRating = {
        sessionId: id!,
        itemId: session.current!.itemId,
        actionId: crypto.randomUUID(),
        rating,
      };
      // Persist before sending: a lost HTTP response can safely be retried after refresh.
      try {
        localStorage.setItem(storageKey, JSON.stringify(pending));
      } catch {
        throw new Error(
          'Le navigateur ne peut pas conserver cette réponse. Aucun envoi n’a été effectué ; libérez du stockage local puis réessayez.',
        );
      }
      setHasPending(true);
      await sendPending();
    });
  }
  useKeys((e) => {
    if (busy) return;
    if (e.code === 'Space') {
      e.preventDefault();
      void reveal();
    }
    if (['1', '2', '3', '4'].includes(e.key) && session?.current?.revealed)
      void rate(Number(e.key));
  });
  const current = session?.current;
  return (
    <main className="study-shell">
      <Header title="Révision programmée" back="/study" />
      {error && (
        <div className="alert error" role="alert">
          <p>{error}</p>
          {hasPending ? (
            <>
              <p>
                Votre réponse est conservée sur cet appareil. Sa retransmission ne peut pas créer
                une seconde révision.
              </p>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await sendPending();
                  })
                }
              >
                Réessayer l’envoi
              </button>
              <button
                className="button subtle"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await load();
                  })
                }
              >
                Vérifier l’état de la séance
              </button>
              {session && session.current?.itemId !== pendingItemId && (
                <button
                  className="button subtle"
                  onClick={() => {
                    localStorage.removeItem(storageKey);
                    setHasPending(false);
                    setError('');
                  }}
                >
                  Écarter la réponse devenue obsolète
                </button>
              )}
            </>
          ) : (
            <button className="button" disabled={busy} onClick={() => void run(load)}>
              Recharger la séance
            </button>
          )}
        </div>
      )}
      {!session && !error && <p className="app-loading">Reprise de votre séance…</p>}
      {session && (
        <div className="study-controls">
          <p role="status">
            {session.completed} / {session.total} passages révisés
            {session.skipped ? ` · ${session.skipped} devenus inéligibles` : ''}
          </p>
          <Link className="text-button" to="/study">
            Interrompre et reprendre plus tard
          </Link>
        </div>
      )}
      {session && !current && (
        <section className="study-card study-finished">
          <h2>Séance terminée.</h2>
          <p>Vos réponses et vos prochaines dates de révision sont enregistrées.</p>
          <Link className="button primary" to="/study">
            Revenir aux révisions
          </Link>
        </section>
      )}
      {current && (
        <>
          <div className="study-controls">
            <h2>{current.document.title}</h2>
            <small>Priorité {priorityLabels[current.anchor.priority].toLowerCase()}</small>
            {current.anchor.hint && (
              <>
                <button className="button subtle" onClick={() => setShowHint(!showHint)}>
                  Afficher l’indice
                </button>
                {showHint && <p className="hint">{current.anchor.hint}</p>}
              </>
            )}
            {!current.revealed ? (
              <button
                className="button primary"
                disabled={busy || hasPending}
                onClick={() => void reveal()}
              >
                Révéler la réponse
              </button>
            ) : (
              <div className="rating-buttons" aria-label="Évaluer ma mémorisation">
                {Object.entries(ratingLabels).map(([rating, label]) => (
                  <button
                    className={`button rating-${rating}`}
                    key={rating}
                    disabled={busy || hasPending}
                    onClick={() => void rate(Number(rating))}
                  >
                    {rating} · {label}
                    <small>
                      {current.previews?.[rating] ? localDate(current.previews[rating]) : ''}
                    </small>
                  </button>
                ))}
              </div>
            )}
            <small>Espace : révéler · 1 à 4 : évaluer après révélation</small>
            <Link to={`/document/${current.document.id}`}>Ouvrir ce document dans l’éditeur</Link>
          </div>
          <StudyDocument
            key={`${current.itemId}/${current.document.revision}`}
            document={current.document}
            hidden={current.revealed ? [] : [current.anchor.id]}
            onReveal={() => void reveal()}
          />
        </>
      )}
    </main>
  );
}
