export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'compact' : ''}`}>
      <span className="brand-sticker" aria-hidden="true" />
      <span className="brand-symbol" aria-hidden="true">
        <span className="cloze-glyph">
          <i />
          <b />
          <i />
        </span>
      </span>
      <span className="brand-wordmark">
        <b>
          Bouche<span className="brand-gap">-trou</span>
        </b>
        <small>Apprendre en retrouvant</small>
      </span>
    </div>
  );
}
