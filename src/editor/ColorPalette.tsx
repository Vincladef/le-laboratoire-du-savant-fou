import { useId, useRef, useState, useEffect } from 'react';
import { Type, Highlighter } from 'lucide-react';

const rows = [
  [
    '#000000',
    '#434343',
    '#666666',
    '#999999',
    '#b7b7b7',
    '#cccccc',
    '#d9d9d9',
    '#efefef',
    '#f3f3f3',
    '#ffffff',
  ],
  [
    '#980000',
    '#ff0000',
    '#ff9900',
    '#ffff00',
    '#00ff00',
    '#00ffff',
    '#4a86e8',
    '#0000ff',
    '#9900ff',
    '#ff00ff',
  ],
  [
    '#e6b8af',
    '#f4cccc',
    '#fce5cd',
    '#fff2cc',
    '#d9ead3',
    '#d0e0e3',
    '#c9daf8',
    '#cfe2f3',
    '#d9d2e9',
    '#ead1dc',
  ],
  [
    '#dd7e6b',
    '#ea9999',
    '#f9cb9c',
    '#ffe599',
    '#b6d7a8',
    '#a2c4c9',
    '#a4c2f4',
    '#9fc5e8',
    '#b4a7d6',
    '#d5a6bd',
  ],
  [
    '#cc4125',
    '#e06666',
    '#f6b26b',
    '#ffd966',
    '#93c47d',
    '#76a5af',
    '#6d9eeb',
    '#6fa8dc',
    '#8e7cc3',
    '#c27ba0',
  ],
  [
    '#a61c00',
    '#cc0000',
    '#e69138',
    '#f1c232',
    '#6aa84f',
    '#45818e',
    '#3c78d8',
    '#3d85c6',
    '#674ea7',
    '#a64d79',
  ],
  [
    '#85200c',
    '#990000',
    '#b45f06',
    '#bf9000',
    '#38761d',
    '#134f5c',
    '#1155cc',
    '#0b5394',
    '#351c75',
    '#741b47',
  ],
  [
    '#5b0f00',
    '#660000',
    '#783f04',
    '#7f6000',
    '#274e13',
    '#0c343d',
    '#1c4587',
    '#073763',
    '#20124d',
    '#4c1130',
  ],
];
const hues = [
  'Brique',
  'Rouge',
  'Orange',
  'Jaune',
  'Vert',
  'Turquoise',
  'Bleu roi',
  'Bleu',
  'Violet',
  'Rose',
];
export function ColorPalette({
  highlight = false,
  value,
  onChange,
  onReset,
}: {
  highlight?: boolean;
  value?: string;
  onChange: (color: string) => void;
  onReset: () => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const title = highlight ? 'Surlignage' : 'Couleur du texte';
  function place() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect || !panel.current) return;
    panel.current.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - 278))}px`;
    panel.current.style.top = `${Math.max(8, Math.min(rect.bottom + 6, innerHeight - 330))}px`;
  }
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);
  function choose(color: string) {
    onChange(color);
    panel.current?.hidePopover();
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="icon-button palette-trigger"
        aria-label={title}
        title={title}
        aria-expanded={open}
        popoverTarget={id}
        onMouseDown={(e) => e.preventDefault()}
        onClick={place}
      >
        {highlight ? <Highlighter size={18} /> : <Type size={18} />}
        <span style={{ background: value || (highlight ? '#ffe999' : '#202927') }} />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className="color-palette"
        role="group"
        aria-label={`Palette · ${title}`}
        onToggle={(e) => setOpen(e.currentTarget.matches(':popover-open'))}
      >
        <div className="palette-grid">
          {rows.flatMap((row, r) =>
            row.map((color, c) => {
              const name =
                r === 0
                  ? [
                      'Noir',
                      'Gris foncé',
                      'Gris',
                      'Gris moyen',
                      'Gris clair',
                      'Gris pâle',
                      'Gris très clair',
                      'Blanc cassé',
                      'Blanc doux',
                      'Blanc',
                    ][c]
                  : `${hues[c]} · nuance ${r}`;
              return (
                <button
                  key={color}
                  type="button"
                  className="palette-swatch"
                  style={{ background: color }}
                  aria-label={name}
                  title={name}
                  aria-pressed={value?.toLowerCase() === color}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(color)}
                />
              );
            }),
          )}
        </div>
        <button
          type="button"
          className="text-button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onReset();
            panel.current?.hidePopover();
          }}
        >
          {highlight ? 'Sans surlignage' : 'Couleur automatique'}
        </button>
        <label className="palette-custom">
          Personnalisée
          <input
            type="color"
            aria-label={`${title} personnalisée`}
            value={
              value && /^#[0-9a-f]{6}$/i.test(value) ? value : highlight ? '#ffe999' : '#202927'
            }
            onChange={(e) => choose(e.target.value)}
          />
        </label>
      </div>
    </>
  );
}
