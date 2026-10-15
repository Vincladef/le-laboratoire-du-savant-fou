import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import {
  ArrowLeft,
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
} from '../shared/document';
import { Brand } from '../components/Brand';
import { Modal } from '../components/Modal';
import { Toolbar } from './Toolbar';
import { editorExtensions, findMatches, searchKey } from './extensions';
import { useAutosave, type Snapshot } from './useAutosave';
import { DOCX_LIMITS } from './format-limits';
import { MemoryTools } from './MemoryTools';
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
  const [title, setTitle] = useState(original.title);
  const [layout, setLayout] = useState<PageLayout>(original.layout);
  const [outline, setOutline] = useState(true);
  const [history, setHistory] = useState(false);
  const [find, setFind] = useState(false);
  const [modal, setModal] = useState<'page' | 'import' | 'export' | 'help' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(100);
  const fileRef = useRef<HTMLInputElement>(null);
  const save = useAutosave(original, ownerId);
  const live = useRef({ title, layout });
  live.current = { title, layout };
  const positionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editor = useEditor({
    extensions: editorExtensions(),
    content: original.content,
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
      save.change({ ...live.current, content: editor.getJSON() as RichNode }),
    onSelectionUpdate: ({ editor }) => {
      if (positionTimer.current) clearTimeout(positionTimer.current);
      positionTimer.current = setTimeout(() => {
        void api(`/documents/${original.id}/position`, {
          method: 'PUT',
          body: json({ cursor: editor.state.selection.from }),
        }).catch(() => {});
      }, 1500);
    },
    onCreate: ({ editor }) => {
      editor.commands.setTextSelection(
        Math.min(Math.max(original.cursor, 1), editor.state.doc.content.size),
      );
      editor.commands.scrollIntoView();
      void api(`/documents/${original.id}/position`, {
        method: 'PUT',
        body: json({ cursor: original.cursor }),
      }).catch(() => {});
    },
  });
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
    editor.commands.setContent(snapshot.content, { emitUpdate: false });
    if (persist) save.change(snapshot);
  }
  async function leave() {
    await save.flush();
    if (
      save.getLocal() &&
      !window.confirm(
        'Des modifications restent sur cet appareil. Quitter l’éditeur en conservant la copie de récupération ?',
      )
    )
      return;
    void queryClient.invalidateQueries({ queryKey: ['documents', ownerId] });
    void queryClient.invalidateQueries({ queryKey: ['profile', ownerId] });
    navigate('/library');
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
        [JSON.stringify({ schemaVersion: 1, title, content: editor.getJSON(), layout }, null, 2)],
        { type: 'application/json' },
      ),
      `${title}.laboratoire.json`,
    );
  const size = layout.format === 'A4' ? [210, 297] : [215.9, 279.4];
  return (
    <div className="editor-shell">
      <header className="editor-header">
        <button
          className="icon-button"
          aria-label="Revenir à la bibliothèque"
          onClick={() => void leave()}
        >
          <ArrowLeft size={21} />
        </button>
        <Brand compact />
        <div className="document-title-area">
          <input
            aria-label="Titre du document"
            className="document-title"
            maxLength={200}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              live.current.title = e.target.value;
              save.change({
                title: e.target.value || 'Document sans titre',
                content: editor.getJSON() as RichNode,
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
            className="button subtle"
            onClick={() => setHistory(!history)}
            aria-pressed={history}
          >
            <History size={17} />
            <span>Historique</span>
          </button>
          <button className="button primary" onClick={() => setModal('export')}>
            <FileDown size={17} />
            <span>Exporter</span>
          </button>
        </div>
      </header>
      <div className="editor-menubar">
        <button onClick={() => setModal('import')}>
          <Upload size={14} /> Importer
        </button>
        <button
          onClick={() => {
            setOutline(!outline);
          }}
          aria-pressed={outline}
        >
          <PanelLeft size={14} /> Plan du document
        </button>
        <button onClick={() => setModal('page')}>
          <Settings2 size={14} /> Mise en page
        </button>
        <button onClick={() => setModal('help')}>Aide et raccourcis</button>
        <span className="menubar-spacer" />
        <select aria-label="Zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
          {[75, 90, 100, 110, 125].map((n) => (
            <option key={n} value={n}>
              {n}%
            </option>
          ))}
        </select>
      </div>
      <Toolbar editor={editor} onFind={() => setFind(!find)} onError={setError} />
      <MemoryTools
        editor={editor}
        documentId={original.id}
        ownerId={ownerId}
        status={save.status}
        flush={save.flush}
        hasLocal={() => Boolean(save.getLocal())}
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
                if (window.confirm('Abandonner la copie locale et charger la version distante ?'))
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
        {outline && <DocumentOutline editor={editor} />}
        <main className="paper-workspace">
          <div className="paper-ruler" aria-hidden="true">
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
                '--page-width': `${size[layout.landscape ? 1 : 0]}mm`,
                '--page-height': `${size[layout.landscape ? 0 : 1]}mm`,
                '--page-margin': `${layout.margin}mm`,
                zoom: zoom / 100,
              } as CSSProperties
            }
          >
            <EditorContent editor={editor} />
          </div>
          <p className="paper-caption">
            {layout.format} · Marges {layout.margin} mm · Écriture en continu, pages à l’impression
          </p>
        </main>
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
                save.change({ title, content: editor.getJSON() as RichNode, layout: value });
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
                save.change({ title, content: editor.getJSON() as RichNode, layout: value });
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
                save.change({ title, content: editor.getJSON() as RichNode, layout: value });
              }}
            />{' '}
            Orientation paysage
          </label>
          <p className="muted small">
            Le document s’écrit en continu. Les sauts de page manuels et la pagination du navigateur
            sont appliqués à l’impression. Il n’y a pas de pagination automatique exacte à l’écran.
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
                    await makeDocx(title, editor.getJSON() as RichNode, layout),
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
                  await window.document.fonts.ready;
                  await Promise.all(
                    [...window.document.querySelectorAll('.document-paper img')].map((img) =>
                      (img as HTMLImageElement).decode().catch(() => {}),
                    ),
                  );
                  window.print();
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
                  new Blob([plainText(editor.getJSON() as RichNode)], {
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
            Le JSON conserve toutes les métadonnées de l’éditeur, mais référence les images de votre
            compte sans embarquer leurs fichiers.
          </p>
          {error && <p className="alert error">{error}</p>}
        </Modal>
      )}
      {modal === 'import' && (
        <Modal title="Importer un document" onClose={() => setModal(null)}>
          <p>L’import crée un nouveau document dans votre bibliothèque.</p>
          <p className="alert warning">{importLimits}</p>
          <p className="muted small">
            Formats : DOCX ou source JSON du Laboratoire. Taille DOCX maximale : 10 Mo.
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
              throw new Error('Synchronisez ou exportez d’abord les modifications de ce document.');
            let content: RichNode;
            let importedTitle = file.name.replace(/\.(docx|json)$/i, '').slice(0, 200);
            let importedLayout = layout;
            if (file.name.toLowerCase().endsWith('.docx')) {
              const { importDocx } = await import('./docx-import');
              const result = await importDocx(file);
              content = result.content;
              if (result.warnings.length)
                window.alert(`Import terminé avec avertissements :\n${result.warnings.join('\n')}`);
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
        <Modal title="Écrire au Laboratoire" onClose={() => setModal(null)}>
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
            La sauvegarde s’effectue après une courte pause de frappe. En cas de coupure réseau, vos
            modifications restent dans ce navigateur. Ne videz pas ses données avant la
            synchronisation.
          </p>
          <p className="muted small">
            Les changements simultanés sont signalés à la sauvegarde. Il n’y a pas encore d’édition
            collaborative en temps réel.
          </p>
        </Modal>
      )}
    </div>
  );
}
function DocumentOutline({ editor }: { editor: Editor }) {
  const headings = useEditorState({
    editor,
    selector: ({ editor }) => {
      const result: { text: string; level: number; pos: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading')
          result.push({ text: node.textContent, level: node.attrs.level, pos });
      });
      return result;
    },
  });
  return (
    <aside className="document-outline">
      <h2>Dans ce document</h2>
      {headings.length ? (
        headings.map((h) => (
          <button
            key={h.pos}
            style={{ paddingLeft: 12 + (h.level - 1) * 12 }}
            onClick={() =>
              editor
                .chain()
                .focus()
                .setTextSelection(h.pos + 1)
                .scrollIntoView()
                .run()
            }
          >
            {h.text || 'Titre sans texte'}
          </button>
        ))
      ) : (
        <p>
          Vos titres apparaîtront ici.
          <br />
          Utilisez les styles Titre 1, 2 et 3 pour structurer vos idées.
        </p>
      )}
    </aside>
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
