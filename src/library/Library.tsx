import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  FolderPlus,
  Search,
  FileText,
  Folder,
  Clock3,
  Trash2,
  ChevronRight,
  LayoutGrid,
  List,
  LogOut,
  Settings,
  ArrowUpRight,
  MoreHorizontal,
  Pencil,
  FolderInput,
  RotateCcw,
  Download,
  FlaskConical,
  BookOpen,
} from 'lucide-react';
import { api, json, downloadBlob } from '../lib/api';
import { authClient } from '../lib/auth-client';
import { Brand } from '../components/Brand';
import { Modal } from '../components/Modal';
import type { DocumentRecord, DocumentSummary, FolderRecord } from '../shared/document';
type User = { id: string; name: string; email: string };
const date = (value: string) =>
  new Intl.DateTimeFormat('fr', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
export function Library({ user }: { user: User }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [view, setView] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [grid, setGrid] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{
    type: 'folder' | 'rename' | 'move' | 'profile' | 'folder-edit';
    doc?: DocumentSummary;
    folder?: FolderRecord;
  } | null>(null);
  const [input, setInput] = useState('');
  const [destination, setDestination] = useState('');
  const [zone, setZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
  );
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const folderId = !['all', 'recent', 'trash'].includes(view) ? view : null;
  const docs = useQuery({
    queryKey: ['documents', user.id, view, query],
    queryFn: () =>
      api<(DocumentSummary & { excerpt: string })[]>(
        `/documents?folder=${folderId || 'all'}&trash=${view === 'trash' ? 1 : 0}&q=${encodeURIComponent(query)}`,
      ),
  });
  const folders = useQuery({
    queryKey: ['folders', user.id],
    queryFn: () => api<FolderRecord[]>('/folders'),
  });
  const profile = useQuery({
    queryKey: ['profile', user.id],
    queryFn: () =>
      api<{
        role: string;
        preferences: { lastDocumentId?: string; timezone?: string };
        quotas: { documents: number; bytes: number };
      }>('/profile'),
  });
  const selectedFolder = folders.data?.find((f) => f.id === folderId);
  const children = folders.data?.filter((f) => f.parentId === folderId) || [];
  const breadcrumbs: FolderRecord[] = [];
  let parent = selectedFolder;
  const visited = new Set<string>();
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id);
    breadcrumbs.unshift(parent);
    parent = folders.data?.find((f) => f.id === parent!.parentId);
  }
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['documents', user.id] });
    void client.invalidateQueries({ queryKey: ['folders', user.id] });
  };
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const create = () =>
    run(async () => {
      const doc = await api<DocumentRecord>('/documents', {
        method: 'POST',
        body: json({ folderId }),
      });
      navigate(`/document/${doc.id}`);
    });
  async function trash(doc: DocumentSummary, deleted: boolean) {
    await run(async () => {
      await api(`/documents/${doc.id}/trash`, {
        method: 'POST',
        body: json({ revision: doc.revision, deleted }),
      });
      refresh();
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (modal?.type === 'folder')
        await api('/folders', { method: 'POST', body: json({ name: input, parentId: folderId }) });
      else if (modal?.type === 'profile') {
        await api('/profile', { method: 'PATCH', body: json({ name: input, timezone: zone }) });
        await authClient.getSession({ query: { disableCookieCache: true } });
        void client.invalidateQueries({ queryKey: ['profile', user.id] });
      } else if (modal?.type === 'folder-edit')
        await api(`/folders/${modal.folder!.id}`, {
          method: 'PATCH',
          body: json({ name: input, parentId: destination || null }),
        });
      else if (modal?.doc) {
        const doc = await api<DocumentRecord>(`/documents/${modal.doc.id}`);
        await api(`/documents/${doc.id}`, {
          method: 'PUT',
          body: json({
            revision: doc.revision,
            title: modal.type === 'rename' ? input : doc.title,
            content: doc.content,
            layout: doc.layout,
            folderId: modal.type === 'move' ? destination || null : doc.folderId,
          }),
        });
      }
      setModal(null);
      refresh();
    });
  }
  const docRows =
    view === 'recent'
      ? [...(docs.data || [])].sort((a, b) =>
          (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || ''),
        )
      : docs.data;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <button className="button primary create-button" onClick={create} disabled={busy}>
          <Plus size={20} /> Nouveau document
        </button>
        <nav aria-label="Bibliothèque">
          <button onClick={() => navigate('/billing')}>Mon abonnement</button>
          <button onClick={() => navigate(folderId ? `/study?folder=${folderId}` : '/study')}>
            <BookOpen size={19} />
            Réviser mes passages
          </button>
          <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
            <FileText size={19} /> Mes documents
          </button>
          <button className={view === 'recent' ? 'active' : ''} onClick={() => setView('recent')}>
            <Clock3 size={19} /> Récents
          </button>
          <button className={view === 'trash' ? 'active' : ''} onClick={() => setView('trash')}>
            <Trash2 size={19} /> Corbeille
          </button>
          <div className="nav-heading">
            MES DOSSIERS
            <button
              className="icon-button"
              aria-label="Créer un dossier"
              onClick={() => {
                setInput('');
                setModal({ type: 'folder' });
              }}
            >
              <Plus size={16} />
            </button>
          </div>
          {folders.data
            ?.filter((f) => !f.parentId)
            .map((f) => (
              <button
                key={f.id}
                className={folderId === f.id ? 'active' : ''}
                onClick={() => setView(f.id)}
              >
                <Folder size={18} />
                <span className="ellipsis">{f.name}</span>
              </button>
            ))}
          {!folders.data?.length && <p className="sidebar-hint">Un dossier pour chaque idée.</p>}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <FlaskConical size={22} />
            <div>
              Votre espace personnel
              <small>
                Offre{' '}
                {profile.data?.role === 'owner'
                  ? 'Premium permanent · Propriétaire'
                  : profile.data?.role === 'free'
                    ? 'Gratuite'
                    : profile.data?.role || 'Gratuite'}
              </small>
            </div>
          </div>
          <button
            className="profile-button"
            onClick={() => {
              setInput(user.name);
              setZone(profile.data?.preferences.timezone || zone);
              setModal({ type: 'profile' });
            }}
          >
            <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="ellipsis">
              {user.name}
              <small>Mon compte</small>
            </span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <div className="library-main">
        <header className="library-topbar">
          <div className="mobile-brand">
            <Brand compact />
          </div>
          <div className="search-field">
            <Search size={19} />
            <input
              aria-label="Rechercher dans les documents"
              placeholder="Rechercher dans vos documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>⌕</kbd>
          </div>
          <span className="private-label">Espace privé</span>
          <button
            className="icon-button"
            title="Déconnexion"
            aria-label="Déconnexion"
            onClick={() =>
              run(async () => {
                await authClient.signOut();
                client.clear();
                navigate('/');
              })
            }
          >
            <LogOut size={19} />
          </button>
        </header>
        <main className="library-content">
          <div className="mobile-navigation">
            <button className="button subtle" onClick={() => navigate('/billing')}>
              Abonnement
            </button>
            <button
              className="button subtle"
              onClick={() => navigate(folderId ? `/study?folder=${folderId}` : '/study')}
            >
              <BookOpen size={17} />
              Réviser
            </button>
            <select
              aria-label="Vue de la bibliothèque"
              value={view}
              onChange={(e) => setView(e.target.value)}
            >
              <option value="all">Mes documents</option>
              <option value="recent">Récents</option>
              <option value="trash">Corbeille</option>
              {folders.data?.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div className="library-heading">
            <div>
              <span className="eyebrow">VOTRE ATELIER D’ÉCRITURE</span>
              <h1>
                {view === 'trash'
                  ? 'La corbeille'
                  : view === 'recent'
                    ? 'Reprendre le fil'
                    : selectedFolder?.name || 'Mes documents'}
              </h1>
              <p className="muted">
                {view === 'trash'
                  ? 'Vos documents restent récupérables à tout moment.'
                  : 'Une place pour chaque idée, un carnet pour chaque découverte.'}
              </p>
            </div>
            <button className="button primary mobile-create" onClick={create}>
              <Plus size={19} /> Nouveau
            </button>
          </div>
          {profile.data?.preferences.lastDocumentId && view === 'all' && !search && (
            <button
              className="resume-strip"
              onClick={() => navigate(`/document/${profile.data!.preferences.lastDocumentId}`)}
            >
              <span className="resume-icon">
                <Clock3 size={21} />
              </span>
              <span>
                <strong>Reprendre là où vous en étiez</strong>
                <small>Retrouvez votre dernier document et votre position de lecture.</small>
              </span>
              <ArrowUpRight size={21} />
            </button>
          )}
          {error || docs.error || folders.error ? (
            <p className="alert error" role="alert">
              {error || docs.error?.message || folders.error?.message}
            </p>
          ) : null}
          {view !== 'trash' && view !== 'recent' && !search && (
            <section className="folders-section">
              <div className="section-title">
                <h2>Dossiers</h2>
                <button
                  className="text-button"
                  onClick={() => {
                    setInput('');
                    setModal({ type: 'folder' });
                  }}
                >
                  <FolderPlus size={17} /> Nouveau dossier
                </button>
              </div>
              {breadcrumbs.length > 0 && (
                <div className="breadcrumbs">
                  <button onClick={() => setView('all')}>Mes documents</button>
                  {breadcrumbs.map((f) => (
                    <span key={f.id}>
                      <ChevronRight size={14} />
                      <button onClick={() => setView(f.id)}>{f.name}</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="folder-grid">
                {children.map((f) => (
                  <div className="folder-card" key={f.id}>
                    <button className="folder-open" onClick={() => setView(f.id)}>
                      <Folder size={25} />
                      <span>{f.name}</span>
                    </button>
                    <details className="menu">
                      <summary aria-label={`Options du dossier ${f.name}`}>
                        <MoreHorizontal size={18} />
                      </summary>
                      <div className="menu-popover">
                        <button
                          onClick={() => {
                            setInput(f.name);
                            setDestination(f.parentId || '');
                            setModal({ type: 'folder-edit', folder: f });
                          }}
                        >
                          <Pencil size={15} /> Renommer / déplacer
                        </button>
                        <button
                          onClick={() =>
                            run(async () => {
                              if (!window.confirm(`Supprimer le dossier vide « ${f.name} » ?`))
                                return;
                              await api(`/folders/${f.id}`, { method: 'DELETE' });
                              refresh();
                            })
                          }
                        >
                          <Trash2 size={15} /> Supprimer le dossier vide
                        </button>
                      </div>
                    </details>
                  </div>
                ))}
                {!children.length && (
                  <p className="muted small">
                    Aucun dossier ici. Organisez vos projets à votre rythme.
                  </p>
                )}
              </div>
            </section>
          )}
          <section className="documents-section">
            <div className="section-title">
              <h2>
                {search ? 'Résultats de recherche' : 'Documents'}{' '}
                <span className="count">{docs.data?.length ?? '—'}</span>
              </h2>
              <div className="view-switch">
                <button
                  aria-label="Vue en grille"
                  aria-pressed={grid}
                  onClick={() => setGrid(true)}
                >
                  <LayoutGrid size={17} />
                </button>
                <button
                  aria-label="Vue en liste"
                  aria-pressed={!grid}
                  onClick={() => setGrid(false)}
                >
                  <List size={18} />
                </button>
              </div>
            </div>
            {docs.isPending && <p className="muted">Ouverture de votre bibliothèque…</p>}
            {!docs.isPending && !docRows?.length && (
              <div className="empty-state">
                <span className="empty-illustration">
                  <FileText size={42} />
                  <span>+</span>
                </span>
                <h2>
                  {search
                    ? 'Aucun document trouvé.'
                    : view === 'trash'
                      ? 'La corbeille est vide.'
                      : 'Votre prochaine idée commence ici.'}
                </h2>
                <p>
                  {search
                    ? 'Essayez un autre titre ou un mot du document.'
                    : view === 'trash'
                      ? 'Les documents supprimés apparaîtront ici.'
                      : 'Créez votre premier document. Quelques mots peuvent tout changer.'}
                </p>
                {!search && view !== 'trash' && (
                  <button className="button primary" onClick={create} disabled={busy}>
                    <Plus size={18} /> Créer mon premier document
                  </button>
                )}
              </div>
            )}
            <div className={grid ? 'document-grid' : 'document-list'}>
              {docRows?.map((doc) => (
                <article className="document-card" key={doc.id}>
                  <button
                    className="document-open"
                    onClick={() => {
                      if (view !== 'trash') navigate(`/document/${doc.id}`);
                    }}
                    disabled={view === 'trash'}
                  >
                    <div className="document-preview">
                      <div className="preview-top">
                        <span />
                        <span />
                      </div>
                      <h3>{doc.title}</h3>
                      <p>{doc.excerpt || 'Votre page attend ses premières lignes.'}</p>
                      <div className="preview-lines">
                        <i />
                        <i />
                        <i />
                      </div>
                    </div>
                    <div className="document-meta">
                      <span className="document-icon">
                        <FileText size={20} />
                      </span>
                      <div>
                        <h3>{doc.title}</h3>
                        <small>Modifié le {date(doc.updatedAt)}</small>
                      </div>
                    </div>
                  </button>
                  <details className="menu document-menu">
                    <summary aria-label={`Options de ${doc.title}`}>
                      <MoreHorizontal size={20} />
                    </summary>
                    <div className="menu-popover">
                      {view === 'trash' ? (
                        <button onClick={() => trash(doc, false)}>
                          <RotateCcw size={16} /> Restaurer
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setInput(doc.title);
                              setModal({ type: 'rename', doc });
                            }}
                          >
                            <Pencil size={16} /> Renommer
                          </button>
                          <button
                            onClick={() => {
                              setDestination(doc.folderId || '');
                              setModal({ type: 'move', doc });
                            }}
                          >
                            <FolderInput size={16} /> Déplacer
                          </button>
                          <button
                            onClick={() =>
                              run(async () => {
                                const full = await api<DocumentRecord>(`/documents/${doc.id}`);
                                downloadBlob(
                                  new Blob([JSON.stringify(full, null, 2)], {
                                    type: 'application/json',
                                  }),
                                  `${doc.title}.laboratoire.json`,
                                );
                              })
                            }
                          >
                            <Download size={16} /> Source JSON (sans fichiers)
                          </button>
                          <button className="danger-text" onClick={() => trash(doc, true)}>
                            <Trash2 size={16} /> Mettre à la corbeille
                          </button>
                        </>
                      )}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          </section>
          <footer className="library-footer">
            Écrivez. Explorez. Faites grandir vos idées.
            <FlaskConical size={16} />
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            modal.type === 'folder'
              ? 'Nouveau dossier'
              : modal.type === 'profile'
                ? 'Mon compte'
                : modal.type === 'move'
                  ? 'Déplacer le document'
                  : modal.type === 'folder-edit'
                    ? 'Organiser le dossier'
                    : 'Renommer le document'
          }
          onClose={() => setModal(null)}
        >
          <form onSubmit={submit}>
            {modal.type !== 'move' && (
              <label>
                {modal.type === 'profile' ? 'Nom affiché' : 'Nom'}
                <input
                  autoFocus
                  required
                  value={input}
                  maxLength={modal.type === 'profile' ? 100 : 200}
                  onChange={(e) => setInput(e.target.value)}
                />
              </label>
            )}
            {(modal.type === 'move' || modal.type === 'folder-edit') && (
              <label>
                Dossier de destination
                <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                  <option value="">Racine de mon espace</option>
                  {folders.data
                    ?.filter((f) => f.id !== modal.folder?.id)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {modal.type === 'profile' && (
              <>
                <label>
                  Adresse email
                  <input value={user.email} readOnly />
                </label>
                <label>
                  Fuseau horaire
                  <input value={zone} onChange={(e) => setZone(e.target.value)} />
                </label>
                <p className="muted small">
                  Rôle : {profile.data?.role || 'free'}. Les droits commerciaux sont gérés
                  exclusivement côté serveur.
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    run(async () => {
                      const result = await authClient.requestPasswordReset({
                        email: user.email,
                        redirectTo: `${window.location.origin}/reset-password`,
                      });
                      if (result.error) throw new Error(result.error.message);
                      window.alert('Si le compte existe, un email de récupération a été envoyé.');
                    })
                  }
                >
                  Recevoir un lien pour changer mon mot de passe
                </button>
              </>
            )}
            {error && (
              <p role="alert" className="alert error">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setModal(null)}>
                Annuler
              </button>
              <button className="button primary" disabled={busy} type="submit">
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
