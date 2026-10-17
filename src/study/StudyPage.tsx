import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, EyeOff, Pencil } from 'lucide-react';
import { api, ApiError, json } from '../lib/api';
import {
  priorityLabels,
  difficultyLabels,
  matchesPassage,
  type MemoryPassage,
  type Difficulty,
  type ReviewFilters,
} from '../shared/learning';
import type { DocumentRecord, DocumentSummary, FolderRecord } from '../shared/document';
import { StudyDocument } from './StudyDocument';
import './review.css';

type Props = { user: { id: string } };
type ReviewDocument = { document: DocumentRecord; passages: MemoryPassage[] };
type Pending = { id: string; difficulty: Difficulty; difficultyRevision: number };
export function LegacyStudyRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/study/${id}` : '/study'} replace />;
}
export function StudyPage({ user }: Props) {
  const { id } = useParams(),
    [params] = useSearchParams(),
    navigate = useNavigate(),
    client = useQueryClient();
  const [folderId, setFolderId] = useState('');
  const [filters, setFilters] = useState<ReviewFilters>({ priority: 'all', difficulty: 'all' });
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [pending, setPending] = useState<Pending | null>(null),
    [busyId, setBusyId] = useState<string | null>(null);
  const sending = useRef(false);
  const docs = useQuery({
    queryKey: ['study-documents', user.id],
    queryFn: () => api<DocumentSummary[]>('/documents'),
  });
  const folders = useQuery({
    queryKey: ['folders', user.id],
    queryFn: () => api<FolderRecord[]>('/folders'),
  });
  const allowedFolders = new Set(folderId ? [folderId] : []);
  if (folderId)
    for (let n = 0; n < (folders.data?.length || 0); n++)
      for (const folder of folders.data || [])
        if (folder.parentId && allowedFolders.has(folder.parentId)) allowedFolders.add(folder.id);
  const available = (docs.data || []).filter(
    (d) => !folderId || (d.folderId && allowedFolders.has(d.folderId)),
  );
  useEffect(() => {
    if (!id && docs.data) {
      const requested = params.get('document');
      const first =
        docs.data.find((d) => d.id === requested) ||
        docs.data.find((d) => (d.passageCount || 0) > 0) ||
        docs.data[0];
      if (first) navigate(`/study/${first.id}`, { replace: true });
    }
  }, [id, docs.data, params, navigate]);
  const key = ['review-document', user.id, id];
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(id),
    refetchOnWindowFocus: true,
    queryFn: () => api<ReviewDocument>(`/documents/${id}/review`),
  });
  useEffect(() => {
    setError('');
    setMessage('');
    setPending(null);
  }, [id]);
  useEffect(() => setRevealed(new Set()), [id, filters.priority, filters.difficulty]);
  const selected = (query.data?.passages || []).filter((p) => matchesPassage(p, filters));
  const hidden = selected.filter((p) => !revealed.has(p.id)).map((p) => p.id);
  const reveal = (passageId: string) => setRevealed((s) => new Set([...s, passageId]));
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target.isContentEditable ||
        ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'SUMMARY'].includes(target.tagName)
      )
        return;
      if (e.code === 'Space' && hidden[0]) {
        e.preventDefault();
        reveal(hidden[0]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hidden.join(',')]);
  async function saveDifficulty(change: Pending) {
    if (sending.current) return;
    sending.current = true;
    setBusyId(change.id);
    setError('');
    setMessage('');
    setPending(change);
    try {
      const updated = await api<Pick<MemoryPassage, 'id' | 'difficulty' | 'difficultyRevision'>>(
        `/anchors/${change.id}/difficulty`,
        {
          method: 'PATCH',
          body: json({
            difficulty: change.difficulty,
            difficultyRevision: change.difficultyRevision,
          }),
        },
      );
      client.setQueryData<ReviewDocument>(
        key,
        (current) =>
          current && {
            ...current,
            passages: current.passages.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
          },
      );
      setPending(null);
      setMessage('Difficulté enregistrée.');
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && [404, 409].includes(e.status)) {
        setPending(null);
        await query.refetch();
      }
    } finally {
      sending.current = false;
      setBusyId(null);
    }
  }
  return (
    <main className="review-shell">
      <header className="review-heading">
        <Link
          className="icon-button"
          to={id ? `/document/${id}` : '/library'}
          aria-label={id ? 'Revenir à l’éditeur' : 'Revenir à la bibliothèque'}
        >
          <ArrowLeft size={19} />
        </Link>
        <h1>Réviser</h1>
        {id && (
          <Link className="button subtle review-edit" to={`/document/${id}`}>
            <Pencil size={15} /> Modifier le document
          </Link>
        )}
      </header>
      <div className="review-toolbar" aria-label="Commandes de révision">
        <label className="review-document-picker">
          Document
          <select
            aria-label="Document à réviser"
            value={id || ''}
            onChange={(e) => navigate(`/study/${e.target.value}`)}
          >
            {!id && <option value="">Choisir un document…</option>}
            {id && !available.some((d) => d.id === id) && query.data && (
              <option value={id}>{query.data.document.title}</option>
            )}
            {available.map((d) => (
              <option value={d.id} key={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        {!!folders.data?.length && (
          <label className="review-folder-picker">
            Dossier
            <select
              aria-label="Dossier des documents"
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
            >
              <option value="">Tous</option>
              {folders.data.map((f) => (
                <option value={f.id} key={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Priorité
          <select
            aria-label="Filtrer par priorité"
            value={filters.priority}
            onChange={(e) =>
              setFilters((f) => ({ ...f, priority: e.target.value as ReviewFilters['priority'] }))
            }
          >
            <option value="all">Toutes</option>
            {Object.entries(priorityLabels).map(([v, label]) => (
              <option value={v} key={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulté
          <select
            aria-label="Filtrer par difficulté"
            value={filters.difficulty}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                difficulty: e.target.value as ReviewFilters['difficulty'],
              }))
            }
          >
            <option value="all">Toutes</option>
            {Object.entries(difficultyLabels).map(([v, label]) => (
              <option value={v} key={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="review-reveal-actions">
          <button
            className="button primary"
            disabled={!hidden.length}
            onClick={() => setRevealed(new Set(selected.map((p) => p.id)))}
          >
            <Eye size={16} /> Tout révéler
          </button>
          <button
            className="button subtle"
            disabled={!revealed.size}
            onClick={() => setRevealed(new Set())}
          >
            <EyeOff size={16} /> Masquer
          </button>
        </div>
      </div>
      {(error || query.error || docs.error || folders.error) && (
        <div className="alert error" role="alert">
          {error || query.error?.message || docs.error?.message || folders.error?.message}
          {pending && (
            <button
              className="button"
              disabled={Boolean(busyId)}
              onClick={() => void saveDifficulty(pending)}
            >
              Réessayer l’enregistrement
            </button>
          )}
          {query.error && (
            <button className="button" onClick={() => void query.refetch()}>
              Réessayer
            </button>
          )}
        </div>
      )}
      {query.isFetching && !query.data && id && (
        <p className="app-loading">Ouverture du document…</p>
      )}
      {query.data && (
        <>
          <div className="review-context">
            <span>
              {selected.length
                ? `${hidden.length} trou${hidden.length > 1 ? 's' : ''} masqué${hidden.length > 1 ? 's' : ''}`
                : 'Aucun trou ne correspond aux filtres.'}
            </span>
            <span className="review-keyboard-help">
              Cliquez sur un trou pour le révéler · Espace : suivant
            </span>
            <span role="status" className="review-save-feedback">
              {busyId ? 'Enregistrement…' : message}
            </span>
          </div>
          {query.data.passages.some((p) => p.status === 'needs_review') && (
            <p className="review-notice">
              Certains passages modifiés restent visibles. Vous pouvez les valider dans l’éditeur.
            </p>
          )}
          <StudyDocument
            key={`${id}/${query.data.document.revision}`}
            document={query.data.document}
            passages={query.data.passages}
            selected={selected.map((p) => p.id)}
            hidden={hidden}
            onReveal={reveal}
            busyId={busyId}
            onDifficulty={(passageId, difficulty) => {
              const p = query.data.passages.find((p) => p.id === passageId);
              if (p)
                void saveDifficulty({
                  id: p.id,
                  difficulty,
                  difficultyRevision: p.difficultyRevision,
                });
            }}
          />
        </>
      )}
      {!id && !docs.isPending && !docs.data?.length && !docs.error && (
        <section className="review-empty">
          <h2>Vos documents, vos réponses.</h2>
          <p>Créez un document et sélectionnez du texte pour y ajouter vos premiers trous.</p>
          <Link className="button primary" to="/library">
            Ouvrir ma bibliothèque
          </Link>
        </section>
      )}
    </main>
  );
}
