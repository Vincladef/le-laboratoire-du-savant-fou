import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEditorState, type Editor } from '@tiptap/react';
import { Sparkles, X, LoaderCircle, ArrowLeft } from 'lucide-react';
import { api, json } from '../lib/api';
import {
  AI_MAX_SOURCE,
  aiRequestSchema,
  aiProposalSchema,
  validateHoles,
  type AiHole,
  type AiProposal,
  type AiRequest,
} from '../shared/ai';
import { priorityLabels, difficultyLabels } from '../shared/learning';
import type { DocumentTab } from '../shared/tabs';
import { collectSources, type SourceRange } from './ai-document';

type Snapshot = {
  tabs: DocumentTab[];
  sources: SourceRange[];
  activeId: string;
  position: number;
  mode: AiRequest['mode'];
};
export type AiSnapshot = Snapshot;
export function AiAssistant({
  editor,
  documentId,
  activeId,
  open,
  onClose,
  getTabs,
  onApply,
}: {
  editor: Editor;
  documentId: string;
  activeId: string;
  open: boolean;
  onClose: () => void;
  getTabs: () => DocumentTab[];
  onApply: (snapshot: Snapshot, proposal: AiProposal) => void;
}) {
  const [mode, setMode] = useState<AiRequest['mode']>('cloze');
  const [scope, setScope] = useState<'selection' | 'tab' | 'document' | 'none'>(
    editor.state.selection.empty ? 'tab' : 'selection',
  );
  const selection = useEditorState({
    editor,
    selector: ({ editor }) => ({
      from: editor.state.selection.from,
      to: editor.state.selection.to,
      empty: editor.state.selection.empty,
      text: editor.state.doc.textBetween(
        editor.state.selection.from,
        editor.state.selection.to,
        '\n',
      ),
    }),
  });
  useEffect(() => {
    const refresh = () => {
      if (mode === 'cloze' && !editor.state.selection.empty) setScope('selection');
    };
    editor.on('selectionUpdate', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
    };
  }, [editor, mode]);
  const [instructions, setInstructions] = useState('');
  const [length, setLength] = useState<AiRequest['length']>('medium');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [proposal, setProposal] = useState<AiProposal | null>(null),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const abort = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement>(null);
  const config = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => api<{ enabled: boolean; model: string }>('/ai/config'),
    enabled: open,
  });
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    abort.current?.abort();
    setBusy(false);
    setProposal(null);
    setSnapshot(null);
    setError('');
  }, [editor]);
  useEffect(() => {
    if (open) {
      if (!editor.state.selection.empty && !proposal) setScope('selection');
      // Move to an announced, non-modal panel only when explicitly opened.
      panel.current?.focus({ preventScroll: true });
    } else {
      abort.current?.abort();
      setBusy(false);
    }
  }, [open]);
  async function generate() {
    setError('');
    setNotice('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const tabs = structuredClone(getTabs());
      const selected = editor.state.selection;
      const effectiveScope =
        mode === 'cloze' && scope !== 'document' ? (selected.empty ? 'tab' : 'selection') : scope;
      if (effectiveScope === 'selection' && selected.empty)
        throw new Error('Sélectionnez un passage ou choisissez « Onglet actuel ».');
      const sources = (
        effectiveScope === 'none'
          ? []
          : effectiveScope === 'document'
            ? tabs
            : tabs.filter((t) => t.id === activeId)
      ).flatMap((tab) =>
        collectSources(
          editor.schema.nodeFromJSON(tab.content),
          tab.id,
          effectiveScope === 'selection' ? selected : undefined,
          mode !== 'cloze',
        ),
      );
      if (sources.reduce((sum, s) => sum + s.text.length, 0) > AI_MAX_SOURCE)
        throw new Error(
          'Ce contenu dépasse 30 000 caractères. Choisissez une sélection ou un onglet plus court.',
        );
      const request = aiRequestSchema.parse({
        mode: mode === 'write' && scope !== 'none' ? 'complete' : mode,
        instructions,
        length,
        sources: sources.map(({ id, text }) => ({ id, text })),
      });
      const captured: Snapshot = { tabs, sources, activeId, position: selected.to, mode };
      setBusy(true);
      const result = await api<AiProposal>(`/documents/${documentId}/ai`, {
        method: 'POST',
        body: json(request),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      aiProposalSchema.parse(result);
      setProposal(result);
      setSnapshot(captured);
      setChecked(result.holes.map(() => true));
    } catch (e) {
      if (
        !controller.signal.aborted &&
        abort.current === controller &&
        (e as Error).name !== 'AbortError'
      ) {
        const message =
          e instanceof Error && 'issues' in e
            ? (e as any).issues.map((i: any) => i.message).join(' ')
            : (e as Error).message;
        setError(message);
      }
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  }
  const selectedHoles = proposal?.holes.filter((_, i) => checked[i]) || [];
  let invalid = '';
  if (proposal && snapshot)
    try {
      validateHoles(
        selectedHoles,
        snapshot.mode === 'cloze' ? snapshot.sources : [{ id: 'generated', text: proposal.text }],
      );
    } catch (e) {
      invalid = (e as Error).message;
    }
  function changeHole(index: number, values: Partial<AiHole>) {
    setProposal(
      (p) => p && { ...p, holes: p.holes.map((h, i) => (i === index ? { ...h, ...values } : h)) },
    );
  }
  if (!open) return null;
  const isCloze = mode === 'cloze' || mode === 'compose-cloze';
  return (
    <aside
      ref={panel}
      className="ai-panel"
      role="region"
      aria-label="Assistant IA"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
          editor.commands.focus();
        }
      }}
    >
      <div className="context-heading">
        <h2>
          <Sparkles size={17} />
          Un coup de pouce
        </h2>
        <button className="icon-button" aria-label="Fermer l’assistant IA" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="ai-panel-body">
        <p className="muted small">
          Des idées pour votre carnet. Vous gardez la main sur chaque proposition.
        </p>
        {notice && (
          <p className="alert info" role="status">
            {notice}
          </p>
        )}
        {!proposal ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <label>
              Que souhaitez-vous faire ?
              <select
                value={mode}
                disabled={busy}
                onChange={(e) => {
                  setMode(e.target.value as AiRequest['mode']);
                  setScope(
                    e.target.value === 'cloze'
                      ? editor.state.selection.empty
                        ? 'tab'
                        : 'selection'
                      : 'none',
                  );
                }}
              >
                <option value="cloze">Créer des trous dans le texte</option>
                <option value="write">Rédiger du texte</option>
                <option value="compose-cloze">Rédiger un texte à trous</option>
              </select>
            </label>
            {mode === 'cloze' && (
              <p className="ai-target" role="status">
                {scope === 'document'
                  ? 'Document entier'
                  : selection.empty
                    ? 'Onglet actuel'
                    : `Sélection · ${selection.to - selection.from} caractères`}
                {scope !== 'document' && !selection.empty && <q>{selection.text.slice(0, 160)}</q>}
              </p>
            )}
            {mode === 'cloze' ? (
              <details>
                <summary>Étendre au document entier</summary>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={scope === 'document'}
                    onChange={(e) =>
                      setScope(
                        e.target.checked
                          ? 'document'
                          : editor.state.selection.empty
                            ? 'tab'
                            : 'selection',
                      )
                    }
                  />
                  Inclure tous les onglets
                </label>
              </details>
            ) : (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={scope !== 'none'}
                  onChange={(e) =>
                    setScope(
                      e.target.checked
                        ? editor.state.selection.empty
                          ? 'tab'
                          : 'selection'
                        : 'none',
                    )
                  }
                />
                S’appuyer sur {editor.state.selection.empty ? 'l’onglet actuel' : 'la sélection'}{' '}
                pour poursuivre ou compléter
              </label>
            )}
            <label>
              Vos consignes {mode === 'cloze' && '(facultatif)'}
              <textarea
                value={instructions}
                disabled={busy}
                maxLength={4000}
                rows={4}
                placeholder={
                  mode === 'cloze'
                    ? 'Ex. : masquer les notions essentielles, avec des indices courts…'
                    : 'Ex. : expliquer la photosynthèse pour une classe de 5e…'
                }
                onChange={(e) => setInstructions(e.target.value)}
              />
            </label>
            {mode !== 'cloze' && (
              <label>
                Longueur
                <select
                  value={length}
                  disabled={busy}
                  onChange={(e) => setLength(e.target.value as AiRequest['length'])}
                >
                  <option value="short">Court</option>
                  <option value="medium">Moyen</option>
                  <option value="long">Long</option>
                </select>
              </label>
            )}
            <p className="muted small">
              La sélection est utilisée en priorité, sinon l’onglet actif. La rédaction libre
              utilise uniquement votre consigne. Aucun changement avant votre accord.
            </p>
            {config.data && !config.data.enabled && (
              <p className="alert warning" role="status">
                La clé OpenAI doit être disponible dans les fonctions Netlify, puis le site
                redéployé.
              </p>
            )}
            {config.error && <p role="alert">{config.error.message}</p>}
            <button
              className="button primary ai-generate"
              type="submit"
              disabled={busy || !config.data?.enabled}
            >
              {busy ? (
                <>
                  <LoaderCircle className="ai-spinner" size={16} />
                  Préparation en cours…
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Proposer
                </>
              )}
            </button>
            {busy && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  abort.current?.abort();
                  setBusy(false);
                }}
              >
                Arrêter l’attente
              </button>
            )}
          </form>
        ) : (
          <div className="ai-proposal">
            <div className="context-heading">
              <strong>Proposition à vérifier</strong>
              <button
                className="text-button"
                onClick={() => {
                  setProposal(null);
                  setError('');
                }}
              >
                <ArrowLeft size={14} />
                Consignes
              </button>
            </div>
            {snapshot?.mode !== 'cloze' && (
              <>
                <div className="ai-text-preview" aria-label="Aperçu du texte proposé">
                  <TextPreview text={proposal.text} holes={invalid ? [] : selectedHoles} />
                </div>
                <details>
                  <summary>Modifier le texte</summary>
                  <label>
                    Texte proposé
                    <textarea
                      rows={8}
                      maxLength={20000}
                      value={proposal.text}
                      onChange={(e) => setProposal({ ...proposal, text: e.target.value })}
                    />
                  </label>
                </details>
                <p className="muted small">
                  Le texte sera ajouté après la sélection ou au curseur dans l’onglet d’origine.
                </p>
              </>
            )}
            {proposal.holes.length > 0 ? (
              <fieldset className="ai-hole-list">
                <legend>Passages à créer ({selectedHoles.length})</legend>
                {proposal.holes.map((hole, i) => (
                  <article className="ai-hole" key={i}>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={checked[i] || false}
                        onChange={(e) =>
                          setChecked((c) => c.map((v, n) => (n === i ? e.target.checked : v)))
                        }
                      />
                      <span>{hole.quote}</span>
                    </label>
                    <details>
                      <summary>Indice et réglages</summary>
                      <label>
                        Réponse du passage {i + 1}
                        <input
                          maxLength={2000}
                          value={hole.quote}
                          onChange={(e) => changeHole(i, { quote: e.target.value })}
                        />
                      </label>
                      <label>
                        Occurrence dans l’extrait
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={hole.occurrence}
                          onChange={(e) => changeHole(i, { occurrence: Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        Indice du passage {i + 1}
                        <textarea
                          rows={2}
                          maxLength={1000}
                          value={hole.hint}
                          onChange={(e) => changeHole(i, { hint: e.target.value })}
                        />
                      </label>
                      <div className="context-fields">
                        <label>
                          Priorité
                          <select
                            value={hole.priority}
                            onChange={(e) =>
                              changeHole(i, { priority: e.target.value as AiHole['priority'] })
                            }
                          >
                            {Object.entries(priorityLabels).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Difficulté
                          <select
                            value={hole.difficulty}
                            onChange={(e) =>
                              changeHole(i, { difficulty: e.target.value as AiHole['difficulty'] })
                            }
                          >
                            {Object.entries(difficultyLabels).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </details>
                  </article>
                ))}
              </fieldset>
            ) : (
              snapshot?.mode === 'cloze' && (
                <p>Aucun passage pertinent n’a été trouvé. Vous pouvez préciser les consignes.</p>
              )
            )}
            {invalid && (
              <p role="alert" className="alert warning">
                {invalid}
              </p>
            )}
            <div className="context-actions">
              <button
                className="text-button"
                onClick={() => {
                  setProposal(null);
                  setSnapshot(null);
                  setError('');
                  setNotice('Proposition rejetée. Votre document est intact.');
                }}
              >
                Rejeter
              </button>
              <button
                className="button primary"
                disabled={Boolean(invalid) || (!proposal.text.trim() && !selectedHoles.length)}
                onClick={() => {
                  try {
                    if (!snapshot) return;
                    onApply(snapshot, { ...proposal, holes: selectedHoles });
                    setProposal(null);
                    setSnapshot(null);
                    setError('');
                    setNotice('Proposition appliquée. La sauvegarde automatique prend le relais.');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Appliquer{snapshot?.mode === 'cloze' ? ` (${selectedHoles.length})` : ''}
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <p className="ai-footnote">
          {config.data?.model || 'OpenAI'} · Vérifiez les informations proposées.
        </p>
      </div>
    </aside>
  );
}
function TextPreview({ text, holes }: { text: string; holes: AiHole[] }) {
  const ranges = validateHoles(holes, [{ id: 'generated', text }]).sort((a, b) => a.from - b.from);
  const parts = [];
  let cursor = 0;
  for (const [i, range] of ranges.entries()) {
    parts.push(text.slice(cursor, range.from));
    parts.push(<mark key={i}>{text.slice(range.from, range.to)}</mark>);
    cursor = range.to;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
