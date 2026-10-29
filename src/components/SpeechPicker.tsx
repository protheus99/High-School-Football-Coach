import React from 'react';
import { TalkOption } from '../sim/talkPicker';
import { FAMILY_COLORS } from '../sim/talks';

/**
 * A section of a locker-room sheet: a full-width line above it (none for the first), the heading, an optional key
 * on the right and a line under it.
 */
export const SheetSection: React.FC<{ title: string; first?: boolean; sub?: string; keyText?: string; children: React.ReactNode }> = ({
  title,
  first,
  sub,
  keyText,
  children
}) => (
  <section>
    <div style={first ? undefined : { borderTop: '1px solid #E2E8F0', margin: '16px -16px 0', padding: '12px 16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0F172A' }}>{title}</h3>
        {keyText && <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{keyText}</span>}
      </div>
      {sub && <div style={{ fontSize: '12px', color: '#475569', marginTop: '1px' }}>{sub}</div>}
    </div>
    {children}
  </section>
);

/** The key text over the speeches: the first one is the assistant's pick. */
export const RECOMMENDS = '★ Assistant Recommends';

/**
 * The speeches on offer, one box each: the line, what it gains (green) and costs (red). The family's color runs down
 * the left edge; the picked one gets a full border and a tint. Nothing is picked until the coach taps one.
 */
export const SpeechList: React.FC<{ options: TalkOption[]; selected: string | null; onSelect: (id: string) => void }> = ({ options, selected, onSelect }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
    {options.map(({ talk, line }, i) => {
      const { edge, tint } = FAMILY_COLORS[talk.family];
      const picked = selected === talk.id;
      const text = talk.lines[line];
      return (
        <button
          key={talk.id}
          onClick={() => onSelect(talk.id)}
          aria-pressed={picked}
          aria-label={`${/[.!?]$/.test(text) ? text : `${text}.`} ${[...talk.gains, ...talk.costs].join(', ')}${i === 0 ? '. Assistant recommends' : ''}`}
          style={{
            position: 'relative',
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: picked ? '7px 9px 8px 9px' : '8px 10px 9px 10px',
            borderRadius: '10px',
            borderTop: picked ? `2px solid ${edge}` : '1px solid #CBD5E1',
            borderRight: picked ? `2px solid ${edge}` : '1px solid #CBD5E1',
            borderBottom: picked ? `2px solid ${edge}` : '1px solid #CBD5E1',
            borderLeft: `5px solid ${edge}`,
            background: picked ? tint : '#fff',
            color: '#0F172A',
            cursor: 'pointer',
            font: 'inherit'
          }}
        >
          {i === 0 && <span style={{ position: 'absolute', top: '4px', right: '8px', fontSize: '12px', fontWeight: 700, color: '#1E40AF' }}>★</span>}
          <div style={{ fontWeight: 800, fontSize: '14px', fontStyle: 'italic', lineHeight: 1.25, paddingRight: '14px' }}>&ldquo;{text}&rdquo;</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
            {talk.gains.map((g) => (
              <span key={g} style={chip('#DCFCE7', '#166534')}>
                {g}
              </span>
            ))}
            {talk.costs.map((c) => (
              <span key={c} style={chip('#FEE2E2', '#991B1B')}>
                {c}
              </span>
            ))}
            {talk.risky && <span style={chip('#FEF3C7', '#92400E')}>⚡ High risk</span>}
          </div>
        </button>
      );
    })}
  </div>
);

const chip = (background: string, color: string): React.CSSProperties => ({ background, color, borderRadius: '999px', padding: '1px 7px', fontSize: '11px', fontWeight: 800 });

/** The small grey line under a section. */
export const SectionNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: '12px', color: '#475569', marginTop: '6px', lineHeight: 1.35 }}>{children}</div>
);
