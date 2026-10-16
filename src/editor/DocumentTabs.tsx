import { useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { Plus, MoreHorizontal, X, FileText } from 'lucide-react';
import { Modal } from '../components/Modal';
import { tabDepth, type DocumentTab } from '../shared/tabs';

export function DocumentTabs({
  editor,
  tabs,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
  onClose,
}: {
  editor: Editor;
  tabs: DocumentTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: (parentId: string | null) => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [rename, setRename] = useState<DocumentTab | null>(null),
    [title, setTitle] = useState('');
  const headings = useEditorState({
    editor,
    selector: ({ editor }) => {
      const rows: { text: string; level: number; pos: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading')
          rows.push({ text: node.textContent, level: node.attrs.level, pos });
      });
      return rows;
    },
  });
  return (
    <aside className="document-outline" id="document-outline" aria-label="Plan du document">
      <div className="outline-heading">
        <h2>Onglets</h2>
        <button className="icon-button" aria-label="Ajouter un onglet" onClick={() => onAdd(null)}>
          <Plus size={17} />
        </button>
        <button className="icon-button" aria-label="Masquer le plan" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="document-tabs-list" role="navigation" aria-label="Onglets du document">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="document-tab-item"
            style={{ '--tab-depth': tabDepth(tabs, tab.id) } as React.CSSProperties}
          >
            <div className={`tab-title-row ${tab.id === activeId ? 'active' : ''}`}>
              <button
                className="tab-select"
                aria-current={tab.id === activeId ? 'page' : undefined}
                onClick={() => onSelect(tab.id)}
              >
                <FileText size={14} />
                <span>{tab.title}</span>
              </button>
              <details className="menu">
                <summary aria-label={`Options de l’onglet ${tab.title}`}>
                  <MoreHorizontal size={16} />
                </summary>
                <div className="menu-popover">
                  <button
                    onClick={() => {
                      setRename(tab);
                      setTitle(tab.title);
                    }}
                  >
                    Renommer
                  </button>
                  <button disabled={tabDepth(tabs, tab.id) >= 2} onClick={() => onAdd(tab.id)}>
                    Ajouter un sous-onglet
                  </button>
                  <button onClick={() => onDuplicate(tab.id)}>Dupliquer</button>
                  <button
                    className="danger-text"
                    disabled={tabs.length === 1}
                    onClick={() => onDelete(tab.id)}
                  >
                    Supprimer l’onglet
                  </button>
                </div>
              </details>
            </div>
            {tab.id === activeId && (
              <div className="tab-headings">
                {headings.length ? (
                  headings.map((h) => (
                    <button
                      key={h.pos}
                      style={{ paddingLeft: 12 + (h.level - 1) * 10 }}
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
              </div>
            )}
          </div>
        ))}
      </div>
      {rename && (
        <Modal title="Renommer l’onglet" onClose={() => setRename(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onRename(rename.id, title.trim());
              setRename(null);
            }}
          >
            <label>
              Nom de l’onglet
              <input
                autoFocus
                required
                maxLength={100}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="button" onClick={() => setRename(null)}>
                Annuler
              </button>
              <button className="button primary" type="submit">
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </aside>
  );
}
