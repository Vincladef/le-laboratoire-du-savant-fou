import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  FolderPlus,
  Search,
  FileText,
  Folder,
  Trash2,
  ChevronRight,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  FolderInput,
  RotateCcw,
  Download,
  Copy,
} from 'lucide-react';
import { api, json, downloadBlob } from '../lib/api';
import { Modal } from '../components/Modal';
import type { DocumentRecord, DocumentSummary, FolderRecord } from '../shared/document';
import { copyWithNewAnchors } from '../shared/document';
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
  const [params, setParams] = useSearchParams();
  const view = params.get('view') || 'all';
  const setView = (value: string) => setParams(value === 'all' ? {} : { view: value });
  const searchRef = useRef<HTMLInputElement>(null);
  const [sort, setSort] = useState('recent');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [grid, setGrid] = useState(() => {
    try {
      return localStorage.getItem(`bouche-trou-view-${user.id}`) !== 'list';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`bouche-trou-view-${user.id}`, grid ? 'grid' : 'list');
    } catch {}
  }, [grid, user.id]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      document.querySelectorAll<HTMLDetailsElement>('.document-menu[open]').forEach((menu) => {
        if (!menu.contains(target)) menu.open = false;
      });
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll<HTMLDetailsElement>('.document-menu[open]').forEach((menu) => {
        menu.open = false;
        menu.querySelector<HTMLElement>('summary')?.focus();
      });
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<{
    type: 'folder' | 'rename' | 'move' | 'folder-edit';
    doc?: DocumentSummary;
    folder?: FolderRecord;
  } | null>(null);
  const [input, setInput] = useState('');
  const [destination, setDestination] = useState('');
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
      else if (modal?.type === 'folder-edit')
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
  const docRows = [...(docs.data || [])].sort((a, b) =>
    sort === 'alpha'
      ? a.title.localeCompare(b.title, 'fr')
      : sort === 'folder'
        ? (folders.data?.find((f) => f.id === a.folderId)?.name || '').localeCompare(
            folders.data?.find((f) => f.id === b.folderId)?.name || '',
            'fr',
          ) || a.title.localeCompare(b.title, 'fr')
        : view === 'recent'
          ? (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || '')
          : b.updatedAt.localeCompare(a.updatedAt),
  );
  return (
    <>
      <main className="library-content">
        <div className="library-heading paper-note">
          <h1>
            {view === 'trash'
              ? 'Corbeille'
              : view === 'recent'
                ? 'Récents'
                : selectedFolder?.name || 'Ma bibliothèque'}
          </h1>
          <p>
            {view === 'trash'
              ? 'Vos documents restent récupérables à tout moment.'
              : 'Des trous dans vos textes, pas dans votre mémoire.'}
          </p>
        </div>
        <div className="library-bar">
          <div className="search-field">
            <Search size={18} />
            <input
              ref={searchRef}
              aria-label="Rechercher dans les documents"
              placeholder="Rechercher un document…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>⌘ K</kbd>
          </div>
          <button
            className="button primary create-button"
            onClick={create}
            disabled={busy || view === 'trash'}
          >
            <Plus size={18} /> Nouveau document
          </button>
          <select
            aria-label="Trier les documents"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Plus récents</option>
            <option value="alpha">A à Z</option>
            <option value="folder">Par dossier</option>
          </select>
          <div className="view-switch">
            <button aria-label="Vue en grille" aria-pressed={grid} onClick={() => setGrid(true)}>
              <LayoutGrid size={17} />
            </button>
            <button aria-label="Vue en liste" aria-pressed={!grid} onClick={() => setGrid(false)}>
              <List size={18} />
            </button>
          </div>
        </div>
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
                aria-label="Nouveau dossier"
                onClick={() => {
                  setInput('');
                  setModal({ type: 'folder' });
                }}
              >
                <FolderPlus size={17} />
                <span className="folder-new-label">Nouveau dossier</span>
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
              <button
                className={`folder-card folder-all ${view === 'all' ? 'active' : ''}`}
                aria-label="Tous les documents"
                onClick={() => setView('all')}
              >
                Tous
              </button>
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
            </div>
          </section>
        )}
        <section className="documents-section">
          <div className="section-title">
            <h2>
              {search ? 'Résultats de recherche' : 'Mes documents'}{' '}
              <span className="count">{docs.data?.length ?? '—'}</span>
            </h2>
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
                    <span className="preview-category">
                      {folders.data?.find((f) => f.id === doc.folderId)?.name || 'DOCUMENT'}
                    </span>
                    <h3>
                      {doc.title === 'Document sans titre'
                        ? doc.excerpt?.trim().split('\n').find(Boolean)?.slice(0, 80) ||
                          `Carnet du ${new Date(doc.createdAt).toLocaleDateString('fr-FR')}`
                        : doc.title}
                    </h3>
                    <p>{doc.excerpt || 'Votre page attend ses premières lignes.'}</p>
                  </div>
                  <div className="document-meta">
                    <span className="passage-count">
                      {doc.passageCount == null
                        ? 'Document'
                        : `${doc.passageCount} trou${doc.passageCount > 1 ? 's' : ''}`}
                    </span>
                    <small>{date(doc.updatedAt)}</small>
                  </div>
                </button>
                <details
                  className="menu document-menu"
                  onToggle={(event) => {
                    const menu = event.currentTarget;
                    if (!menu.open) {
                      menu.classList.remove('menu-open-down');
                      return;
                    }
                    document.querySelectorAll<HTMLDetailsElement>('.document-menu[open]').forEach((other) => {
                      if (other !== menu) other.open = false;
                    });
                    const trigger = menu.querySelector('summary');
                    const popover = menu.querySelector<HTMLElement>('.menu-popover');
                    if (!trigger || !popover) return;
                    const bounds = trigger.getBoundingClientRect();
                    const roomAbove = bounds.top;
                    const roomBelow = window.innerHeight - bounds.bottom;
                    menu.classList.toggle(
                      'menu-open-down',
                      roomAbove < popover.offsetHeight + 12 && roomBelow > roomAbove,
                    );
                  }}
                >
                  <summary aria-label={`Options de ${doc.title}`}>
                    <MoreHorizontal size={20} />
                  </summary>
                  <div
                    className="menu-popover"
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('button')) {
                        const details = event.currentTarget.closest('details');
                        if (details) details.open = false;
                      }
                    }}
                  >
                    {view === 'trash' ? (
                      <button onClick={() => trash(doc, false)}>
                        <RotateCcw size={16} /> Restaurer
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() =>
                            run(async () => {
                              const full = await api<DocumentRecord>(`/documents/${doc.id}`);
                              await api('/documents', {
                                method: 'POST',
                                body: json({
                                  title: `${full.title.slice(0, 190)} (copie)`,
                                  folderId: full.folderId,
                                  content: copyWithNewAnchors(full.content),
                                  layout: full.layout,
                                }),
                              });
                              refresh();
                            })
                          }
                        >
                          <Copy size={16} /> Dupliquer
                        </button>
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
                                `${doc.title}.bouche-trou.json`,
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
      </main>
      {modal && (
        <Modal
          title={
            modal.type === 'folder'
              ? 'Nouveau dossier'
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
                Nom
                <input
                  autoFocus
                  required
                  value={input}
                  maxLength={200}
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
    </>
  );
}
