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
import type { MemoryPassage } from './shared/learning';
import './study/review.css';
export function PublicDocument({ user, copy = false }: { user?: { id: string }; copy?: boolean }) {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0),
    [review, setReview] = useState(false),
    [revealed, setRevealed] = useState<string[]>([]),
    [copyError, setCopyError] = useState('');
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
        priority: a.priority || 'medium',
        difficulty: 'unrated',
        difficultyRevision: 0,
        status: 'active',
        revision: 1,
        documentRevision: 1,
        documentId: 'public',
      }) as MemoryPassage,
  );
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
          setRevealed([]);
        }}
      >
        {review ? 'Lire le document' : 'Réviser'}
      </button>
      <StudyDocument
        key={active.id + JSON.stringify(content)}
        document={{ ...data, content } as DocumentRecord}
        passages={passages}
        selected={review ? anchors.map((a) => a.id) : []}
        hidden={review ? anchors.filter((a) => !revealed.includes(a.id)).map((a) => a.id) : []}
        onReveal={(id) => setRevealed((r) => [...r, id])}
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
