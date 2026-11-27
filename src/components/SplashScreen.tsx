import { loadStateTeams, loadTeamsForSave } from '../data/teamData';
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { NewGameScreen } from './NewGameScreen';
import { applySchoolFacts, careerArgs, NewGameStart } from '../sim/newGameStart';
import { MusicTapHint } from './MusicTapHint';
import { HallOfFameArcade } from './HallOfFameBoard';
import { Sheet } from './ui/Sheet';
import { useScrollTopOnScreenChange } from '../utils/pageScroll';
import { CareerLength } from '../sim/careerScore';
import { deleteAnySave, listAllSaves, loadAnySave, SaveEntry, signInAvailable, useAccount } from '../services/account';
import { loadAllPlayedGames } from '../services/playedGames';
import { gamesSince, PlayedGame } from '../sim/gameLock';
import { reopenCookieBanner } from '../services/consent';
import { setEntrySource, track } from '../services/analytics';
import TEAM_PAGES from '../data/teamPages.json';
import { parseTeamLink } from '../sim/teamLink';
import { AccountSheet, SignInResult, SignInSheet } from './AccountPanels';
import { version } from '../../package.json';
import { assetUrl, sitePage } from '../utils/site';

/** Title screen: start a scenario career (or a classic game at a difficulty), continue, or load a saved game. */
export const SplashScreen: React.FC<{ onEnterGame: () => void; canContinue: boolean }> = ({ onEnterGame, canContinue }) => {
  const { newScenarioGame, loadGame } = useGameStore();
  const [view, setView] = useState<'MENU' | 'NEW' | 'LOAD'>('MENU');
  useScrollTopOnScreenChange(view);
  const [saves, setSaves] = useState<SaveEntry[] | null>(null);
  const account = useAccount();
  const [accountSheet, setAccountSheet] = useState<'SIGN_IN' | 'ACCOUNT' | null>(null);
  // The Hall of Fame, open from the title screen with or without a game loaded (view only)
  const [hallOfFame, setHallOfFame] = useState<CareerLength | null>(null);
  const career = useGameStore((s) => s.career);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The newest save (autosave or manual): Continue picks up there after a refresh or a new visit
  const [latest, setLatest] = useState<SaveEntry | null>(null);
  // Signed in, the lists include the account's cloud saves (the newer copy of each slot)
  const accountKey = `${account.ready}|${account.user?.id ?? ''}`;

  useEffect(() => {
    if (view !== 'MENU' || canContinue) return;
    listAllSaves()
      .then((list) => setLatest(list[0] ?? null))
      .catch(() => setLatest(null));
  }, [view, canContinue, accountKey]);

  // Games already played from a save's point on: loading it won't replay them (a game counts once it kicks off)
  const [played, setPlayed] = useState<PlayedGame[]>([]);
  useEffect(() => {
    if (view !== 'LOAD') return;
    listAllSaves()
      .then(setSaves)
      .catch(() => setSaves([]));
    void loadAllPlayedGames().then(setPlayed);
  }, [view, accountKey]);
  const lockedNote = (save: SaveEntry) => {
    if (!save.careerKey) return null;
    const games = gamesSince(played, save.careerKey, save.currentYear, save.currentWeek);
    if (games.length === 0) return null;
    return games.length === 1 ? `🔒 ${games[0].year === save.currentYear ? '' : `${games[0].year} `}Week ${games[0].week} already played: the result stands` : `🔒 ${games.length} games already played: results stand`;
  };

  // A link from a team page (/?state=texas&school=duncanville) opens New Game with that school and 10 seasons picked,
  // ready for the coach's name; the address is cleaned up so a refresh shows the title screen
  const [teamLink] = useState(() => parseTeamLink(window.location.search));
  useEffect(() => {
    if (!teamLink) return;
    setEntrySource(teamLink.source, teamLink.variant);
    setView('NEW');
    window.history.replaceState(null, '', window.location.pathname);
  }, [teamLink]);
  const startCareer = ({ program, coachName, length, facts, path }: NewGameStart) => {
    setBusy(true);
    setError(null);
    track('team_pick', { path, group: program.group, state: program.state, level: program.level });
    const { scenario, school, target } = careerArgs(program);
    // The state's other classes play in the background, so its team list must be in before the world is built
    loadStateTeams(program.state)
      .then(() =>
        setTimeout(() => {
          newScenarioGame(scenario, program.state, school, coachName, length, target);
          // A mascot or colors looked up during Coach Information go on the coach's team
          const s = useGameStore.getState();
          const team = s.leagueTeams.find((t) => t.id === s.userTeamId);
          if (team && applySchoolFacts(team, facts)) useGameStore.setState({ leagueTeams: [...s.leagueTeams] });
          setBusy(false);
          onEnterGame();
        }, 20)
      )
      .catch(() => {
        setBusy(false);
        setError("That school's team list didn't load. Check your connection and try again.");
      });
  };

  const load = async (entry: SaveEntry) => {
    setBusy(true);
    setError(null);
    try {
      const save = await loadAnySave(entry);
      if (!save) throw new Error('missing');
      await loadTeamsForSave(save.league); // its state's other classes are rebuilt from the team data
      loadGame(save);
      onEnterGame();
    } catch {
      setError('That save could not be loaded.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    track('save_deleted', { saves: saves?.length ?? 0 });
    await deleteAnySave(id);
    setConfirmDelete(null);
    setSaves((list) => list?.filter((s) => s.id !== id) ?? null);
  };
  // The title menu's choice (Continue: the game in memory, or the newest save)
  const menuChoice = (choice: 'continue' | 'new' | 'load' | 'hall_of_fame') => track('menu_choice', { choice, ...(choice === 'continue' && { from_save: !canContinue }) });

  if (view === 'NEW')
    return (
      <NewGameScreen
        onBack={() => (setError(null), setView('MENU'))}
        onStart={startCareer}
        busy={busy}
        error={error}
        link={teamLink && { state: teamLink.state, school: teamLink.school }}
      />
    );

  return (
    <div className="ui-on-dark" style={pageStyle}>
      {/* The optional account: sign in, or who is signed in */}
      {account.user ? (
        <button className="account-pill" onClick={() => setAccountSheet('ACCOUNT')} aria-label="Account">
          <span className="account-pill-dot" aria-hidden="true">
            ●
          </span>
          {account.user.name || account.user.email?.split('@')[0] || 'Account'}
        </button>
      ) : (
        signInAvailable(account.options) && (
          <button className="account-pill" onClick={() => setAccountSheet('SIGN_IN')}>
            Sign in
          </button>
        )
      )}
      {accountSheet === 'SIGN_IN' && <SignInSheet onClose={() => setAccountSheet(null)} />}
      {accountSheet === 'ACCOUNT' && <AccountSheet onClose={() => setAccountSheet(null)} onSignIn={() => setAccountSheet('SIGN_IN')} />}
      {hallOfFame && (
        <Sheet title="🏆 Hall of Fame" onClose={() => setHallOfFame(null)}>
          <HallOfFameArcade career={career} length={hallOfFame} onLength={setHallOfFame} />
        </Sheet>
      )}
      <div style={{ width: '100%', maxWidth: '760px' }}>
        <div style={{ textAlign: 'center', marginBottom: view === 'MENU' ? '28px' : '16px' }}>
          {/* The logo, under the lights; smaller on New Game and Load Game so their choices stay near the top */}
          <h1 className={view === 'MENU' ? 'title-logo' : 'title-logo title-logo-compact'}>
            <img src={assetUrl('logo/football-coach-logo.webp')} alt="Football Coach High School Edition" width={840} height={459} />
          </h1>
          {view === 'MENU' && (
            <>
              {/* What the game is, for anyone arriving from a link (the same words are in index.html for search engines) */}
              <p className="title-pitch">The high school football coaching sim. Take over a program and build it into a dynasty. Can you win a national title?</p>
              {/* A feature strip, not buttons: no box or shadow, so only the menu below looks tappable */}
              <ul className="title-features" aria-label="What you do">
                {[
                  ['🏈', 'Call the plays'],
                  ['🎓', 'Recruit and develop'],
                  ['🏆', 'Chase state titles']
                ].map(([icon, label]) => (
                  <li key={label}>
                    <span className="title-feature-icon" aria-hidden="true">
                      {icon}
                    </span>
                    <span className="title-feature-label">{label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {view === 'MENU' && <SignInResult />}
        {view === 'MENU' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '360px', margin: '0 auto' }}>
            {/* Continue: the game in progress, or (after a refresh or a new visit) the newest save */}
            {(canContinue || latest) && (
              <button onClick={() => (menuChoice('continue'), canContinue ? onEnterGame() : latest && load(latest))} disabled={busy} style={menuBtn('#F59E0B', '#0F172A')}>
                ▶️ {busy ? 'Loading…' : 'Continue'}
                {!canContinue && latest && (
                  <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginTop: '2px' }}>
                    {latest.teamName} · {latest.currentYear} Wk {latest.currentWeek} · {latest.wins}-{latest.losses}
                    {latest.isAutosave ? ' · Autosave' : ''}
                  </span>
                )}
              </button>
            )}
            {error && <div style={{ color: '#FCA5A5', fontSize: '13px', textAlign: 'center' }}>{error}</div>}
            <button onClick={() => (menuChoice('new'), setView('NEW'))} style={menuBtn('#15803D', '#fff')}>
              🆕 New Game
            </button>
            <button onClick={() => (menuChoice('load'), setView('LOAD'))} style={menuBtn('#334155', '#fff')}>
              📂 Load Game
            </button>
            <button onClick={() => (menuChoice('hall_of_fame'), setHallOfFame(career?.length || 3))} style={{ ...menuBtn('#05060F', '#FACC15'), border: '2px solid #FACC15' }}>
              🏆 Hall of Fame
            </button>
            {account.user && account.options.cloudSaves ? (
              <div style={{ textAlign: 'center', fontSize: '12px', color: '#86EFAC' }}>☁️ Saves sync to your account</div>
            ) : (
              signInAvailable(account.options) && <div style={{ textAlign: 'center', fontSize: '12px', color: '#94A3B8' }}>Sign in to keep your saves on every device</div>
            )}
            <MusicTapHint />
          </div>
        )}

        {view === 'LOAD' && (
          <div>
            <h2 style={sectionTitle}>Load Game</h2>
            {error && <p style={{ textAlign: 'center', color: '#FCA5A5' }}>{error}</p>}
            {saves === null && <p style={{ textAlign: 'center', color: '#CBD5E1' }}>Loading saves…</p>}
            {saves?.length === 0 && (
              <p style={{ textAlign: 'center', color: '#CBD5E1' }}>No saved games yet. Games autosave every week, and you can save anytime from ⚙️ Save / Load.</p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {saves?.map((save) => (
                <div key={save.id} style={saveRow}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ fontWeight: 'bold', color: '#0F172A' }}>
                      {save.teamName}
                      {save.isAutosave && <span style={badge('#FEF3C7', '#92400E')}>Autosave</span>}
                      {save.inCloud && <span style={badge('#DCFCE7', '#166534')}>{save.cloudNewer ? '☁️ Cloud' : '☁️ Synced'}</span>}
                      {save.difficulty && <span style={badge('#EEF2FF', '#3730A3')}>{save.difficulty.charAt(0) + save.difficulty.slice(1).toLowerCase()}</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748B' }}>
                      {save.currentYear} season · Week {save.currentWeek} · {save.wins}-{save.losses} · {new Date(save.timestamp).toLocaleString()}
                    </div>
                    {!save.isAutosave && <div style={{ fontSize: '12px', color: '#475569' }}>{save.saveName}</div>}
                    {lockedNote(save) && (
                      <div style={{ display: 'inline-block', marginTop: '4px', fontSize: '11.5px', fontWeight: 700, color: '#92400E', background: '#FEF3C7', borderRadius: '6px', padding: '3px 7px' }}>
                        {lockedNote(save)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {confirmDelete === save.id ? (
                      <>
                        <button onClick={() => remove(save.id)} style={smallBtn('#DC2626', '#fff')}>
                          Delete
                        </button>
                        <button onClick={() => setConfirmDelete(null)} style={smallBtn('#E2E8F0', '#334155')}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => load(save)} disabled={busy} style={smallBtn('#2563EB', '#fff')}>
                          Load
                        </button>
                        <button onClick={() => setConfirmDelete(save.id)} disabled={busy} style={smallBtn('#E2E8F0', '#B91C1C')} aria-label={`Delete save for ${save.teamName}`}>
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <BackButton onClick={() => setView('MENU')} />
          </div>
        )}
        {/* The team pages (scripts/team-pages/build.mjs writes the list): a quiet line, for fans and search engines */}
        {view === 'MENU' && TEAM_PAGES.length > 0 && (
          <p className="title-teams">
            Real high school football: Friday nights under the lights, district rivals, the playoffs and one state title on the line. Can you win state
            with{' '}
            {TEAM_PAGES.map((t, i) => (
              <React.Fragment key={t.path}>
                {i > 0 && (i === TEAM_PAGES.length - 1 ? ' or ' : ', ')}
                <a href={sitePage(t.path)} aria-label={`${t.full}, ${t.state}`} onClick={() => track('title_team_link', { state: t.state, school: t.school })}>
                  {t.short}
                </a>
              </React.Fragment>
            ))}
            ? Or take your own school there.
          </p>
        )}
        <nav className="title-links" aria-label="Policies">
          <a href={sitePage('/privacy')} target="_blank" rel="noopener">
            Privacy
          </a>{' '}
          ·{' '}
          <a href={sitePage('/terms')} target="_blank" rel="noopener">
            Terms
          </a>{' '}
          ·{' '}
          <a href={sitePage('/about')} target="_blank" rel="noopener">
            About
          </a>{' '}
          · <button onClick={reopenCookieBanner}>Cookies</button>
        </nav>
        {/* The build the coach is playing (package.json), for bug reports */}
        <div style={{ textAlign: 'center', marginTop: '8px', color: '#64748B', fontSize: '12px' }}>Version {version}</div>
      </div>
    </div>
  );
};

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <div style={{ textAlign: 'center', marginTop: '20px' }}>
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '14px' }}>
      ← Back
    </button>
  </div>
);

const pageStyle: React.CSSProperties = {
  position: 'relative', // the account pill sits in its top corner
  minHeight: '100%',
  boxSizing: 'border-box',
  background: 'radial-gradient(circle at top, #1E3A5F 0%, #0F172A 60%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 16px',
  fontFamily: 'sans-serif'
};

const sectionTitle: React.CSSProperties = { textAlign: 'center', color: '#F8FAFC', margin: '0 0 8px 0', fontSize: '20px' };

const menuBtn = (background: string, color: string): React.CSSProperties => ({
  padding: '14px',
  background,
  color,
  border: 'none',
  borderRadius: '8px',
  fontWeight: 'bold',
  fontSize: '16px',
  cursor: 'pointer'
});

const saveRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap',
  background: '#fff',
  borderRadius: '8px',
  padding: '12px 14px'
};

const badge = (background: string, color: string): React.CSSProperties => ({
  background,
  color,
  fontSize: '12px',
  fontWeight: 'bold',
  padding: '2px 6px',
  borderRadius: '4px',
  marginLeft: '8px'
});

const smallBtn = (background: string, color: string): React.CSSProperties => ({
  minHeight: '40px', // comfortable tap target
  padding: '8px 12px',
  background,
  color,
  border: 'none',
  borderRadius: '6px',
  fontWeight: 'bold',
  fontSize: '13px',
  cursor: 'pointer'
});
