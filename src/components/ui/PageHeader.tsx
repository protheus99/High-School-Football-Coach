import React from 'react';

/**
 * The top of every main section (Team, Rankings, Leaders, Feeders), the same everywhere: the section title,
 * a sub header for the current view, then the sub-navigation buttons, with an optional detail on the right.
 */
export function PageHeader<T extends string>({
  title,
  subtitle,
  tabs,
  active,
  onTab,
  aside
}: {
  title: string;
  subtitle?: React.ReactNode;
  tabs?: { id: T; label: string; short?: string }[]; // short: the label on phones
  active?: T;
  onTab?: (id: T) => void;
  aside?: React.ReactNode;
}) {
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '16px 16px 0' }}>
      <h1 className="ui-page-title">{title}</h1>
      {subtitle && (
        <p className="ui-muted" style={{ margin: '2px 0 0 0', fontSize: '14px' }}>
          {subtitle}
        </p>
      )}
      {tabs && tabs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
          <div className="ui-chips" role="tablist" aria-label={`${title} sections`} style={{ flex: '1 1 auto', minWidth: 0 }}>
            {tabs.map((t) => (
              <button key={t.id} role="tab" className="ui-chip" aria-selected={active === t.id} aria-pressed={active === t.id} onClick={() => onTab?.(t.id)}>
                {t.short ? (
                  <>
                    <span className="hide-sm">{t.label}</span>
                    <span className="show-sm">{t.short}</span>
                  </>
                ) : (
                  t.label
                )}
              </button>
            ))}
          </div>
          {aside && <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569', whiteSpace: 'nowrap' }}>{aside}</div>}
        </div>
      )}
    </div>
  );
}
