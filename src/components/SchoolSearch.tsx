import React, { useMemo, useState } from 'react';
import { StateSchoolEntry, stateSchools } from '../sim/league';
import { SEARCH_MIN_LETTERS, highlightName, searchSchools } from '../sim/schoolSearch';

const SCHEMES: Record<string, string> = {
  SPREAD: 'Spread',
  POWER_I: 'Power I',
  AIR_RAID: 'Air Raid',
  TRIPLE_OPTION: 'Triple Option',
  THREE_THREE_FIVE: '3-3-5',
  FOUR_THREE: '4-3',
  FOUR_FOUR: '4-4',
  DROP_EIGHT: 'Drop 8'
};
const scheme = (id: string) => SCHEMES[id] ?? id.charAt(0) + id.slice(1).toLowerCase().replace(/_/g, ' ');
const prestigeBadge = (p: number): [string, string] => (p >= 90 ? ['#FEF3C7', '#92400E'] : p >= 75 ? ['#DBEAFE', '#1E40AF'] : ['#F1F5F9', '#334155']);

/**
 * New Game › Pick any program: search the state's schools by name. Nothing is listed until a couple of letters
 * are typed, and only schools whose name matches are shown, best prestige first.
 */
export const SchoolSearch: React.FC<{ state: string; selected: string | null; onSelect: (school: StateSchoolEntry) => void; disabled?: boolean }> = ({
  state,
  selected,
  onSelect,
  disabled
}) => {
  const [query, setQuery] = useState('');
  const schools = useMemo(() => stateSchools(state), [state]);
  const results = searchSchools(schools, query);
  const typed = query.trim().length >= SEARCH_MIN_LETTERS;
  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ position: 'relative', marginBottom: '8px' }}>
        <span aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '13px' }}>
          🔍
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a school name"
          aria-label={`Search ${state} schools`}
          autoComplete="off"
          style={searchBox}
        />
      </div>
      {!typed && <div style={hint}>Type at least {SEARCH_MIN_LETTERS} letters of a school&apos;s name to search.</div>}
      {typed && results.length === 0 && (
        <div style={hint}>
          No school matches &quot;<b style={{ color: '#F8FAFC' }}>{query.trim()}</b>&quot;. Check the spelling, or try part of the name.
        </div>
      )}
      {typed && results.length > 0 && (
        <>
          <div style={{ fontSize: '12px', color: '#94A3B8', margin: '0 2px 6px' }}>
            {results.length} matching school{results.length === 1 ? '' : 's'}
          </div>
          {results.map((s) => {
            const [bg, fg] = prestigeBadge(s.prestige);
            const isSelected = selected === s.name;
            return (
              <button key={s.name} aria-pressed={isSelected} disabled={disabled} onClick={() => onSelect(s)} style={{ ...result, ...(isSelected && { outline: '3px solid #F59E0B', outlineOffset: '1px' }) }}>
                <span aria-hidden="true" style={{ flex: '0 0 8px', alignSelf: 'stretch', borderRadius: '4px', background: s.primaryColor }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: '14.5px' }}>
                    {highlightName(s.name, query).map(([text, hit], i) =>
                      hit ? (
                        <mark key={i} style={{ background: '#FEF08A', color: 'inherit', borderRadius: '2px', padding: '0 1px' }}>
                          {text}
                        </mark>
                      ) : (
                        <React.Fragment key={i}>{text}</React.Fragment>
                      )
                    )}
                  </b>
                  <span style={{ display: 'block', fontSize: '12px', color: '#475569' }}>
                    {s.mascot}
                    {s.city ? ` · ${s.city}` : ''} · {s.district}
                  </span>
                  <span style={{ display: 'block', fontSize: '11.5px', color: '#64748B' }}>
                    {scheme(s.offenseScheme)} offense · {scheme(s.defenseScheme)} defense
                  </span>
                </span>
                <span title="Prestige" style={{ fontSize: '12px', fontWeight: 800, borderRadius: '6px', padding: '2px 7px', background: bg, color: fg, whiteSpace: 'nowrap' }}>
                  {s.prestige}
                </span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
};

const searchBox: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: '46px',
  borderRadius: '10px',
  border: '1px solid #475569',
  padding: '0 12px 0 36px',
  fontSize: '16px', // 16px+: iPhones don't zoom in on the field
  background: '#fff',
  color: '#0F172A'
};
const hint: React.CSSProperties = { border: '1px dashed #475569', borderRadius: '10px', padding: '14px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' };
const result: React.CSSProperties = {
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  width: '100%',
  textAlign: 'left',
  background: '#fff',
  color: '#0F172A',
  border: 'none',
  borderRadius: '10px',
  padding: '9px 10px',
  marginBottom: '6px',
  cursor: 'pointer',
  font: 'inherit'
};
