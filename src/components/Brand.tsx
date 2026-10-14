import { FlaskConical } from 'lucide-react';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <span className="brand-symbol">
        <FlaskConical size={compact ? 21 : 27} />
      </span>
      <span>
        Le Laboratoire<small>DU SAVANT FOU</small>
      </span>
    </div>
  );
}
