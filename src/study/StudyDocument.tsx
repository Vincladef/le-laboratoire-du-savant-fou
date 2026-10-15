import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { editorExtensions } from '../editor/extensions';
import type { DocumentRecord } from '../shared/document';
const maskKey = new PluginKey<Set<string>>('study-mask');
function maskExtension(reveal: (id: string) => void) {
  return Extension.create({
    name: 'studyMask',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: maskKey,
          state: {
            init: () => new Set<string>(),
            apply: (tr, state) => tr.getMeta(maskKey) ?? state,
          },
          props: {
            decorations(state) {
              const hidden = maskKey.getState(state)!;
              const decorations: Decoration[] = [];
              const buttons = new Set<string>();
              state.doc.descendants((node, pos) => {
                const id = node.marks.find((m) => m.type.name === 'memoryAnchor')?.attrs.id;
                if (!id || !hidden.has(id)) return;
                decorations.push(
                  Decoration.inline(pos, pos + node.nodeSize, {
                    class: 'study-hidden',
                    'aria-hidden': 'true',
                  }),
                );
                if (buttons.has(id)) return;
                buttons.add(id);
                decorations.push(
                  Decoration.widget(
                    pos,
                    () => {
                      const button = document.createElement('button');
                      button.type = 'button';
                      button.className = 'study-reveal';
                      button.textContent = '[ Révéler ]';
                      button.setAttribute('aria-label', `Révéler le passage ${buttons.size}`);
                      button.addEventListener('click', () => reveal(id));
                      return button;
                    },
                    { side: -1, key: `reveal-${id}` },
                  ),
                );
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}
export function StudyDocument({
  document: doc,
  hidden,
  onReveal,
}: {
  document: DocumentRecord;
  hidden: string[];
  onReveal: (id: string) => void;
}) {
  const reveal = useRef(onReveal);
  reveal.current = onReveal;
  const editor = useEditor({
    extensions: [...editorExtensions(), maskExtension((id) => reveal.current(id))],
    content: doc.content,
    editable: false,
    editorProps: { attributes: { 'aria-label': 'Document de révision', role: 'document' } },
  });
  useEffect(() => {
    if (editor) editor.view.dispatch(editor.state.tr.setMeta(maskKey, new Set(hidden)));
  }, [editor, hidden.join(',')]);
  return (
    <div className="study-paper document-page" style={{ padding: `${doc.layout.margin}mm` }}>
      <EditorContent editor={editor} />
    </div>
  );
}
