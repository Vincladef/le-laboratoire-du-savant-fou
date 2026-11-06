import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import {
  ArrowLeft,
  Menu,
  Check,
  Cloud,
  CloudOff,
  History,
  PanelLeft,
  FileDown,
  Printer,
  Upload,
  Settings2,
  X,
  ChevronDown,
  ChevronUp,
  Search,
  Download,
  BookOpen,
} from 'lucide-react';
import { api, downloadBlob, json, uploadImage } from '../lib/api';
import {
  type DocumentRecord,
  type RichNode,
  type PageLayout,
  plainText,
  validateDocument,
  copyWithNewAnchors,
  extractAnchors,
} from '../shared/document';
import { useWorkspace } from '../components/Workspace';
import { DocumentTabs } from './DocumentTabs';
import { readTabs, writeTabs, addTab, removeTab, type DocumentTab } from '../shared/tabs';
import { Maximize2, MoreHorizontal } from 'lucide-react';
import { flushSync } from 'react-dom';
import { Modal } from '../components/Modal';
import { Toolbar } from './Toolbar';
import { editorExtensions, findMatches, searchKey } from './extensions';
import { useAutosave, type Snapshot } from './useAutosave';
import { DOCX_LIMITS } from './format-limits';
import { MemoryTools } from './MemoryTools';
import { AiAssistant, type AiSnapshot } from './AiAssistant';
import { annotateTabs, annotateTransaction, generatedDocument } from './ai-document';
import { aiProposalSchema, type AiProposal } from '../shared/ai';
const importLimits =
  'L’import conserve le texte, les titres, les listes, les liens, les tableaux simples et les images compatibles. Les styles précis, marges, objets flottants, équations Word, en-têtes et pieds de page peuvent être perdus ou modifiés. Conservez votre original.';

export function EditorPage({ user }: { user: { id: string } }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const document = useQuery({
    queryKey: ['document', user.id, id],
    queryFn: () => api<DocumentRecord>(`/documents/${id}`),
    staleTime: 0,
    gcTime: 0,
  });
  if (document.isPending) return <div className="app-loading">Ouverture du document…</div>;
  if (document.error)
    return (
      <div className="app-loading">
        <p role="alert">{document.error.message}</p>
        <button className="button" onClick={() => navigate('/library')}>
          Revenir à la bibliothèque
        </button>
      </div>
    );
  if (document.data.deletedAt)
    return (
      <div className="app-loading">
        <p>Ce document est dans la corbeille. Restaurez-le depuis la bibliothèque.</p>
        <button className="button" onClick={() => navigate('/library')}>
          Ouvrir la bibliothèque
        </button>
      </div>
    );
  return <DocumentEditor key={document.data.id} document={document.data} ownerId={user.id} />;
}
function DocumentEditor({
  document: original,
  ownerId,
}: {
  document: DocumentRecord;
  ownerId: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const shell = useWorkspace();
  const [tabs, setTabs] = useState(() => readTabs(original.content));
  const tabsRef = useRef(tabs);
  const [activeId, setActiveId] = useState(
    () =>
      readTabs(original.content).find((t) => t.id === original.viewState?.tabId)?.id ||
      readTabs(original.content)[0].id,
  );
  const activeRef = useRef(activeId);
  const clipboard = useRef({
    token: null as string | null,
    ids: new Set<string>(),
    isPresent: (ids: Set<string>) =>
      extractAnchors(writeTabs(tabsRef.current)).some((a) => ids.has(a.id)),
  });
  activeRef.current = activeId;
  const [restoreEpoch, setRestoreEpoch] = useState(0);
  const [printing, setPrinting] = useState<RichNode | null>(null);
  const cursors = useRef(original.viewState?.cursors || ({} as Record<string, number>));
  function content(active?: RichNode) {
    if (active)
      tabsRef.current = tabsRef.current.map((t) =>
        t.id === activeRef.current ? { ...t, content: active } : t,
      );
    return writeTabs(tabsRef.current);
  }
  const [title, setTitle] = useState(original.title);
  const [layout, setLayout] = useState<PageLayout>(original.layout);
  const [outline, setOutline] = useState(() => {
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    try {
      const stored = localStorage.getItem(
        `lab-outline-v2-${ownerId}-${mobile ? 'mobile' : 'desktop'}`,
      );
      return stored === null ? !mobile : stored === 'true';
    } catch {
      return !mobile;
    }
  });
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [history, setHistory] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [find, setFind] = useState(false);
  const [modal, setModal] = useState<'page' | 'import' | 'export' | 'help' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useAutosave(original, ownerId);
  const live = useRef({ title, layout });
  live.current = { title: title.trim() || 'Document sans titre', layout };
  const positionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const resize = () => {
      try {
        const stored = localStorage.getItem(
          `lab-outline-v2-${ownerId}-${media.matches ? 'mobile' : 'desktop'}`,
        );
        setOutline(stored === null ? !media.matches : stored === 'true');
      } catch {
        setOutline(!media.matches);
      }
    };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, [ownerId]);
  const editor = useEditor(
    {
      extensions: editorExtensions(clipboard.current),
      content: tabsRef.current.find((t) => t.id === activeId)!.content,
      editorProps: {
        attributes: {
          'aria-label': 'Contenu du document',
          role: 'textbox',
          'aria-multiline': 'true',
          spellcheck: 'true',
        },
        handlePaste: (view, event) => {
          const files = [...(event.clipboardData?.files || [])].filter((f) =>
            f.type.startsWith('image/'),
          );
          if (!files.length) return false;
          event.preventDefault();
          void (async () => {
            try {
              for (const file of files) {
                const image = await uploadImage(file);
                view.dispatch(
                  view.state.tr.replaceSelectionWith(
                    view.state.schema.nodes.image.create({ src: image.src, alt: file.name }),
                  ),
                );
              }
            } catch (e) {
              setError((e as Error).message);
            }
          })();
          return true;
        },
        handleKeyDown: (_view, event) => {
          if ((event.ctrlKey || event.metaKey) && ['f', 'h'].includes(event.key.toLowerCase())) {
            event.preventDefault();
            setFind(true);
            return true;
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            void save.flush();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) =>
        save.change({ ...live.current, content: content(editor.getJSON() as RichNode) }),
      onSelectionUpdate: ({ editor }) => {
        cursors.current[activeId] = editor.state.selection.from;
        if (positionTimer.current) clearTimeout(positionTimer.current);
        positionTimer.current = setTimeout(() => {
          void api(`/documents/${original.id}/position`, {
            method: 'PUT',
            body: json({ cursor: editor.state.selection.from, tabId: activeId }),
          }).catch(() => {});
        }, 1500);
      },
      onCreate: ({ editor }) => {
        editor.commands.setTextSelection(
          Math.min(
            Math.max(cursors.current[activeId] || (activeId === 'main' ? original.cursor : 1), 1),
            editor.state.doc.content.size,
          ),
        );
        editor.commands.scrollIntoView();
        void api(`/documents/${original.id}/position`, {
          method: 'PUT',
          body: json({ cursor: cursors.current[activeId] || 1, tabId: activeId }),
        }).catch(() => {});
      },
    },
    [activeId, restoreEpoch],
  );
  const guardRef = useRef(async () => true);
  guardRef.current = async () => {
    await save.flush();
    if (
      save.getLocal() &&
      !window.confirm(
        'Des modifications restent sur cet appareil. Quitter l’éditeur en conservant la copie de récupération ?',
      )
    )
      return false;
    void queryClient.invalidateQueries({ queryKey: ['documents', ownerId] });
    return true;
  };
  useEffect(() => shell.registerGuard(() => guardRef.current()), [shell.registerGuard]);
  useEffect(() => {
    if (save.status === 'saved' && editor)
      void api(`/documents/${original.id}/position`, {
        method: 'PUT',
        body: json({ cursor: editor.state.selection.from, tabId: activeId }),
      }).catch(() => {});
  }, [save.status, activeId, editor]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !window.document.querySelector('dialog[open]'))
        shell.setFocusMode(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [shell.setFocusMode]);
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWorkspaceWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [editor]);
  useEffect(
    () => () => {
      if (positionTimer.current) clearTimeout(positionTimer.current);
    },
    [],
  );
  async function action(fn: () => Promise<void>) {
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
  function apply(snapshot: Snapshot, persist = true) {
    if (!editor) return;
    live.current = { title: snapshot.title, layout: snapshot.layout };
    setTitle(snapshot.title);
    setLayout(snapshot.layout);
    const restored = readTabs(snapshot.content);
    tabsRef.current = restored;
    setTabs(restored);
    setActiveId(restored.some((t) => t.id === activeId) ? activeId : restored[0].id);
    setRestoreEpoch((n) => n + 1);
    if (persist) save.change(snapshot);
  }
  async function leave() {
    await shell.navigate('/library');
  }
  function updateTabs(next: DocumentTab[], selected = activeId) {
    tabsRef.current = next;
    setTabs(next);
    setActiveId(next.some((t) => t.id === selected) ? selected : next[0].id);
    save.change({ ...live.current, content: writeTabs(next) });
  }
  function switchTab(id: string) {
    if (editor) content(editor.getJSON() as RichNode);
    if (positionTimer.current) clearTimeout(positionTimer.current);
    setActiveId(id);
  }
  function add(parentId: string | null, sourceId?: string) {
    try {
      if (editor) content(editor.getJSON() as RichNode);
      const previous = new Set(tabsRef.current.map((t) => t.id)),
        next = addTab(tabsRef.current, parentId, sourceId);
      updateTabs(next, next.find((t) => !previous.has(t.id))!.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function applyAI(snapshot: AiSnapshot, proposal: AiProposal) {
    if (!editor) return;
    aiProposalSchema.parse(proposal);
    content(editor.getJSON() as RichNode);
    if (
      snapshot.activeId !== activeId ||
      JSON.stringify(snapshot.tabs) !== JSON.stringify(tabsRef.current)
    )
      throw new Error(
        'Le document a changé depuis la génération. Relancez la proposition sur le texte actuel.',
      );
    if (snapshot.mode === 'cloze') {
      const tr = annotateTransaction(editor.state, activeId, snapshot.sources, proposal.holes);
      const inactive = annotateTabs(
        editor.schema,
        tabsRef.current.filter((t) => t.id !== activeId),
        snapshot.sources,
        proposal.holes,
      );
      const next = tabsRef.current.map((tab) =>
        tab.id === activeId
          ? { ...tab, content: tr.doc.toJSON() as RichNode }
          : inactive.find((t) => t.id === tab.id)!,
      );
      // Update inactive tabs before the active editor emits its autosave transaction.
      tabsRef.current = next;
      setTabs(next);
      editor.view.dispatch(tr);
      save.change({ ...live.current, content: writeTabs(next) });
    } else {
      const generated = generatedDocument(editor.schema, proposal.text, proposal.holes);
      editor.chain().focus().insertContentAt(snapshot.position, generated.content.toJSON()).run();
    }
  }
  if (!editor) return null;
  const stateLabel = {
    saved: 'Enregistré',
    local: 'Copie locale conservée',
    saving: 'Enregistrement…',
    offline: 'Hors connexion · copie locale',
    conflict: 'Conflit à résoudre',
    error: 'Synchronisation interrompue',
  }[save.status];
  const exportJSON = () =>
    downloadBlob(
      new Blob(
        [
          JSON.stringify(
            { schemaVersion: 1, title, content: content(editor.getJSON() as RichNode), layout },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
      `${title}.bouche-trou.json`,
    );
  const size = layout.format === 'A4' ? [210, 297] : [215.9, 279.4];
  const pageWidth = size[layout.landscape ? 1 : 0];
  const paperZoom =
    zoom === 'fit' && workspaceWidth < 600
      ? 1
      : zoom === 'fit'
        ? Math.max(0.4, (workspaceWidth - 2) / ((pageWidth * 96) / 25.4))
        : zoom / 100;
  return (
    <MemoryTools
      key={activeId + restoreEpoch}
      editor={editor}
      documentId={original.id}
      ownerId={ownerId}
      status={save.status}
      flush={save.flush}
      hasLocal={() => Boolean(save.getLocal())}
      onAI={() => {
        setAiOpen(true);
        setHistory(false);
      }}
    >
      {(memory) => (
        <div className="editor-shell">
          <header className="editor-header">
            <button
              className="mobile-nav-trigger"
              aria-label="Ouvrir le menu"
              onClick={shell.openNavigation}
            >
              <Menu size={21} />
            </button>
            <button
              className="icon-button"
              aria-label="Revenir à la bibliothèque"
              onClick={() => void leave()}
            >
              <ArrowLeft size={21} />
            </button>
            <div className="document-title-area">
              <input
                aria-label="Titre du document"
                className="document-title"
                maxLength={200}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  live.current.title = e.target.value.trim() || 'Document sans titre';
                  save.change({
                    title: e.target.value || 'Document sans titre',
                    content: content(editor.getJSON() as RichNode),
                    layout,
                  });
                }}
                onBlur={() => {
                  if (!title.trim()) setTitle('Document sans titre');
                }}
              />
              <span className={`save-state ${save.status}`} role="status">
                {['offline', 'error', 'conflict'].includes(save.status) ? (
                  <CloudOff size={13} />
                ) : save.status === 'saved' ? (
                  <Check size={13} />
                ) : (
                  <Cloud size={13} />
                )}{' '}
                {stateLabel}
              </span>
            </div>
            <div className="editor-header-actions">
              <button
                className="button subtle concentration-toggle"
                aria-label={shell.focusMode ? 'Quitter la concentration' : 'Concentration'}
                aria-pressed={shell.focusMode}
                onClick={() => shell.setFocusMode(!shell.focusMode)}
              >
                <Maximize2 size={16} />
                <span>{shell.focusMode ? 'Quitter la concentration' : 'Concentration'}</span>
              </button>
              {memory.reviews}
              <details className="document-tools menu">
                <summary aria-label="Options du document" className="icon-button">
                  <MoreHorizontal size={21} />
                </summary>
                <div className="menu-popover">
                  <button onClick={() => setHistory(!history)}>
                    <History size={16} /> Historique
                  </button>
                  <button onClick={() => setModal('export')}>
                    <FileDown size={16} /> Exporter
                  </button>
                  <button onClick={() => setModal('import')}>
                    <Upload size={16} /> Importer
                  </button>
                  <button onClick={() => setModal('page')}>
                    <Settings2 size={16} /> Mise en page
                  </button>
                  <button onClick={() => setModal('help')}>Aide et raccourcis</button>
                  <label className="zoom-control">
                    Zoom
                    <select
                      aria-label="Zoom"
                      value={zoom}
                      onChange={(e) =>
                        setZoom(e.target.value === 'fit' ? 'fit' : Number(e.target.value))
                      }
                    >
                      <option value="fit">Largeur de page</option>
                      {[75, 90, 100, 110, 125].map((n) => (
                        <option key={n} value={n}>
                          {n}%
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
            </div>
          </header>
          <Toolbar
            typography={layout.typography}
            editor={editor}
            onFind={() => setFind(!find)}
            onError={setError}
            memoryActions={memory.actions}
          />
          {find && <FindBar editor={editor} onClose={() => setFind(false)} />}
          {error || save.error ? (
            <div className="editor-alert alert error" role="alert">
              <span>{error || save.error}</span>
              <button className="text-button" onClick={() => void save.flush()}>
                Réessayer
              </button>
              <button className="text-button" onClick={exportJSON}>
                Exporter la copie locale
              </button>
              <button
                className="icon-button"
                aria-label="Masquer le message"
                onClick={() => setError('')}
              >
                <X size={15} />
              </button>
            </div>
          ) : null}
          {notice && (
            <div className="editor-alert alert info" role="status">
              <span>{notice}</span>
              <button
                className="icon-button"
                aria-label="Masquer la notification"
                onClick={() => setNotice('')}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {save.recovery.map((draft) => (
            <div className="editor-alert alert warning" key={draft.key}>
              <span>
                <strong>Une copie locale attend d’être récupérée.</strong>{' '}
                {new Date(draft.updatedAt).toLocaleString('fr')} · {draft.title}
              </span>
              <button
                className="button"
                onClick={() => {
                  apply(draft, false);
                  void save.recover(draft);
                }}
              >
                Récupérer
              </button>
              <button
                className="text-button"
                onClick={() =>
                  downloadBlob(
                    new Blob([JSON.stringify(draft)], { type: 'application/json' }),
                    'copie-locale.json',
                  )
                }
              >
                Télécharger
              </button>
              <button
                className="text-button"
                onClick={() => {
                  if (window.confirm('Supprimer cette copie locale non synchronisée ?'))
                    void save.discardRecovery(draft);
                }}
              >
                Ignorer
              </button>
            </div>
          ))}
          {save.conflict && (
            <div className="conflict-panel" role="alert">
              <div>
                <strong>
                  Le document a été modifié ailleurs
                  {save.conflict.deletedAt ? ' et placé dans la corbeille' : ''}.
                </strong>
                <p>
                  Votre version reste visible ici et conservée sur cet appareil. Version distante :
                  révision {save.conflict.revision}, « {save.conflict.title} ».
                </p>
                <details>
                  <summary>Lire le texte de la version distante</summary>
                  <p>{plainText(save.conflict.content).slice(0, 3000)}</p>
                </details>
              </div>
              <div className="conflict-actions">
                <button
                  className="button primary"
                  onClick={() =>
                    action(async () => {
                      const copy = await save.copyLocal();
                      if (copy) {
                        const remote = await save.acceptRemote();
                        if (remote) apply(remote, false);
                        navigate(`/document/${copy.id}`);
                      }
                    })
                  }
                >
                  Conserver ma version dans un nouveau document
                </button>
                <button
                  className="button"
                  onClick={() => {
                    if (
                      window.confirm('Abandonner la copie locale et charger la version distante ?')
                    )
                      void save.acceptRemote().then((remote) => {
                        if (remote) apply(remote, false);
                      });
                  }}
                >
                  Garder la version distante
                </button>
                {!save.conflict.deletedAt && (
                  <button
                    className="text-button"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Enregistrer votre version à la place de la version distante ? Celle-ci restera dans l’historique.',
                        )
                      )
                        void save.replaceRemote();
                    }}
                  >
                    Remplacer explicitement la version distante
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="editor-workspace">
            <div className="outline-dock">
              <button
                ref={outlineToggle}
                className="button subtle outline-toggle"
                aria-label="Plan du document"
                aria-expanded={outline}
                aria-controls="document-outline"
                onClick={() => {
                  setOutline(!outline);
                  try {
                    localStorage.setItem(
                      `lab-outline-v2-${ownerId}-${window.matchMedia('(max-width: 760px)').matches ? 'mobile' : 'desktop'}`,
                      String(!outline),
                    );
                  } catch {
                    /* Optional preference. */
                  }
                }}
              >
                <PanelLeft size={17} /> Plan
              </button>
              {outline && (
                <DocumentTabs
                  editor={editor}
                  tabs={tabs}
                  activeId={activeId}
                  onSelect={switchTab}
                  onAdd={(parent) => add(parent)}
                  onRename={(id, title) => {
                    content(editor.getJSON() as RichNode);
                    updateTabs(tabsRef.current.map((t) => (t.id === id ? { ...t, title } : t)));
                  }}
                  onDuplicate={(id) =>
                    add(tabsRef.current.find((t) => t.id === id)?.parentId || null, id)
                  }
                  onDelete={(id) => {
                    if (
                      !window.confirm(
                        'Supprimer cet onglet et ses sous-onglets ? Leur contenu reste récupérable dans l’historique.',
                      )
                    )
                      return;
                    try {
                      content(editor.getJSON() as RichNode);
                      updateTabs(removeTab(tabsRef.current, id));
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                />
              )}
            </div>
            <main className="paper-workspace" ref={workspace} aria-label="Espace d’écriture">
              <div
                className="paper-ruler"
                aria-hidden="true"
                style={{ width: `${((pageWidth * 96) / 25.4) * paperZoom}px` }}
              >
                <span>0</span>
                <span>2</span>
                <span>4</span>
                <span>6</span>
                <span>8</span>
                <span>10</span>
                <span>12</span>
                <span>14</span>
                <span>16</span>
              </div>
              <div
                className="document-paper"
                style={
                  {
                    '--page-width':
                      zoom === 'fit' && workspaceWidth < 600
                        ? `${Math.max(280, workspaceWidth - 2)}px`
                        : `${size[layout.landscape ? 1 : 0]}mm`,
                    '--page-height':
                      zoom === 'fit' ? '840px' : `${size[layout.landscape ? 0 : 1]}mm`,
                    '--page-margin': `${layout.margin}mm`,
                    '--document-font': layout.typography?.fontFamily || 'Arial',
                    '--document-size': `${layout.typography?.fontSize || 11}pt`,
                    zoom: paperZoom || 1,
                  } as CSSProperties
                }
              >
                <EditorContent editor={editor} />
              </div>
              <p className="paper-caption">
                {layout.format} · Marges {layout.margin} mm · Écriture en continu, pages à
                l’impression
              </p>
            </main>
            <AiAssistant
              editor={editor}
              documentId={original.id}
              activeId={activeId}
              open={aiOpen}
              onClose={() => {
                setAiOpen(false);
                editor.commands.focus();
              }}
              getTabs={() => {
                content(editor.getJSON() as RichNode);
                return tabsRef.current;
              }}
              onApply={applyAI}
            />
            {memory.panel && (
              <aside className="passages-panel" aria-label="Mes passages">
                <h2>Mes passages</h2>
                {memory.panel}
              </aside>
            )}
            {history && (
              <VersionHistory
                id={original.id}
                revision={save.baseRevision.current}
                onClose={() => setHistory(false)}
                onRestore={(snapshot) =>
                  void action(async () => {
                    await save.flush();
                    if (save.getLocal())
                      throw new Error(
                        'Synchronisez ou exportez vos modifications actuelles avant de restaurer une version.',
                      );
                    apply(snapshot);
                    setNotice(
                      'Version restaurée comme nouvelle modification. Les versions précédentes sont conservées.',
                    );
                  })
                }
              />
            )}
          </div>
          <EditorFooter editor={editor} layout={layout} />
          {printing && <PrintDocument content={printing} layout={layout} />}
          <style>{`@media print { @page { size: ${layout.format} ${layout.landscape ? 'landscape' : 'portrait'}; margin: ${layout.margin}mm; } }`}</style>
          {modal === 'page' && (
            <Modal title="Mise en page" onClose={() => setModal(null)}>
              <label>
                Format
                <select
                  value={layout.format}
                  onChange={(e) => {
                    const value = { ...layout, format: e.target.value as PageLayout['format'] };
                    setLayout(value);
                    save.change({
                      title,
                      content: content(editor.getJSON() as RichNode),
                      layout: value,
                    });
                  }}
                >
                  <option>A4</option>
                  <option>Letter</option>
                </select>
              </label>
              <label>
                Marges : {layout.margin} mm
                <input
                  aria-label="Marges en millimètres"
                  type="range"
                  min={10}
                  max={40}
                  value={layout.margin}
                  onChange={(e) => {
                    const value = { ...layout, margin: Number(e.target.value) };
                    setLayout(value);
                    save.change({
                      title,
                      content: content(editor.getJSON() as RichNode),
                      layout: value,
                    });
                  }}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={layout.landscape}
                  onChange={(e) => {
                    const value = { ...layout, landscape: e.target.checked };
                    setLayout(value);
                    save.change({
                      title,
                      content: content(editor.getJSON() as RichNode),
                      layout: value,
                    });
                  }}
                />{' '}
                Orientation paysage
              </label>
              <p className="muted small">
                Le document s’écrit en continu. Les sauts de page manuels et la pagination du
                navigateur sont appliqués à l’impression. Il n’y a pas de pagination automatique
                exacte à l’écran.
              </p>
              <div className="modal-actions">
                <button className="button primary" onClick={() => setModal(null)}>
                  Terminer
                </button>
              </div>
            </Modal>
          )}
          {modal === 'export' && (
            <Modal title="Exporter votre document" onClose={() => setModal(null)}>
              <div className="export-choices">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    action(async () => {
                      const { makeDocx } = await import('./docx-export');
                      downloadBlob(
                        await makeDocx(title, content(editor.getJSON() as RichNode), layout),
                        `${title}.docx`,
                      );
                      setNotice(
                        'Document DOCX exporté. Vérifiez sa mise en page dans votre logiciel de destination.',
                      );
                      setModal(null);
                    })
                  }
                >
                  <FileDown size={20} /> Document Word (.docx)
                </button>
                <button
                  className="button"
                  onClick={() => {
                    setModal(null);
                    void (async () => {
                      flushSync(() => setPrinting(content(editor.getJSON() as RichNode)));
                      await window.document.fonts.ready;
                      await Promise.all(
                        [...window.document.querySelectorAll('.print-document img')].map((img) =>
                          (img as HTMLImageElement).decode().catch(() => {}),
                        ),
                      );
                      window.print();
                      setPrinting(null);
                    })();
                  }}
                >
                  <Printer size={20} /> PDF / impression
                </button>
                <button className="button" onClick={exportJSON}>
                  <Download size={20} /> Source JSON (images référencées)
                </button>
                <button
                  className="button"
                  onClick={() =>
                    downloadBlob(
                      new Blob([plainText(content(editor.getJSON() as RichNode))], {
                        type: 'text/plain;charset=utf-8',
                      }),
                      `${title}.txt`,
                    )
                  }
                >
                  <BookOpen size={20} /> Texte brut (.txt)
                </button>
              </div>
              <p className="muted small">
                PDF : choisissez « Enregistrer au format PDF » dans la fenêtre d’impression du
                navigateur et désactivez ses en-têtes/pieds de page si nécessaire.
              </p>
              <p className="alert info small">{DOCX_LIMITS}</p>
              <p className="muted small">
                Le JSON conserve toutes les métadonnées de l’éditeur, mais référence les images de
                votre compte sans embarquer leurs fichiers.
              </p>
              {error && <p className="alert error">{error}</p>}
            </Modal>
          )}
          {modal === 'import' && (
            <Modal title="Importer un document" onClose={() => setModal(null)}>
              <p>L’import crée un nouveau document dans votre bibliothèque.</p>
              <p className="alert warning">{importLimits}</p>
              <p className="muted small">
                Formats : DOCX ou source JSON Bouche-trou (anciens fichiers du Laboratoire
                compatibles). Taille DOCX maximale : 10 Mo.
              </p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={18} />
                {busy ? 'Import en cours…' : 'Choisir un fichier'}
              </button>
              {error && <p className="alert error">{error}</p>}
            </Modal>
          )}
          <input
            type="file"
            ref={fileRef}
            hidden
            accept=".docx,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void action(async () => {
                await save.flush();
                if (save.getLocal())
                  throw new Error(
                    'Synchronisez ou exportez d’abord les modifications de ce document.',
                  );
                let content: RichNode;
                let importedTitle = file.name.replace(/\.(docx|json)$/i, '').slice(0, 200);
                let importedLayout = layout;
                if (file.name.toLowerCase().endsWith('.docx')) {
                  const { importDocx } = await import('./docx-import');
                  const result = await importDocx(file);
                  content = result.content;
                  if (result.warnings.length)
                    window.alert(
                      `Import terminé avec avertissements :\n${result.warnings.join('\n')}`,
                    );
                } else {
                  if (file.size > 2_500_000) throw new Error('Source JSON trop volumineuse.');
                  const source = JSON.parse(await file.text());
                  content = copyWithNewAnchors(validateDocument(source.content));
                  importedTitle = source.title || importedTitle;
                  if (source.layout) importedLayout = source.layout;
                }
                const imported = await api<DocumentRecord>('/documents', {
                  method: 'POST',
                  body: json({ title: importedTitle, content, layout: importedLayout }),
                });
                navigate(`/document/${imported.id}`);
                setModal(null);
              });
              e.target.value = '';
            }}
          />
          {modal === 'help' && (
            <Modal title="Écrire dans Bouche-trou" onClose={() => setModal(null)}>
              <ul className="help-list">
                <li>
                  <kbd>Ctrl / ⌘ + B</kbd> Gras ; <kbd>I</kbd> italique ; <kbd>U</kbd> souligné
                </li>
                <li>
                  <kbd>Ctrl / ⌘ + Z</kbd> Annuler ; <kbd>Maj + Z</kbd> rétablir
                </li>
                <li>
                  <kbd>Ctrl / ⌘ + F</kbd> Rechercher et remplacer
                </li>
                <li>
                  <kbd>Ctrl / ⌘ + S</kbd> Synchroniser maintenant
                </li>
                <li>
                  <kbd>Ctrl / ⌘ + Entrée</kbd> Insérer un saut de page
                </li>
                <li>
                  <kbd>Tab</kbd> Dans un tableau : cellule suivante
                </li>
              </ul>
              <p className="muted small">
                La sauvegarde s’effectue après une courte pause de frappe. En cas de coupure réseau,
                vos modifications restent dans ce navigateur. Ne videz pas ses données avant la
                synchronisation.
              </p>
              <p className="muted small">
                Les changements simultanés sont signalés à la sauvegarde. Il n’y a pas encore
                d’édition collaborative en temps réel.
              </p>
            </Modal>
          )}
        </div>
      )}
    </MemoryTools>
  );
}
function PrintDocument({ content, layout }: { content: RichNode; layout: PageLayout }) {
  const editor = useEditor({ extensions: editorExtensions(), content, editable: false });
  return (
    <div
      className="print-document"
      style={{
        fontFamily: layout.typography?.fontFamily || 'Arial',
        fontSize: `${layout.typography?.fontSize || 11}pt`,
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
function EditorFooter({ editor, layout }: { editor: Editor; layout: PageLayout }) {
  const stats = useEditorState({
    editor,
    selector: ({ editor }) => {
      const text = editor.state.doc.textContent;
      return { words: text.trim() ? text.trim().split(/\s+/).length : 0, chars: text.length };
    },
  });
  return (
    <footer className="editor-footer">
      <span>
        {stats.words} mots · {stats.chars} caractères
      </span>
      <span>
        {layout.format} · {layout.landscape ? 'Paysage' : 'Portrait'} · Français
      </span>
    </footer>
  );
}
function FindBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [sensitive, setSensitive] = useState(false);
  const [index, setIndex] = useState(0);
  const matches = useEditorState({
    editor,
    selector: ({ editor }) => findMatches(editor.state.doc, query, sensitive),
  });
  useEffect(() => {
    editor.view.dispatch(editor.state.tr.setMeta(searchKey, { query, caseSensitive: sensitive }));
    setIndex(0);
  }, [editor, query, sensitive]);
  useEffect(
    () => () => {
      if (!editor.isDestroyed)
        editor.view.dispatch(
          editor.state.tr.setMeta(searchKey, { query: '', caseSensitive: false }),
        );
    },
    [editor],
  );
  function jump(next: number) {
    if (!matches.length) return;
    const i = (next + matches.length) % matches.length;
    setIndex(i);
    editor.chain().setTextSelection(matches[i]).scrollIntoView().run();
  }
  return (
    <div className="find-bar">
      <Search size={17} />
      <input
        autoFocus
        aria-label="Texte à rechercher"
        placeholder="Rechercher"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <span className="small">
        {matches.length} résultat{matches.length > 1 ? 's' : ''}
      </span>
      <button
        className="icon-button"
        aria-label="Résultat précédent"
        onClick={() => jump(index - 1)}
      >
        <ChevronUp size={16} />
      </button>
      <button className="icon-button" aria-label="Résultat suivant" onClick={() => jump(index + 1)}>
        <ChevronDown size={16} />
      </button>
      <input
        aria-label="Texte de remplacement"
        placeholder="Remplacer par"
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
      />
      <button
        className="button small"
        disabled={!matches.length}
        onClick={() => {
          const match = matches[Math.min(index, matches.length - 1)];
          editor.view.dispatch(editor.state.tr.insertText(replacement, match.from, match.to));
        }}
      >
        Remplacer
      </button>
      <button
        className="button small"
        disabled={!matches.length}
        onClick={() => {
          const tr = editor.state.tr;
          for (const match of [...matches].reverse())
            tr.insertText(replacement, match.from, match.to);
          editor.view.dispatch(tr);
        }}
      >
        Tout remplacer
      </button>
      <label className="checkbox-label small">
        <input
          type="checkbox"
          checked={sensitive}
          onChange={(e) => setSensitive(e.target.checked)}
        />{' '}
        Aa
      </label>
      <button className="icon-button" aria-label="Fermer la recherche" onClick={onClose}>
        <X size={18} />
      </button>
    </div>
  );
}
function VersionHistory({
  id,
  revision,
  onClose,
  onRestore,
}: {
  id: string;
  revision: number;
  onClose: () => void;
  onRestore: (snapshot: Snapshot) => void;
}) {
  const [preview, setPreview] = useState<(Snapshot & { revision: number }) | null>(null);
  const [error, setError] = useState('');
  const versions = useQuery({
    queryKey: ['versions', id, revision],
    queryFn: () =>
      api<{ id: string; revision: number; title: string; createdAt: string; reason: string }[]>(
        `/documents/${id}/versions`,
      ),
  });
  return (
    <aside className="version-panel">
      <header>
        <h2>Historique</h2>
        <button className="icon-button" aria-label="Fermer l’historique" onClick={onClose}>
          <X size={17} />
        </button>
      </header>
      <p className="muted small">
        Les dernières versions accessibles avec votre formule sont affichées. Restaurer crée une
        nouvelle version ; les archives ne sont pas effacées lors d’un changement d’offre.
      </p>
      {error || versions.error ? (
        <p role="alert" className="alert error">
          {error || versions.error?.message}
        </p>
      ) : null}
      {versions.data?.map((v) => (
        <button
          className={`version-item ${preview?.revision === v.revision ? 'active' : ''}`}
          key={v.id}
          onClick={async () => {
            try {
              setPreview(await api(`/documents/${id}/versions/${v.id}`));
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <strong>Version {v.revision}</strong>
          <span>{new Date(v.createdAt).toLocaleString('fr')}</span>
          <small>{v.title}</small>
        </button>
      ))}
      {preview && (
        <div className="version-preview">
          <h3>Aperçu texte · v{preview.revision}</h3>
          <p>{plainText(preview.content).slice(0, 2000) || '(Document vide)'}</p>
          <button
            className="button primary"
            onClick={() => {
              if (
                window.confirm(
                  `Restaurer la version ${preview.revision} ? La version actuelle restera dans l’historique.`,
                )
              )
                onRestore(preview);
            }}
          >
            Restaurer cette version
          </button>
        </div>
      )}
    </aside>
  );
}
