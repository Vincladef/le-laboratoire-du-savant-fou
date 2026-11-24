import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown, Pencil, RotateCcw } from 'lucide-react';
import { api, ApiError, json } from '../lib/api';
import {
  priorityLabels,
  difficultyLabels,
  matchesPassage,
  type MemoryPassage,
  type Difficulty,
  type Priority,
  type ReviewFilters,
} from '../shared/learning';
import type { DocumentRecord, DocumentSummary, FolderRecord } from '../shared/document';
import { reviewGroups } from '../shared/review-groups';
import { StudyDocument } from './StudyDocument';
import './review.css';

type Props = { user: { id: string } };
type ReviewDocument = { document: DocumentRecord; passages: MemoryPassage[] };
type PendingDifficulty = {
  kind: 'difficulty';
  id: string;
  difficulty: Difficulty;
  difficultyRevision: number;
};
type PendingPriority = { kind: 'priority'; id: string; priority: Priority; revision: number };
type PendingHint = { kind: 'hint'; id: string; hint: string; revision: number };
type Pending = PendingDifficulty | PendingPriority | PendingHint;
export function ReviewFilter<T extends string>({
  title,
  labels,
  values,
  onChange,
}: {
  title: string;
  labels: Record<T, string>;
  values: T[];
  onChange: (values: T[]) => void;
}) {
  const entries = Object.entries(labels) as [T, string][];
  return (
    <details className="menu review-filter">
      <summary aria-label={`Filtrer par ${title.toLowerCase()}`}>
        <span>
          {title}
          <strong>
            {values.length === entries.length
              ? 'Toutes'
              : values.length === 1
                ? labels[values[0]]
                : values.length
                  ? `${values.length} sur ${entries.length}`
                  : 'Aucune'}
          </strong>
        </span>
        <ChevronDown size={14} />
      </summary>
      <fieldset className="review-filter-options">
        <legend>{title}</legend>
        {entries.map(([value, label]) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={values.includes(value)}
              onChange={(e) =>
                onChange(e.target.checked ? [...values, value] : values.filter((v) => v !== value))
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
    </details>
  );
}
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
  const [filters, setFilters] = useState<ReviewFilters>({
    priority: ['high', 'medium', 'low'],
    difficulty: ['easy', 'medium', 'hard', 'unrated'],
  });
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
  useEffect(() => {
    setRevealed(new Set());
  }, [id, filters.priority, filters.difficulty]);
  const groups = query.data ? reviewGroups(query.data.document.content) : null;
  const groupKey = (passageId: string) => groups?.keys.get(passageId) || passageId;
  const selected: MemoryPassage[] = [];
  const seenGroups = new Set<string>();
  for (const passage of query.data?.passages || []) {
    const key = groupKey(passage.id);
    if (seenGroups.has(key)) continue;
    seenGroups.add(key);
    if (matchesPassage(passage, filters)) selected.push(passage);
  }
  const selectedIds = selected.flatMap((p) => groups?.members.get(groupKey(p.id)) || [p.id]);
  const hidden = selectedIds.filter((id) => !revealed.has(groupKey(id)));
  const hiddenGroups = selected.filter((p) => !revealed.has(groupKey(p.id))).length;
  const reveal = (passageId: string) => {
    setRevealed((s) => new Set([...s, groupKey(passageId)]));
  };
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
  async function saveDifficulty(change: PendingDifficulty) {
    if (sending.current) return;
    sending.current = true;
    setBusyId(change.id);
    setError('');
    setMessage('');
    setPending(change);
    try {
      const updated = await api<
        Pick<MemoryPassage, 'id' | 'difficulty' | 'difficultyRevision'> & {
          memberIds: string[];
        }
      >(`/anchors/${change.id}/difficulty`, {
        method: 'PATCH',
        body: json({
          difficulty: change.difficulty,
          difficultyRevision: change.difficultyRevision,
        }),
      });
      client.setQueryData<ReviewDocument>(
        key,
        (current) =>
          current && {
            ...current,
            passages: current.passages.map((p) =>
              updated.memberIds.includes(p.id)
                ? {
                    ...p,
                    difficulty: updated.difficulty,
                    difficultyRevision: updated.difficultyRevision,
                  }
                : p,
            ),
          },
      );
      setPending(null);
      setMessage('Difficulté enregistrée.');
      requestAnimationFrame(() =>
        document.querySelector<HTMLButtonElement>('.review-reveal')?.focus({ preventScroll: true }),
      );
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
  async function savePriority(change: PendingPriority) {
    if (sending.current) return;
    sending.current = true;
    setBusyId(change.id);
    setError('');
    setMessage('');
    setPending(change);
    try {
      const updated = await api<{
        document: DocumentRecord;
        passage: Pick<MemoryPassage, 'id' | 'priority' | 'revision'>;
        passages?: Pick<MemoryPassage, 'id' | 'priority' | 'revision'>[];
      }>(`/anchors/${change.id}/priority`, {
        method: 'PATCH',
        body: json({ priority: change.priority, revision: change.revision }),
      });
      client.setQueryData<ReviewDocument>(
        key,
        (current) =>
          current && {
            ...current,
            document: updated.document,
            passages: current.passages.map((p) =>
              (updated.passages || [updated.passage]).find((member) => member.id === p.id)
                ? {
                    ...p,
                    ...(updated.passages || [updated.passage]).find(
                      (member) => member.id === p.id,
                    )!,
                  }
                : p,
            ),
          },
      );
      void client.invalidateQueries({ queryKey: ['document', user.id, id] });
      void client.invalidateQueries({ queryKey: ['study-documents', user.id] });
      setPending(null);
      setMessage('Priorité enregistrée.');
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
  async function saveHint(change: PendingHint) {
    if (sending.current) return;
    sending.current = true;
    setBusyId(change.id);
    setError('');
    setMessage('');
    setPending(change);
    try {
      const updated = await api<{
        document: DocumentRecord;
        passage: Pick<MemoryPassage, 'id' | 'hint' | 'revision'>;
        passages?: Pick<MemoryPassage, 'id' | 'hint' | 'revision'>[];
      }>(`/anchors/${change.id}/hint`, {
        method: 'PATCH',
        body: json({ hint: change.hint, revision: change.revision }),
      });
      client.setQueryData<ReviewDocument>(
        key,
        (current) =>
          current && {
            ...current,
            document: updated.document,
            passages: current.passages.map((p) =>
              (updated.passages || [updated.passage]).find((member) => member.id === p.id)
                ? {
                    ...p,
                    ...(updated.passages || [updated.passage]).find(
                      (member) => member.id === p.id,
                    )!,
                  }
                : p,
            ),
          },
      );
      void client.invalidateQueries({ queryKey: ['document', user.id, id] });
      void client.invalidateQueries({ queryKey: ['study-documents', user.id] });
      setPending(null);
      setMessage(change.hint ? 'Indice enregistré.' : 'Indice supprimé.');
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
        <ReviewFilter
          title="Priorité"
          labels={priorityLabels}
          values={filters.priority}
          onChange={(priority) => setFilters((f) => ({ ...f, priority }))}
        />
        <ReviewFilter
          title="Difficulté"
          labels={difficultyLabels}
          values={filters.difficulty}
          onChange={(difficulty) => setFilters((f) => ({ ...f, difficulty }))}
        />
        <button
          className="icon-button"
          aria-label="Recommencer la révision"
          title="Recommencer la révision"
          onClick={() => {
            setRevealed(new Set());
          }}
        >
          <RotateCcw size={18} />
        </button>
      </div>
      {(error || query.error || docs.error || folders.error) && (
        <div className="alert error" role="alert">
          {error || query.error?.message || docs.error?.message || folders.error?.message}
          {pending && (
            <button
              className="button"
              disabled={Boolean(busyId)}
              onClick={() =>
                void (pending.kind === 'priority'
                  ? savePriority(pending)
                  : pending.kind === 'hint'
                    ? saveHint(pending)
                    : saveDifficulty(pending))
              }
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
                ? `${selected.length - hiddenGroups} / ${selected.length} réponses révélées`
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
            selected={selectedIds}
            hidden={hidden}
            onReveal={reveal}
            busyId={busyId}
            onDifficulty={(passageId, difficulty) => {
              const p = query.data.passages.find((p) => p.id === passageId);
              if (p)
                void saveDifficulty({
                  kind: 'difficulty',
                  id: p.id,
                  difficulty,
                  difficultyRevision: p.difficultyRevision,
                });
            }}
            onPriority={(passageId, priority) => {
              const p = query.data.passages.find((p) => p.id === passageId);
              if (p)
                void savePriority({
                  kind: 'priority',
                  id: p.id,
                  priority,
                  revision: p.revision,
                });
            }}
            onHint={(passageId, hint) => {
              const p = query.data.passages.find((p) => p.id === passageId);
              if (p)
                void saveHint({
                  kind: 'hint',
                  id: p.id,
                  hint,
                  revision: p.revision,
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
