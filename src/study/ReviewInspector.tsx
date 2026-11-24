import { ArrowLeft, ArrowRight, Link2, X } from 'lucide-react';
import {
  difficultyLabels,
  priorityLabels,
  type Difficulty,
  type MemoryPassage,
  type Priority,
} from '../shared/learning';
import { groupTone } from './group-palette';

const grades: Difficulty[] = ['hard', 'medium', 'easy'];
const gradeKeys: Record<string, string> = { hard: '1', medium: '2', easy: '3' };

/** Only the active question exposes its evaluation controls; the rich text is
 * left intact. One panel serves all the occurrences of a linked question.
 */
export function ReviewInspector({
  passage,
  number,
  position,
  total,
  groupCount = 1,
  busy = false,
  onDifficulty,
  onPriority,
  onPrevious,
  onNext,
  onClose,
}: {
  passage: MemoryPassage;
  number: number;
  position: number;
  total: number;
  groupCount?: number;
  busy?: boolean;
  onDifficulty: (difficulty: Difficulty) => void;
  onPriority: (priority: Priority) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onClose: () => void;
}) {
  const grouped = Boolean(passage.groupId && groupCount > 1);
  return (
    <aside
      className={
        'review-inspector' + (grouped ? ' review-tone-' + groupTone(passage.groupId!) : '')
      }
      aria-label={'Évaluation du passage ' + number}
    >
      <div className="review-inspector-heading">
        <div className="review-inspector-context">
          <span className="review-inspector-eyebrow">
            Question {position} sur {total}
          </span>
          {grouped && (
            <span className="review-inspector-group">
              <Link2 aria-hidden size={13} strokeWidth={2.1} />
              Groupe {number} <span aria-hidden="true">·</span> {groupCount} occurrences
            </span>
          )}
        </div>
        <button
          className="review-inspector-close"
          type="button"
          aria-label="Fermer l’évaluation"
          title="Fermer l’évaluation"
          onClick={onClose}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <p className="review-inspector-answer" title={passage.quote}>
        {passage.quote}
      </p>
      <div
        className="review-inspector-grade"
        role="group"
        aria-label={'Difficulté du passage ' + number}
      >
        {grades.map((grade) => (
          <button
            key={grade}
            type="button"
            data-grade={grade}
            className={'review-grade' + (passage.difficulty === grade ? ' is-current' : '')}
            aria-label={
              'Évaluer ' + difficultyLabels[grade].toLowerCase() + ' le passage ' + number
            }
            aria-pressed={passage.difficulty === grade}
            disabled={busy}
            onClick={() => {
              if (grade !== passage.difficulty) onDifficulty(grade);
            }}
          >
            <span>{difficultyLabels[grade]}</span>
            <kbd aria-hidden="true">{gradeKeys[grade]}</kbd>
          </button>
        ))}
      </div>
      <div className="review-inspector-bottom">
        <label className="review-inspector-priority">
          <span>Priorité</span>
          <select
            aria-label={'Priorité du passage ' + number}
            disabled={busy}
            value={passage.priority}
            onChange={(event) => {
              const priority = event.target.value as Priority;
              if (priority !== passage.priority) onPriority(priority);
            }}
          >
            {(Object.entries(priorityLabels) as [Priority, string][]).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="review-inspector-navigation">
          <button
            type="button"
            title="Question précédente"
            aria-label="Question précédente"
            disabled={!onPrevious}
            onClick={onPrevious}
          >
            <ArrowLeft size={15} aria-hidden />
          </button>
          <button
            type="button"
            title="Question suivante"
            aria-label="Question suivante"
            disabled={!onNext}
            onClick={onNext}
          >
            <ArrowRight size={15} aria-hidden />
            <span>Suivante</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
