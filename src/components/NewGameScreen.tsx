import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ClassEntry, loadProgramIndex, ProgramIndex } from '../sim/programIndex';
import { dealPrograms, groupInfo, GroupInfo, jobNote, Program, programName, QUICK_GROUPS, QuickGroup, SEARCH_MIN_LETTERS, searchPrograms, startingPrestige } from '../sim/quickPick';
import { CAREER_LENGTHS, CareerTerm, UNLIMITED } from '../sim/careerScore';
import { lookupAvailable, lookupSchoolFacts, SchoolFacts } from '../services/schoolLookup';
import { badgeColors, heroBackground, schoolInitials, teamEdge } from '../utils/teamColors';
import { stateAbbreviation } from '../utils/format';
import { NewGameStart, PickPath } from '../sim/newGameStart';

// ---------------------------------------------------------------------------
// New Game: pick a program, then the coach. Two ways in: ⚡ Quick Pick (a state if you like, then one of four jobs, and
// three schools are dealt at random) and 🗺️ Manually Pick Any Program (state › class › school). A search over every
// school in the country sits on top, and the ⭐ legends (the hand-written programs) run along the bottom. Each screen
// does one job so phones barely scroll. Styles: src/styles/newGame.css.
// ---------------------------------------------------------------------------

type ScreenId = 'home' | 'quick' | 'deal' | 'state' | 'list' | 'search' | 'coach';
interface Scope {
  state: string | null;
  cls: string | null;
}
type SheetState = { kind: 'state'; purpose: 'scope' | 'browse' } | { kind: 'class' } | { kind: 'confirm'; program: Program; path: PickPath } | null;
type Lookup = { key: string; status: 'running' | 'found' | 'missing'; facts: SchoolFacts | null } | null;
interface ListState {
  tier: 'all' | QuickGroup;
  district: string;
  sort: 'p' | 'az';
  shown: number;
  q: string;
}

const PAGE = 8; // rows per page in lists and search results
const freshList = (): ListState => ({ tier: 'all', district: 'all', sort: 'p', shown: PAGE, q: '' });
const fmt = (n: number) => n.toLocaleString('en-US');
const needsLookup = (p: Program) => !p.colors || !p.mascot;
const missingWhat = (p: Program) => (!p.mascot && !p.colors ? 'mascot and colors' : !p.mascot ? 'mascot' : 'colors');
const shortOf = (p: Program) => programName(p);
/** Prestige colors: the band a rating sits in. */
const tierOf = (p: number): GroupInfo => groupInfo(p >= 98 ? 'POWER' : p >= 75 ? 'CONTEND' : 'REBUILD');

export const NewGameScreen: React.FC<{
  onBack: () => void;
  onStart: (start: NewGameStart) => void;
  busy: boolean;
  error?: string | null; // the start failed (shown over the screen)
  link?: { state: string; school: string } | null; // a team page link: that school picked, straight to Coach Information
}> = ({ onBack, onStart, busy, error, link }) => {
  const [index, setIndex] = useState<ProgramIndex | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setLoadError(false);
    loadProgramIndex()
      .then((i) => live && setIndex(i))
      .catch(() => live && setLoadError(true));
    return () => {
      live = false;
    };
  }, [attempt]);

  const [stack, setStack] = useState<ScreenId[]>(['home']);
  const screen = stack[stack.length - 1];
  const [scope, setScope] = useState<Scope>({ state: null, cls: null });
  const [type, setType] = useState<QuickGroup>('POWER');
  const [hand, setHand] = useState<Program[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [poolSize, setPoolSize] = useState(0);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [list, setList] = useState<ListState>(freshList);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [stateFilter, setStateFilter] = useState('');
  const [picked, setPicked] = useState<{ program: Program; path: PickPath } | null>(null);
  const [length, setLength] = useState<CareerTerm>(5);
  const [coach, setCoach] = useState('');
  const [nameMissing, setNameMissing] = useState(false);
  const [lookup, setLookup] = useState<Lookup>(null);
  const [startWhenReady, setStartWhenReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  const go = (s: ScreenId) => setStack((st) => [...st, s]);
  const back = () => {
    if (stack.length <= 1) return onBack();
    const next = stack.slice(0, -1);
    setStack(next);
    setToast(null);
    // The first screen is always the whole country: a state is its own page
    if (next[next.length - 1] === 'home') {
      setScope({ state: null, cls: null });
      setQuery('');
    }
  };

  // ---------- What's in scope ----------
  const stateEntry = (st: string) => index?.states.find((s) => s.state === st);
  const scopeClasses = (sc: Scope = scope): ClassEntry[] =>
    (sc.state ? (stateEntry(sc.state)?.classes ?? []) : (index?.states.flatMap((s) => s.classes) ?? [])).filter((c) => !sc.cls || c.name === sc.cls);
  const scopeTotal = (sc: Scope = scope) => scopeClasses(sc).reduce((n, c) => n + c.total, 0);
  const typeCount = (g: QuickGroup, sc: Scope = scope) => scopeClasses(sc).reduce((n, c) => n + c.groups[g], 0);
  const inScope = (p: Program, sc: Scope = scope) => (!sc.state || p.state === sc.state) && (!sc.cls || p.className === sc.cls);
  const scopeName = (sc: Scope = scope) => (sc.state ? (sc.cls ? `${sc.state} · ${sc.cls}` : sc.state) : 'all states');

  const deal = (g: QuickGroup, sc: Scope, from: Set<string>) => {
    if (!index) return;
    const pool = index.programs.filter((p) => p.group === g && inScope(p, sc));
    const dealt = dealPrograms(pool, from);
    setHand(dealt.hand);
    setSeen(dealt.seen);
    setPoolSize(pool.length);
  };
  /** A new state or class: the current screen follows it. */
  const changeScope = (next: Scope) => {
    setScope(next);
    setSheet(null);
    if (screen === 'deal') deal(type, next, new Set());
    if (screen === 'list') {
      setList((l) => ({ ...l, shown: PAGE, district: 'all' }));
      if (!next.state) back();
    }
    if (screen === 'search') setShown(PAGE);
  };

  const results = useMemo(() => (index && query.trim().length >= SEARCH_MIN_LETTERS ? searchPrograms(index.programs.filter((p) => inScope(p)), query) : null), [index, query, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const listRows = useMemo(() => {
    if (!index || screen !== 'list') return [];
    const q = list.q.trim().toLowerCase();
    return index.programs
      .filter((p) => inScope(p) && (list.tier === 'all' || p.group === list.tier) && (list.district === 'all' || p.district === list.district))
      .filter((p) => !q || `${p.name} ${p.city ?? ''} ${p.mascot ?? ''}`.toLowerCase().includes(q))
      .sort(list.sort === 'p' ? (a, b) => b.prestige - a.prestige || a.name.localeCompare(b.name) : (a, b) => a.name.localeCompare(b.name));
  }, [index, screen, scope, list]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Picking ----------
  const openConfirm = (program: Program, path: PickPath) => setSheet({ kind: 'confirm', program, path });
  const startLookup = (p: Program) => {
    setStartWhenReady(false);
    if (!lookupAvailable || !needsLookup(p)) return setLookup(null);
    setLookup({ key: p.key, status: 'running', facts: null });
    void lookupSchoolFacts(p).then((facts) => setLookup((cur) => (cur && cur.key === p.key ? { key: p.key, status: facts ? 'found' : 'missing', facts } : cur)));
  };
  const choose = (program: Program, path: PickPath) => {
    setPicked({ program, path });
    setSheet(null);
    go('coach');
    startLookup(program);
  };
  const start = () => {
    if (!picked || busy) return;
    if (!coach.trim()) {
      setNameMissing(true);
      document.getElementById('ng-coach-name')?.focus();
      return;
    }
    if (lookup?.status === 'running') {
      setStartWhenReady(true);
      setToast(`⏳ Still looking up ${shortOf(picked.program)}'s ${missingWhat(picked.program)}. The game starts as soon as they arrive.`);
      return;
    }
    onStart({ program: picked.program, coachName: coach, length, facts: lookup?.facts ?? null, path: picked.path });
  };
  // Start was tapped during the lookup: go as soon as it's done
  useEffect(() => {
    if (startWhenReady && lookup?.status !== 'running') {
      setStartWhenReady(false);
      start();
    }
  }, [startWhenReady, lookup]); // eslint-disable-line react-hooks/exhaustive-deps

  // A team page link: its school, straight to Coach Information with ten seasons picked
  const linked = useRef(false);
  useEffect(() => {
    if (!index || !link || linked.current) return;
    linked.current = true;
    const p = index.programs.find((x) => x.state === link.state && x.name === link.school && !x.id) ?? index.programs.find((x) => x.state === link.state && x.name === link.school);
    if (!p) return;
    setPicked({ program: p, path: 'link' });
    setStack(['home', 'coach']);
    setLength(10);
    startLookup(p);
    setTimeout(() => document.getElementById('ng-coach-name')?.focus(), 250);
  }, [index, link]);

  // ---------- Pieces ----------
  const topbar = (title: React.ReactNode, sub: React.ReactNode, step: 1 | 2 = 1) => (
    <div className="ng-topbar">
      <button className="ng-back" onClick={back} aria-label="Back">
        ‹
      </button>
      <div className="ng-tb-text">
        <div className="ng-tb-title">{title}</div>
        <div className="ng-tb-sub">{sub}</div>
      </div>
      <div className="ng-steps" aria-label={`Step ${step} of 2`}>
        <i className="ng-on" />
        <i className={step === 2 ? 'ng-on' : ''} />
      </div>
    </div>
  );
  const scopeChips = () => (
    <div className="ng-scope">
      <button className={`ng-scope-chip ${scope.state ? 'ng-set' : ''}`} onClick={() => (setStateFilter(''), setSheet({ kind: 'state', purpose: 'scope' }))}>
        📍 <b>{scope.state ?? 'Any state'}</b> <span className="ng-car">▾</span>
      </button>
      <button className={`ng-scope-chip ${scope.cls ? 'ng-set' : ''}`} onClick={() => setSheet({ kind: 'class' })} disabled={!scope.state} title={scope.state ? undefined : 'Pick a state first'}>
        🏷️ <b>{scope.cls ?? 'Any class'}</b> <span className="ng-car">▾</span>
      </button>
      {scope.state && (
        <button className="ng-scope-chip" onClick={() => changeScope({ state: null, cls: null })} aria-label="Clear: any state" style={{ padding: '6px 10px' }}>
          ✕
        </button>
      )}
    </div>
  );
  const searchBox = (value: string, onChange: (v: string) => void, placeholder: string, onClear?: () => void, autoFocus = false, id?: string) => (
    <label className="ng-search">
      <span className="ng-ic" aria-hidden="true">
        🔍
      </span>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoComplete="off" autoFocus={autoFocus} />
      {onClear && value && (
        <button className="ng-clear" onClick={onClear} aria-label="Clear">
          ✕
        </button>
      )}
    </label>
  );
  const row = (p: Program, q = '', path: PickPath = 'manual') => (
    <button key={p.key} className="ng-row" onClick={() => openConfirm(p, path)}>
      <Badge p={p} />
      <span className="ng-mid">
        <span className="ng-nm">
          <Highlight text={p.name} q={q} />
          {p.legend && <span className="ng-lgtag">⭐ Legend</span>}
        </span>
        <span className="ng-sb">
          {!scope.cls && (
            <span className="ng-where">
              {stateAbbreviation(p.state)} · {p.className}
            </span>
          )}
          {q ? <Highlight text={[p.mascot, p.city].filter(Boolean).join(' · ')} q={q} /> : [p.mascot, p.city].filter(Boolean).join(' · ')}
          {scope.cls && p.district ? ` · ${p.district}` : ''}
        </span>
      </span>
      <Pill p={p.prestige} />
    </button>
  );

  // ---------- Screens ----------
  const home = () => {
    const legends = index?.programs.filter((p) => p.legend) ?? [];
    return (
      <>
        {topbar('New Game', 'Pick your program')}
        <div className="ng-body" key="home">
          {searchBox(query, (v) => (setQuery(v), setShown(PAGE), v.trim() && go('search')), `Search all ${index ? fmt(index.programs.length) : ''} schools, towns, mascots`)}
          <div className="ng-ways">
            <button className="ng-way ng-quick" onClick={() => (setScope({ state: null, cls: null }), go('quick'))}>
              <span className="ng-wi" aria-hidden="true">
                ⚡
              </span>
              <span>
                <b>Quick Pick</b>
                <span className="ng-wk">Random selection by state</span>
                <small>Choose a state (or skip it) and the kind of job. We deal you 3 schools at random.</small>
              </span>
              <span className="ng-chev" aria-hidden="true">
                ›
              </span>
            </button>
            <button className="ng-way ng-manual" onClick={() => (setStateFilter(''), setSheet({ kind: 'state', purpose: 'browse' }))}>
              <span className="ng-wi" aria-hidden="true">
                🗺️
              </span>
              <span>
                <b>Manually Pick Any Program</b>
                <span className="ng-wk">50 states + DC</span>
                <small>
                  State, then class, then school: the full listing{index ? ` of ${fmt(index.programs.length)} schools in ${index.states.reduce((n, s) => n + s.classes.length, 0)} classes` : ''}.
                </small>
              </span>
              <span className="ng-chev" aria-hidden="true">
                ›
              </span>
            </button>
          </div>
          {legends.length > 0 && (
            <>
              <div className="ng-sec">
                <h3>⭐ Legendary programs</h3>
                <span>
                  {legends.length} in {new Set(legends.map((p) => p.state)).size} states
                </span>
              </div>
              <div className="ng-strip">
                {legends.map((p) => {
                  const g = groupInfo(p.group);
                  return (
                    <button key={p.key} className="ng-leg" style={{ '--team': teamEdge(p.colors) } as React.CSSProperties} onClick={() => openConfirm(p, 'legend')}>
                      <span className="ng-lt">
                        <Badge p={p} size="sm" />
                        <span style={{ minWidth: 0 }}>
                          <b>{programName(p)}</b>
                          <span className="ng-ls">
                            {stateAbbreviation(p.state)} · {p.className} ·{' '}
                            <span style={{ color: g.fg, fontWeight: 800 }}>
                              {g.icon} {g.short}
                            </span>
                          </span>
                        </span>
                      </span>
                      <p>{p.legend?.legacy}</p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {!index && <Loading error={loadError} onRetry={() => setAttempt((a) => a + 1)} />}
        </div>
      </>
    );
  };

  const quickScreen = () => (
    <>
      {topbar('⚡ Quick Pick', 'Random selection by state')}
      <div className="ng-body" key="quick">
        <div className="ng-sec" style={{ marginTop: '2px' }}>
          <h3>1 · Pick a state</h3>
          <span>{scope.state ? 'schools from here only' : 'optional: skip it for any state'}</span>
        </div>
        {scopeChips()}
        <div className="ng-sec">
          <h3>2 · Pick the job</h3>
        </div>
        <div className="ng-jobs">
          {QUICK_GROUPS.map((g) => (
            <button
              key={g.id}
              className="ng-job"
              style={{ '--c': g.color, '--bg': g.bg, '--fg': g.fg } as React.CSSProperties}
              onClick={() => (setType(g.id), go('deal'), deal(g.id, scope, new Set()))}
              disabled={!index}
            >
              <span className="ng-jt">
                <span className="ng-ic" aria-hidden="true">
                  {g.icon}
                </span>
                <span className="ng-jn">
                  <b>{g.name}</b>
                  <span className="ng-jc">{index ? `${fmt(typeCount(g.id))} in ${scopeName()}` : 'Loading…'}</span>
                </span>
                <span className="ng-start">{g.range}</span>
                <span className="ng-go" aria-hidden="true">
                  ›
                </span>
              </span>
              <p>{g.about}</p>
              <div className="ng-exp">
                🎯 <b>Expect:</b> {g.expect}
              </div>
            </button>
          ))}
        </div>
        {!index && <Loading error={loadError} onRetry={() => setAttempt((a) => a + 1)} />}
      </div>
    </>
  );

  const dealScreen = () => {
    const g = groupInfo(type);
    const count = typeCount(type);
    return (
      <>
        {topbar(`${g.icon} ${g.name}`, `Quick pick · ${scopeName()}`)}
        <div className="ng-body" key="deal">
          <div className="ng-switcher" role="group" aria-label="Job">
            {QUICK_GROUPS.map((x) => (
              <button key={x.id} className="ng-sw" style={{ '--c': x.color } as React.CSSProperties} aria-pressed={x.id === type} onClick={() => (setType(x.id), deal(x.id, scope, new Set()))}>
                <span aria-hidden="true">{x.icon}</span>
                {x.short}
              </button>
            ))}
          </div>
          <div className="ng-band" style={{ '--bandA': `${g.color}55`, '--bandB': `${g.color}99` } as React.CSSProperties}>
            <div className="ng-bt">
              <span className="ng-ic" aria-hidden="true">
                {g.icon}
              </span>
              <div>
                <b>{g.name}</b>
                <div className="ng-bl">{g.blurb}</div>
              </div>
            </div>
            {scopeChips()}
            <div className="ng-bc">
              <b>{fmt(count)}</b> {count === 1 ? g.one : g.many} in {scopeName()} ·{' '}
              <span className="ng-start" style={{ '--bg': g.bg, '--fg': g.fg } as React.CSSProperties}>
                {g.range}
              </span>
            </div>
          </div>
          {hand.length > 0 ? (
            <>
              <div className="ng-cards">
                {hand.map((p) => {
                  const st = startingPrestige(p);
                  return (
                    <button key={p.key} className="ng-card" style={{ '--team': teamEdge(p.colors) } as React.CSSProperties} onClick={() => openConfirm(p, 'quick')}>
                      <Badge p={p} />
                      <span className="ng-mid">
                        <div className="ng-nm">
                          {programName(p)}
                          {p.legend && <span className="ng-lgtag">⭐ Legend</span>}
                        </div>
                        {(p.mascot || p.city) && <div className="ng-sb">{[p.mascot, p.city].filter(Boolean).join(' · ')}</div>}
                        <div className="ng-wh">📍 {[p.state, p.className, p.district].filter(Boolean).join(' · ')}</div>
                        {p.legend && <p>{p.legend.legacy}</p>}
                      </span>
                      <span className="ng-pp">
                        {st !== p.prestige && <span className="ng-was">{p.prestige}</span>}
                        <span className="ng-big" style={{ color: g.fg }}>
                          {st}
                        </span>
                        <span className="ng-lab">prestige</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {poolSize > hand.length ? (
                <div className="ng-actions">
                  <button className="ng-btn ng-amber" style={{ gridColumn: '1/-1' }} onClick={() => deal(type, scope, seen)}>
                    🎲 Random Select 3 Others
                  </button>
                </div>
              ) : (
                <div className="ng-hint" style={{ marginTop: '10px' }}>
                  That&apos;s every {g.one} in {scopeName()}.
                  {scope.state && (
                    <div className="ng-ex">
                      <button className="ng-chip" onClick={() => changeScope({ state: null, cls: null })}>
                        🌎 Any state
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="ng-empty" style={{ borderTopColor: g.color }}>
              <div className="ng-ei">{g.icon}</div>
              <h4>
                No {g.many} in {scopeName()}
              </h4>
              <p>No school here fits this job. Widen the search to find one.</p>
              <div className="ng-ebtns">
                {scope.cls && (
                  <button className="ng-btn ng-amber" onClick={() => changeScope({ state: scope.state, cls: null })}>
                    All of {scope.state}
                  </button>
                )}
                <button className="ng-btn ng-slate" onClick={() => changeScope({ state: null, cls: null })}>
                  🌎 Any state
                </button>
              </div>
            </div>
          )}
        </div>
      </>
    );
  };

  const stateScreen = () => {
    const st = scope.state!;
    const entry = stateEntry(st);
    const classes = entry?.classes ?? [];
    const legends = index?.programs.filter((p) => p.state === st && p.legend).length ?? 0;
    return (
      <>
        {topbar(st, `${fmt(entry?.total ?? 0)} schools · ${classes.length} classes`)}
        <div className="ng-body" key="state">
          <div className="ng-hero">
            <span className="ng-ab">{stateAbbreviation(st)}</span>
            <div>
              <b>{st}</b>
              <span className="ng-hl">
                👑 {typeCount('POWER', { state: st, cls: null })} {typeCount('POWER', { state: st, cls: null }) === 1 ? 'powerhouse' : 'powerhouses'} · ⭐ {legends || 'no'} legends
              </span>
              <span className="ng-hl">Bars: 👑 · 📈 · 🔥 · 🔨 jobs in each class</span>
            </div>
          </div>
          <div className="ng-sec">
            <h3>🏷️ Select a Classification Level</h3>
          </div>
          <div className="ng-clsgrid">
            {classes.map((c) => (
              <button key={c.name} className="ng-cls" onClick={() => (setScope({ state: st, cls: c.name }), setList(freshList()), go('list'))}>
                <b>{c.name}</b>
                <span>{c.total} schools</span>
                <TierBar c={c} />
              </button>
            ))}
          </div>
          <button className="ng-linkbtn" onClick={() => (setQuery(''), setShown(PAGE), go('search'))}>
            🔍 Search {st} schools by name
          </button>
          <button className="ng-linkbtn" onClick={() => (setScope({ state: st, cls: null }), go('quick'))}>
            ⚡ Quick Pick in {st} instead
          </button>
        </div>
      </>
    );
  };

  const listScreen = () => {
    const classes = scopeClasses();
    const c = scope.cls ? classes[0] : undefined;
    const total = scopeTotal();
    const tierCount = (g: QuickGroup) => typeCount(g);
    const tiers: ['all' | QuickGroup, string, number][] = [['all', 'All', total], ...QUICK_GROUPS.map((g): [QuickGroup, string, number] => [g.id, `${g.icon} ${g.short}`, tierCount(g.id)])];
    return (
      <>
        {topbar(scopeName(), `${fmt(total)} schools${c && c.districts.length > 1 ? ` · ${c.districts.length} districts` : c && c.districts.length === 0 ? ' · no districts' : ''}`)}
        <div className="ng-body" key="list">
          <div className="ng-tools">
            {searchBox(list.q, (v) => setList((l) => ({ ...l, q: v, shown: PAGE })), `Filter ${scope.cls ?? scope.state ?? 'schools'} by name`, () => setList((l) => ({ ...l, q: '' })))}
            <button className="ng-sortbtn" onClick={() => setList((l) => ({ ...l, sort: l.sort === 'p' ? 'az' : 'p' }))}>
              {list.sort === 'p' ? '⬇ Prestige' : '🔤 A–Z'}
            </button>
          </div>
          <div className="ng-chiprow" role="group" aria-label="Job">
            {tiers.map(([k, label, n]) => (
              <button key={k} className="ng-chip" aria-pressed={list.tier === k} onClick={() => setList((l) => ({ ...l, tier: k, shown: PAGE }))}>
                {label}
                <small>{fmt(n)}</small>
              </button>
            ))}
          </div>
          {c && c.districts.length > 1 && (
            <div className="ng-chiprow" role="group" aria-label="District" style={{ marginTop: '4px' }}>
              {['all', ...c.districts].map((d) => (
                <button key={d} className="ng-chip" aria-pressed={list.district === d} onClick={() => setList((l) => ({ ...l, district: d, shown: PAGE }))}>
                  {d === 'all' ? 'All districts' : d}
                </button>
              ))}
            </div>
          )}
          <div className="ng-meta">
            <span>
              Showing <b>{Math.min(list.shown, listRows.length)}</b> of {fmt(listRows.length)}
            </span>
            <span>Tap a school to see it</span>
          </div>
          {listRows.length ? (
            <div className="ng-rows">{listRows.slice(0, list.shown).map((p) => row(p))}</div>
          ) : (
            <div className="ng-hint">
              No school fits these filters.
              <div className="ng-ex">
                <button className="ng-chip" onClick={() => setList(freshList())}>
                  Clear filters
                </button>
              </div>
            </div>
          )}
          {listRows.length > list.shown && (
            <button className="ng-more" onClick={() => setList((l) => ({ ...l, shown: l.shown + PAGE }))}>
              Show {PAGE} more · {listRows.length - list.shown} left
            </button>
          )}
        </div>
      </>
    );
  };

  const searchScreen = () => {
    const q = query.trim();
    return (
      <>
        {topbar('Search', `Every school · ${scopeName()}`)}
        <div className="ng-body" key="search">
          {searchBox(query, (v) => (setQuery(v), setShown(PAGE)), 'School, town or mascot', () => setQuery(''), true)}
          {scopeChips()}
          {!index ? (
            <Loading error={loadError} onRetry={() => setAttempt((a) => a + 1)} />
          ) : !results ? (
            <div className="ng-hint">
              Type at least {SEARCH_MIN_LETTERS} letters of a school, town or mascot.
              <div className="ng-ex">
                {['Pirates', 'Canton', 'Westlake'].map((x) => (
                  <button key={x} className="ng-chip" onClick={() => (setQuery(x), setShown(PAGE))}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
          ) : results.length === 0 ? (
            <div className="ng-empty">
              <div className="ng-ei">🤷</div>
              <h4>No school matches “{q}”</h4>
              <p>
                {scope.state && (
                  <>
                    You&apos;re searching <b>{scopeName()}</b> only.{' '}
                  </>
                )}
                Try the town name or the mascot.
                <br />
                Not every school is in the game yet.
              </p>
              <div className="ng-ebtns">
                {scope.state && (
                  <button className="ng-btn ng-amber" onClick={() => changeScope({ state: null, cls: null })}>
                    🌎 Search everywhere
                  </button>
                )}
                <button className="ng-btn ng-light" onClick={() => setQuery('')}>
                  Clear search
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="ng-meta">
                <span>
                  <b>{fmt(results.length)}</b> match{results.length === 1 ? '' : 'es'} · {scopeName()}
                </span>
                <span>best name match first</span>
              </div>
              <div className="ng-rows">{results.slice(0, shown).map((p) => row(p, q, 'search'))}</div>
              {results.length > shown && (
                <button className="ng-more" onClick={() => setShown((n) => n + PAGE)}>
                  Show {PAGE} more · {results.length - shown} left
                </button>
              )}
            </>
          )}
        </div>
      </>
    );
  };

  const coachScreen = () => {
    if (!picked) return null;
    const p = picked.program;
    const g = groupInfo(p.group);
    const running = lookup?.status === 'running';
    return (
      <>
        {topbar('Coach Information', 'Step 2 of 2 · last step', 2)}
        <div className="ng-body" key="coach">
          <div className="ng-picked" style={{ '--team': teamEdge(p.colors) } as React.CSSProperties}>
            <Badge p={p} />
            <span className="ng-mid">
              <b>{programName(p)}</b>
              <small>{[p.state, p.className, p.district].filter(Boolean).join(' · ')}</small>
              <small>
                <span className="ng-start" style={{ '--bg': g.bg, '--fg': '#0F172A' } as React.CSSProperties}>
                  {g.icon} {g.name} · starts at {startingPrestige(p)}
                </span>
              </small>
            </span>
            <button className="ng-change" onClick={back}>
              Change
            </button>
          </div>
          <div className="ng-field">
            Game length
            <div className="ng-lenrow" role="group" aria-label="Game length">
              {[...CAREER_LENGTHS, UNLIMITED].map((y) => (
                <button key={y} className="ng-chip" aria-pressed={length === y} onClick={() => setLength(y)}>
                  {y === UNLIMITED ? 'Unlimited' : `${y} years`}
                </button>
              ))}
            </div>
            {length === UNLIMITED && <div style={{ marginTop: '4px', fontSize: '12px', color: '#94A3B8' }}>No end and no Hall of Fame: coach as long as you like.</div>}
          </div>
          {lookup && lookup.key === p.key && <LookupPanel p={p} status={lookup.status} />}
          <label className="ng-field">
            Coach name <span style={{ color: '#FCA5A5' }}>*</span>
            <input
              id="ng-coach-name"
              value={coach}
              onChange={(e) => {
                setCoach(e.target.value.slice(0, 24));
                if (e.target.value.trim()) setNameMissing(false);
              }}
              placeholder="Your name (required)"
              required
              aria-invalid={nameMissing}
              aria-describedby={nameMissing ? 'ng-coach-name-error' : undefined}
              style={nameMissing ? { border: '2px solid #F87171' } : undefined}
            />
          </label>
          {nameMissing && (
            <div id="ng-coach-name-error" role="alert" style={{ color: '#FCA5A5', fontSize: '13px', marginTop: '6px' }}>
              Enter your coach name to start.
            </div>
          )}
          <button className={`ng-btn ${running || busy ? 'ng-wait' : 'ng-green'} ng-startbtn`} onClick={start} disabled={busy}>
            {busy ? 'Building the league…' : running && startWhenReady ? `⏳ Getting ${shortOf(p)} ready…` : `🏈 Start at ${programName(p)}`}
          </button>
        </div>
      </>
    );
  };

  // ---------- Sheets ----------
  const stateSheet = (purpose: 'scope' | 'browse') => {
    const f = stateFilter.trim().toLowerCase();
    const states = (index?.states ?? []).filter((s) => !f || s.state.toLowerCase().includes(f) || stateAbbreviation(s.state).toLowerCase() === f);
    const pick = (st: string) => {
      if (purpose === 'browse') {
        setSheet(null);
        setScope({ state: st, cls: null });
        go('state');
      } else changeScope({ state: st, cls: null });
    };
    return (
      <div className="ng-sheet" role="dialog" aria-label="Select a State" onClick={(e) => e.stopPropagation()}>
        <div className="ng-sh-head">
          <div>
            <h3>📍 Select a State</h3>
            <div className="ng-sub">Tap a state, or type its name</div>
          </div>
          <button className="ng-sh-close" onClick={() => setSheet(null)} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="ng-sh-body">
          {searchBox(stateFilter, setStateFilter, 'Type a state, e.g. Ohio')}
          {purpose === 'scope' ? (
            <button className="ng-anyw" aria-pressed={!scope.state} onClick={() => changeScope({ state: null, cls: null })}>
              🌎 Any state<small>{index ? fmt(index.programs.length) : ''} schools</small>
            </button>
          ) : (
            <div style={{ height: '10px' }} />
          )}
          {!index ? (
            <Loading error={loadError} onRetry={() => setAttempt((a) => a + 1)} />
          ) : f && states.length <= 6 ? (
            <div className="ng-stfound">
              {states.length ? (
                states.map((s) => (
                  <button key={s.state} className="ng-anyw" onClick={() => pick(s.state)}>
                    <b>{stateAbbreviation(s.state)}</b> {s.state}
                    <small>{fmt(s.total)} schools</small>
                  </button>
                ))
              ) : (
                <div className="ng-hint" style={{ color: '#64748B' }}>
                  No state matches.
                </div>
              )}
            </div>
          ) : (
            <div className="ng-stgrid">
              {states.map((s) => (
                <button key={s.state} className={`ng-st ${s.total >= 700 ? 'ng-big' : ''}`} aria-pressed={scope.state === s.state} title={s.state} aria-label={s.state} onClick={() => pick(s.state)}>
                  <b>{stateAbbreviation(s.state)}</b>
                  <small>{fmt(s.total)}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const classSheet = () => {
    const st = scope.state!;
    const entry = stateEntry(st);
    return (
      <div className="ng-sheet" role="dialog" aria-label="Choose a class" onClick={(e) => e.stopPropagation()}>
        <div className="ng-sh-head">
          <div>
            <h3>🏷️ {st} classes</h3>
            <div className="ng-sub">
              {entry?.classes.length ?? 0} classes · {fmt(entry?.total ?? 0)} schools
            </div>
          </div>
          <button className="ng-sh-close" onClick={() => setSheet(null)} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="ng-sh-body">
          <button className="ng-anyw" aria-pressed={!scope.cls} onClick={() => changeScope({ state: st, cls: null })}>
            All of {st}
            <small>{fmt(entry?.total ?? 0)} schools</small>
          </button>
          <div className="ng-clssheet">
            {entry?.classes.map((c) => (
              <button key={c.name} className="ng-cls" aria-pressed={scope.cls === c.name} onClick={() => changeScope({ state: st, cls: c.name })}>
                <b>{c.name}</b>
                <span>{c.total} schools</span>
                <TierBar c={c} />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const confirmSheet = (p: Program, path: PickPath) => {
    const g = groupInfo(p.group);
    const tierWord = p.prestige >= 98 ? 'the best in the state' : p.prestige >= 88 ? "one of the state's best" : p.prestige >= 75 ? 'a solid program' : 'a program that needs work';
    return (
      <div className="ng-sheet" role="dialog" aria-label={programName(p)} onClick={(e) => e.stopPropagation()}>
        <div className="ng-chero" style={{ background: heroBackground(p.colors) }}>
          <Badge p={p} size="lg" />
          <div style={{ minWidth: 0, paddingRight: '30px' }}>
            <div className="ng-cname">{programName(p)}</div>
            {(p.mascot || p.city) && <div className="ng-csub">{[p.mascot, p.city].filter(Boolean).join(' · ')}</div>}
            {p.legend && (
              <div className="ng-nocolor" style={{ borderStyle: 'solid' }}>
                ⭐ Legendary program
              </div>
            )}
            {needsLookup(p) && <div className="ng-nocolor">🔎 {missingWhat(p).replace(/^./, (c) => c.toUpperCase())} not on file yet</div>}
          </div>
          <button className="ng-sh-close" onClick={() => setSheet(null)} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="ng-sh-body">
          <ul className="ng-facts">
            <li>
              <span className="ng-fi">📍</span>
              <span>
                {p.state} · {p.className}
                <small>{p.district || 'No district on file'}</small>
              </span>
            </li>
            <li>
              <span className="ng-fi">⭐</span>
              <span style={{ flex: 1 }}>
                Prestige <b>{p.prestige}</b> <small style={{ display: 'inline' }}>· {tierWord}</small>
                <span className="ng-meter">
                  <i style={{ width: `${p.prestige}%`, background: g.color }} />
                </span>
              </span>
            </li>
            <li>
              <span className="ng-fi">🏫</span>
              <span>
                School size: level {p.level} of 5<small>{p.level === 1 ? "the state's top class" : p.level === 2 ? 'big schools' : p.level === 5 ? 'the smallest schools' : 'mid-size schools'}</small>
              </span>
            </li>
            {needsLookup(p) && lookupAvailable && (
              <li>
                <span className="ng-fi">🔎</span>
                <span style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.4 }}>We will look up the team&apos;s {missingWhat(p)} if you pick them.</span>
              </li>
            )}
            {p.legend && (
              <li>
                <span className="ng-fi">📜</span>
                <span style={{ fontSize: '12.5px', color: '#334155', lineHeight: 1.4 }}>{p.legend.legacy}</span>
              </li>
            )}
          </ul>
          <div className="ng-modes-h">Your job</div>
          <div className="ng-mode-note" style={{ '--c': g.color } as React.CSSProperties}>
            {g.icon} <b>{g.name}</b> · starts at {startingPrestige(p)}
            <br />
            {jobNote(p)}
          </div>
        </div>
        <div className="ng-sh-foot">
          <button className="ng-btn ng-light" onClick={() => setSheet(null)}>
            Keep looking
          </button>
          <button className="ng-btn ng-green" onClick={() => choose(p, path)}>
            Next: your coach ›
          </button>
        </div>
      </div>
    );
  };

  const body =
    screen === 'home'
      ? home()
      : screen === 'quick'
        ? quickScreen()
        : screen === 'deal'
          ? dealScreen()
          : screen === 'state'
            ? stateScreen()
            : screen === 'list'
              ? listScreen()
              : screen === 'search'
                ? searchScreen()
                : coachScreen();

  return (
    <div className="ng-app">
      <div className="ng-screen">
        {body}
        {sheet && (
          <div className="ng-backdrop" onClick={() => setSheet(null)}>
            {sheet.kind === 'state' ? stateSheet(sheet.purpose) : sheet.kind === 'class' ? classSheet() : confirmSheet(sheet.program, sheet.path)}
          </div>
        )}
        {toast && (
          <div className="ng-toast" role="status">
            {toast}
          </div>
        )}
        {error && !toast && (
          <div className="ng-toast" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

const Badge: React.FC<{ p: Program; size?: 'sm' | 'lg' }> = ({ p, size }) => {
  const look = badgeColors(p.colors);
  const cls = `ng-badge${size ? ` ng-${size}` : ''}`;
  if (!look)
    return (
      <span className={`${cls} ng-neutral`} style={{ '--ring': 'rgba(255,255,255,.35)' } as React.CSSProperties} title="Colors not on file">
        {schoolInitials(programName(p))}
      </span>
    );
  return (
    <span className={cls} style={{ background: look.background, color: look.color, '--ring': look.ring } as React.CSSProperties}>
      {schoolInitials(programName(p))}
    </span>
  );
};

const Pill: React.FC<{ p: number }> = ({ p }) => {
  const t = tierOf(p);
  return (
    <span className="ng-pill" style={{ background: t.bg, color: t.fg }} title="Prestige">
      {p}
    </span>
  );
};

const TierBar: React.FC<{ c: ClassEntry }> = ({ c }) => (
  <span className="ng-tierbar" aria-hidden="true">
    {(['POWER', 'CONTEND', 'RECLAIM', 'REBUILD'] as QuickGroup[]).map((g) => (
      <i key={g} style={{ flex: c.groups[g], background: groupInfo(g).color }} />
    ))}
  </span>
);

/** The typed words marked inside a text. */
const Highlight: React.FC<{ text: string; q: string }> = ({ text, q }) => {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length || !text) return <>{text}</>;
  const low = text.toLowerCase();
  const mask = new Array<boolean>(text.length).fill(false);
  for (const w of words) for (let i = low.indexOf(w); i >= 0; i = low.indexOf(w, i + 1)) for (let k = i; k < i + w.length; k++) mask[k] = true;
  const parts: [string, boolean][] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1];
    if (last && last[1] === mask[i]) last[0] += text[i];
    else parts.push([text[i], mask[i]]);
  }
  return (
    <>
      {parts.map(([t, on], i) => (on ? <mark key={i}>{t}</mark> : <React.Fragment key={i}>{t}</React.Fragment>))}
    </>
  );
};

const LookupPanel: React.FC<{ p: Program; status: 'running' | 'found' | 'missing' }> = ({ p, status }) => {
  const what = missingWhat(p);
  if (status === 'running')
    return (
      <div className="ng-lookup">
        🔎 <b>Looking up {programName(p)}&apos;s {what}…</b>
        <small>Runs in the background while you finish this step. Usually a few seconds.</small>
        <div className="ng-lkbar">
          <i />
        </div>
      </div>
    );
  if (status === 'found')
    return (
      <div className="ng-lookup ng-done">
        ✓ <b>Found the {what}.</b> Your team will wear them from day one.
      </div>
    );
  return (
    <div className="ng-lookup ng-miss">
      🎨 <b>Couldn&apos;t find the {what}.</b> You start in neutral slate.
    </div>
  );
};

const Loading: React.FC<{ error: boolean; onRetry: () => void }> = ({ error, onRetry }) =>
  error ? (
    <div className="ng-hint">
      The school list didn&apos;t load. Check your connection.
      <div className="ng-ex">
        <button className="ng-chip" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  ) : (
    <div className="ng-hint">Loading every school in the country…</div>
  );
