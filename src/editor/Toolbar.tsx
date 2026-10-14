import { useRef, useState, type ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  ListTodo,
  IndentIncrease,
  IndentDecrease,
  Table2,
  ImagePlus,
  Link2,
  Sigma,
  Search,
  Eraser,
  Highlighter,
  Type,
  ScissorsLineDashed,
} from 'lucide-react';
import katex from 'katex';
import { fonts, isSafeLink } from '../shared/document';
import { uploadImage } from '../lib/api';
import { Modal } from '../components/Modal';
import { setBlockStyle, insertPageBreak } from './extensions';
function Tool({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tool ${active ? 'active' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Toolbar({
  editor,
  onFind,
  onError,
}: {
  editor: Editor;
  onFind: () => void;
  onError: (message: string) => void;
}) {
  useEditorState({ editor, selector: ({ editor }) => editor.state });
  const imageInput = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<'link' | 'math' | 'image' | null>(null);
  const [value, setValue] = useState('');
  const [blockMath, setBlockMath] = useState(false);
  const [imageAlt, setImageAlt] = useState('');
  const style = editor.isActive('heading')
    ? `h${editor.getAttributes('heading').level}`
    : 'paragraph';
  const block = editor.getAttributes(editor.isActive('heading') ? 'heading' : 'paragraph');
  const openMath = () => {
    setBlockMath(editor.isActive('blockMath'));
    setValue(
      editor.getAttributes('inlineMath').latex ||
        editor.getAttributes('blockMath').latex ||
        'E = mc^2',
    );
    setModal('math');
  };
  return (
    <>
      <div className="editor-toolbar" role="toolbar" aria-label="Mise en forme">
        <div className="toolbar-group">
          <Tool
            label="Annuler (Ctrl+Z)"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 />
          </Tool>
          <Tool
            label="Rétablir (Ctrl+Maj+Z)"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 />
          </Tool>
        </div>
        <div className="toolbar-group">
          <select
            aria-label="Style de paragraphe"
            value={style}
            onChange={(e) =>
              e.target.value === 'paragraph'
                ? editor.chain().focus().setParagraph().run()
                : editor
                    .chain()
                    .focus()
                    .setHeading({ level: Number(e.target.value[1]) as 1 | 2 | 3 })
                    .run()
            }
          >
            <option value="paragraph">Texte normal</option>
            <option value="h1">Titre 1</option>
            <option value="h2">Titre 2</option>
            <option value="h3">Titre 3</option>
          </select>
          <select
            aria-label="Police"
            value={editor.getAttributes('textStyle').fontFamily || 'Arial'}
            onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
          >
            {fonts.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          <select
            aria-label="Taille de police"
            className="font-size"
            value={editor.getAttributes('textStyle').fontSize || '11pt'}
            onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
          >
            {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72].map((n) => (
              <option key={n} value={`${n}pt`}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-group">
          <Tool
            label="Gras (Ctrl+B)"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold />
          </Tool>
          <Tool
            label="Italique (Ctrl+I)"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic />
          </Tool>
          <Tool
            label="Souligné (Ctrl+U)"
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline />
          </Tool>
          <Tool
            label="Barré"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough />
          </Tool>
          <label className="color-tool" title="Couleur du texte">
            <Type size={18} />
            <input
              type="color"
              aria-label="Couleur du texte"
              defaultValue="#202927"
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            />
          </label>
          <label className="color-tool" title="Surlignage">
            <Highlighter size={18} />
            <input
              type="color"
              aria-label="Surlignage"
              defaultValue="#ffe999"
              onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
            />
          </label>
          <Tool
            label="Effacer la mise en forme"
            onClick={() => {
              let chain = editor.chain().focus();
              for (const mark of [
                'bold',
                'italic',
                'underline',
                'strike',
                'code',
                'link',
                'textStyle',
                'highlight',
              ])
                chain = chain.unsetMark(mark);
              chain.clearNodes().run();
            }}
          >
            <Eraser />
          </Tool>
        </div>
        <div className="toolbar-group">
          {[
            ['left', AlignLeft, 'Aligner à gauche'],
            ['center', AlignCenter, 'Centrer'],
            ['right', AlignRight, 'Aligner à droite'],
            ['justify', AlignJustify, 'Justifier'],
          ].map(([alignment, Icon, label]) => {
            const Component = Icon as typeof AlignLeft;
            return (
              <Tool
                key={String(alignment)}
                label={String(label)}
                active={editor.isActive({ textAlign: alignment })}
                onClick={() => editor.chain().focus().setTextAlign(String(alignment)).run()}
              >
                <Component />
              </Tool>
            );
          })}
          <select
            className="line-height"
            aria-label="Interligne"
            value={block.lineHeight || '1.5'}
            onChange={(e) => setBlockStyle(editor, { lineHeight: e.target.value })}
          >
            {['1', '1.15', '1.5', '2', '2.5'].map((n) => (
              <option key={n} value={n}>
                ↕ {n}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-group">
          <Tool
            label="Liste à puces"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List />
          </Tool>
          <Tool
            label="Liste numérotée"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered />
          </Tool>
          <Tool
            label="Cases à cocher"
            active={editor.isActive('taskList')}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <ListTodo />
          </Tool>
          <Tool
            label="Diminuer le retrait"
            onClick={() =>
              editor.isActive('listItem')
                ? editor.chain().focus().liftListItem('listItem').run()
                : setBlockStyle(editor, { indent: Math.max(0, (block.indent || 0) - 1) })
            }
          >
            <IndentDecrease />
          </Tool>
          <Tool
            label="Augmenter le retrait"
            onClick={() =>
              editor.isActive('listItem')
                ? editor.chain().focus().sinkListItem('listItem').run()
                : setBlockStyle(editor, { indent: Math.min(8, (block.indent || 0) + 1) })
            }
          >
            <IndentIncrease />
          </Tool>
        </div>
        <div className="toolbar-group">
          <Tool
            label="Insérer un tableau"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <Table2 />
          </Tool>
          <Tool label="Insérer une image" onClick={() => imageInput.current?.click()}>
            <ImagePlus />
          </Tool>
          <Tool
            label="Insérer ou modifier un lien"
            active={editor.isActive('link')}
            onClick={() => {
              setValue(editor.getAttributes('link').href || 'https://');
              setModal('link');
            }}
          >
            <Link2 />
          </Tool>
          <Tool label="Insérer ou modifier une équation" onClick={openMath}>
            <Sigma />
          </Tool>
          <Tool label="Saut de page (Ctrl+Entrée)" onClick={() => insertPageBreak(editor)}>
            <ScissorsLineDashed />
          </Tool>
          <Tool label="Rechercher et remplacer (Ctrl+F)" onClick={onFind}>
            <Search />
          </Tool>
        </div>
      </div>
      {editor.isActive('table') && (
        <div className="context-toolbar">
          <span>Tableau</span>
          <button onClick={() => editor.chain().focus().addRowAfter().run()}>+ Ligne</button>
          <button onClick={() => editor.chain().focus().addColumnAfter().run()}>+ Colonne</button>
          <button onClick={() => editor.chain().focus().deleteRow().run()}>
            Supprimer la ligne
          </button>
          <button onClick={() => editor.chain().focus().deleteColumn().run()}>
            Supprimer la colonne
          </button>
          <button onClick={() => editor.chain().focus().mergeCells().run()}>Fusionner</button>
          <button onClick={() => editor.chain().focus().splitCell().run()}>Scinder</button>
          <button onClick={() => editor.chain().focus().toggleHeaderRow().run()}>
            Ligne d’en-tête
          </button>
          <button onClick={() => editor.chain().focus().deleteTable().run()}>
            Supprimer le tableau
          </button>
        </div>
      )}
      {editor.isActive('image') && (
        <div className="context-toolbar">
          <span>Image sélectionnée</span>
          <button
            onClick={() => {
              setValue(String(editor.getAttributes('image').width || 400));
              setImageAlt(editor.getAttributes('image').alt || '');
              setModal('image');
            }}
          >
            Dimensions et texte alternatif
          </button>
          <button onClick={() => editor.chain().focus().deleteSelection().run()}>
            Retirer du document
          </button>
        </div>
      )}
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const image = await uploadImage(file);
            editor.chain().focus().setImage({ src: image.src, alt: file.name }).run();
          } catch (e) {
            onError((e as Error).message);
          } finally {
            e.target.value = '';
          }
        }}
      />
      {modal && (
        <Modal
          title={
            modal === 'link'
              ? 'Lien hypertexte'
              : modal === 'image'
                ? 'Propriétés de l’image'
                : 'Équation mathématique'
          }
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (modal === 'link') {
                if (!isSafeLink(value)) {
                  onError('Utilisez un lien https://, http:// ou mailto:.');
                  return;
                }
                editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
              } else if (modal === 'image')
                editor
                  .chain()
                  .focus()
                  .updateAttributes('image', {
                    width: Math.max(20, Math.min(1600, Number(value))),
                    alt: imageAlt,
                  })
                  .run();
              else {
                if (editor.isActive('inlineMath'))
                  editor.chain().focus().updateInlineMath({ latex: value }).run();
                else if (editor.isActive('blockMath'))
                  editor.chain().focus().updateBlockMath({ latex: value }).run();
                else if (blockMath) editor.chain().focus().insertBlockMath({ latex: value }).run();
                else editor.chain().focus().insertInlineMath({ latex: value }).run();
              }
              setModal(null);
            }}
          >
            <label>
              {modal === 'link'
                ? 'Adresse du lien'
                : modal === 'image'
                  ? 'Largeur en pixels'
                  : 'Expression LaTeX'}
              <input
                required
                autoFocus
                type={modal === 'image' ? 'number' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                min={20}
                max={1600}
              />
            </label>
            {modal === 'math' && (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={blockMath}
                    onChange={(e) => setBlockMath(e.target.checked)}
                  />{' '}
                  Équation sur sa propre ligne
                </label>
                <div
                  className="equation-preview"
                  dangerouslySetInnerHTML={{
                    __html: katex.renderToString(value, {
                      throwOnError: false,
                      trust: false,
                      displayMode: true,
                    }),
                  }}
                />
              </>
            )}
            {modal === 'image' && (
              <label>
                Texte alternatif
                <input
                  value={imageAlt}
                  maxLength={1000}
                  onChange={(e) => setImageAlt(e.target.value)}
                />
              </label>
            )}
            <div className="modal-actions">
              {modal === 'link' && (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    editor.chain().focus().unsetLink().run();
                    setModal(null);
                  }}
                >
                  Retirer le lien
                </button>
              )}
              <button type="button" className="button" onClick={() => setModal(null)}>
                Annuler
              </button>
              <button type="submit" className="button primary">
                Appliquer
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
