import { RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from './lib/api';
import { readTabs } from './shared/tabs';
import {
  extractAnchors,
  type DocumentRecord,
  type RichNode,
  type PageLayout,
} from './shared/document';
import { StudyDocument } from './study/StudyDocument';
import { AuthPage } from './components/AuthPage';
import {
  priorityLabels,
  difficultyLabels,
  matchesPassage,
  type MemoryPassage,
  type Priority,
  type Difficulty,
  type ReviewFilters,
} from './shared/learning';
import { ReviewFilter } from './study/StudyPage';
import './study/review.css';
export function PublicDocument({ user, copy = false }: { user?: { id: string }; copy?: boolean }) {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0),
    [review, setReview] = useState(false),
    [revealed, setRevealed] = useState<string[]>([]),
    [copyError, setCopyError] = useState('');
  const preferenceKey = `bouche-public-review-${token}-${user?.id || 'guest'}`;
  const [personal, setPersonal] = useState<
    Record<string, { priority: Priority; difficulty: Difficulty }>
  >({});
  const [activeRating, setActiveRating] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReviewFilters>({
    priority: ['high', 'medium', 'low'],
    difficulty: ['easy', 'medium', 'hard', 'unrated'],
  });
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
      const valid = Object.fromEntries(
        Object.entries(stored).filter(
          ([, value]: [string, any]) =>
            value &&
            Object.hasOwn(priorityLabels, value.priority) &&
            Object.hasOwn(difficultyLabels, value.difficulty),
        ),
      );
      setPersonal(valid as typeof personal);
    } catch {
      setPersonal({});
    }
    setRevealed([]);
    setActiveRating(null);
  }, [preferenceKey]);
  function updatePersonal(
    id: string,
    change: Partial<{ priority: Priority; difficulty: Difficulty }>,
  ) {
    setPersonal((current) => {
      const next = {
        ...current,
        [id]: {
          ...(current[id] || {
            priority: 'medium' as Priority,
            difficulty: 'unrated' as Difficulty,
          }),
          ...change,
        },
      };
      try {
        localStorage.setItem(preferenceKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  const started = useRef(false);
  const query = useQuery({
    queryKey: ['public', token],
    queryFn: () =>
      api<{ title: string; content: RichNode; layout: PageLayout }>(`/public/${token}`),
    retry: false,
    refetchInterval: 15000,
  });
  useEffect(() => {
    if (copy && user && !started.current) {
      started.current = true;
      void api<{ id: string }>(`/public/${token}/copy`, { method: 'POST' })
        .then((d) => navigate(`/document/${d.id}`, { replace: true }))
        .catch((e) => {
          setCopyError(e.message);
          started.current = false;
        });
    }
  }, [copy, user?.id, token]);
  if (copy && !user) return <AuthPage returnTo={`/s/${token}/copy`} />;
  if (copy)
    return (
      <main className="app-loading">
        {copyError ? (
          <>
            <p role="alert">{copyError}</p>
            <Link to={`/s/${token}`}>Revenir au document</Link>
          </>
        ) : (
          'Création de votre copie…'
        )}
      </main>
    );
  if (query.error)
    return (
      <main className="app-loading">
        <h1>Ce lien n’est plus disponible</h1>
        <Link to="/">Découvrir Bouche-Trou</Link>
      </main>
    );
  if (!query.data) return <div className="app-loading">Ouverture du carnet…</div>;
  const data = query.data;
  const tabs = readTabs(data.content);
  const active = tabs[Math.min(tab, tabs.length - 1)];
  const content = structuredClone(active.content);
  const rewrite = (n: RichNode) => {
    if (n.type === 'image' && n.attrs)
      n.attrs.src = n.attrs.src.replace('/api/assets/', `/api/public/${token}/assets/`);
    n.content?.forEach(rewrite);
  };
  rewrite(content);
  const anchors = extractAnchors(active.content);
  const passages = anchors.map(
    (a) =>
      ({
        id: a.id,
        quote: a.quote,
        hint: a.hint || '',
        priority: personal[a.id]?.priority || 'medium',
        difficulty: personal[a.id]?.difficulty || 'unrated',
        difficultyRevision: 0,
        status: 'active',
        revision: 1,
        documentRevision: 1,
        documentId: 'public',
      }) as MemoryPassage,
  );
  const selected = passages.filter((p) => matchesPassage(p, filters));
  return (
    <main className="public-notebook">
      <header className="public-header">
        <Link to="/">Bouche-Trou</Link>
        <span>Lecture seule</span>
        <Link className="button primary" to={`/s/${token}/copy`}>
          {user ? 'Obtenir ma copie' : 'Créer un compte et obtenir ma copie'}
        </Link>
      </header>
      <h1>{data.title}</h1>
      <nav aria-label="Onglets partagés">
        {tabs.map((t, i) => (
          <button
            key={t.id}
            className="button subtle"
            aria-current={i === tab ? 'page' : undefined}
            onClick={() => {
              setTab(i);
              setRevealed([]);
              setActiveRating(null);
            }}
          >
            {t.title}
          </button>
        ))}
      </nav>
      <button
        className="button"
        aria-pressed={review}
        onClick={() => {
          setReview(!review);
          setActiveRating(null);
          setRevealed([]);
        }}
      >
        {review ? 'Lire le document' : 'Réviser'}
      </button>
      {review && (
        <>
          <div className="review-toolbar">
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
                setRevealed([]);
                setActiveRating(null);
              }}
            >
              <RotateCcw size={18} />
            </button>
            <details>
              <summary>Mes réglages</summary>
              <p>Enregistrés dans ce navigateur, sans modifier ceux de l’auteur.</p>
              <button
                className="button subtle"
                onClick={() => {
                  setPersonal({});
                  setActiveRating(null);
                  try {
                    localStorage.removeItem(preferenceKey);
                  } catch {}
                }}
              >
                Réinitialiser mes évaluations et priorités
              </button>
            </details>
          </div>
          {activeRating && selected.some((p) => p.id === activeRating) && (
            <aside className="review-rating-bar" aria-label="Mes réglages du passage">
              <span>{passages.find((p) => p.id === activeRating)?.quote}</span>
              <label>
                Ma priorité
                <select
                  aria-label="Ma priorité"
                  value={personal[activeRating]?.priority || 'medium'}
                  onChange={(e) =>
                    updatePersonal(activeRating, { priority: e.target.value as Priority })
                  }
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ma difficulté
                <select
                  aria-label="Ma difficulté"
                  value={personal[activeRating]?.difficulty || 'unrated'}
                  onChange={(e) =>
                    updatePersonal(activeRating, { difficulty: e.target.value as Difficulty })
                  }
                >
                  {Object.entries(difficultyLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </aside>
          )}
        </>
      )}
      <StudyDocument
        key={active.id + JSON.stringify(content)}
        document={{ ...data, content } as DocumentRecord}
        passages={passages}
        selected={review ? selected.map((a) => a.id) : []}
        hidden={review ? selected.filter((a) => !revealed.includes(a.id)).map((a) => a.id) : []}
        onReveal={(id) => {
          setRevealed((r) => [...r, id]);
          setActiveRating(id);
        }}
        onDifficulty={() => {}}
        busyId={null}
        readOnly
      />
      <p className="muted">
        Un carnet pour écrire et apprendre.{' '}
        <Link to="/">Créez vos propres textes à trous avec Bouche-Trou.</Link>
      </p>
    </main>
  );
}
