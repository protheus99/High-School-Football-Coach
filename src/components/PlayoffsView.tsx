import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { BracketNode, PlayoffBracketState, userDivisionIndex } from '../sim/playoffEngine';
import { playoffQualifyText, rulesForState } from '../sim/stateRules';
import { rankedName } from '../sim/newsEngine';
import { StateAndNationalPolls, Team } from '../types/game';

/**
 * Rankings › Playoffs: the state bracket on its own page (no pop-up to close). The coach's status and path
 * through the rounds come first, then any division and round, region by region, with the coach's region open.
 */
export const PlayoffsView: React.FC<{ onGoToGame: () => void; onStandings: () => void }> = ({ onGoToGame, onStandings }) => {
  const { playoffBracket, userTeamId, league, polls, leagueTeams } = useGameStore();
  const rules = rulesForState(league?.state);
  if (!playoffBracket) {
    const me = leagueTeams.find((t) => t.id === userTeamId);
    return (
      <div className="ui-screen">
        <div style={{ ...card, ...statusCard('#94A3B8') }}>
          <div style={{ ...kicker, color: '#475569' }}>PLAYOFFS</div>
          <div style={statusTitle}>The bracket is set after the regular season</div>
          <div style={statusDetail}>
            {playoffQualifyText(rules)}
            {me ? ` You're ${me.record.wins}-${me.record.losses}.` : ''}
          </div>
          <button onClick={onStandings} style={{ ...button, ...secondaryButton }}>
            Standings ›
          </button>
        </div>
      </div>
    );
  }
  return <Bracket bracket={playoffBracket} userTeamId={userTeamId} polls={polls} roundLabels={rules.playoffs.roundLabels} onGoToGame={onGoToGame} />;
};

const Bracket: React.FC<{
  bracket: PlayoffBracketState;
  userTeamId: string;
  polls: StateAndNationalPolls | null;
  roundLabels: Record<string, string>;
  onGoToGame: () => void;
}> = ({ bracket, userTeamId, polls, roundLabels, onGoToGame }) => {
  const { divisions, roundNames, currentRoundIndex, isPlayoffsActive } = bracket;
  const myDivision = userDivisionIndex(bracket, userTeamId);
  const [divisionIndex, setDivisionIndex] = useState(myDivision ?? 0);
  const [roundIndex, setRoundIndex] = useState(Math.min(currentRoundIndex, roundNames.length - 1));
  const [openRegions, setOpenRegions] = useState<Record<string, boolean>>({});
  const division = divisions[divisionIndex];
  const involves = (n: BracketNode) => n.team1.id === userTeamId || n.team2.id === userTeamId;
  const name = (t: Team) => rankedName(t, polls);

  // The coach's games, round by round
  const myGames = myDivision === undefined ? [] : roundNames.map((_, i) => divisions[myDivision].rounds[i]?.find(involves));
  const lastGame = [...myGames].reverse().find((g) => g !== undefined);
  const lastIndex = lastGame ? myGames.lastIndexOf(lastGame) : -1;
  const eliminated = !!lastGame?.winnerTeamId && lastGame.winnerTeamId !== userTeamId;
  const champion = myDivision !== undefined && divisions[myDivision].championTeamId === userTeamId;
  // The coach's region (from his first game): it opens by default in every round of his division
  const myRegion = myDivision === undefined ? undefined : divisions[myDivision].rounds[0]?.find(involves)?.region;
  const opponentOf = (n: BracketNode) => (n.team1.id === userTeamId ? n.team2 : n.team1);
  const myScore = (n: BracketNode) => (n.team1.id === userTeamId ? [n.team1Score, n.team2Score] : [n.team2Score, n.team1Score]);

  // ---------------------------------------------------------------- status: what's next for the coach
  let status: { accent: string; tone: string; kicker: string; title: React.ReactNode; detail: string; goToGame?: boolean };
  if (myDivision === undefined) {
    status = { accent: '#94A3B8', tone: '#475569', kicker: 'PLAYOFFS', title: "You didn't make the playoffs this season", detail: 'The tournament goes on as you advance the weeks.' };
  } else if (champion) {
    status = { accent: '#F59E0B', tone: '#92400E', kicker: 'STATE CHAMPIONS', title: `${roundNames.length} playoff wins`, detail: `Crowned at ${bracket.championshipVenue ?? 'the state final'}.` };
  } else if (eliminated && lastGame) {
    const [us, them] = myScore(lastGame);
    status = {
      accent: '#94A3B8',
      tone: '#475569',
      kicker: 'SEASON OVER',
      title: `Lost in the ${roundLabels[roundNames[lastIndex]]} to ${name(opponentOf(lastGame))}`,
      detail: `${us}-${them} final. The tournament goes on as you advance the weeks.`
    };
  } else if (lastGame && !lastGame.isBye && !lastGame.winnerTeamId) {
    const opp = opponentOf(lastGame);
    status = {
      accent: '#2563EB',
      tone: '#1E40AF',
      kicker: `THIS WEEK · ${roundLabels[roundNames[lastIndex]].toUpperCase()}`,
      title: `${lastGame.team1.id === userTeamId ? 'vs' : 'at'} ${name(opp)} (${opp.record.wins}-${opp.record.losses})`,
      detail: roundNames[lastIndex + 1] ? `Win and advance to the ${roundLabels[roundNames[lastIndex + 1]]}.` : 'Win the state championship.',
      goToGame: true
    };
  } else {
    status = {
      accent: '#16A34A',
      tone: '#166534',
      kicker: lastGame?.isBye ? 'FIRST-ROUND BYE' : `WON · ${lastIndex >= 0 ? roundLabels[roundNames[lastIndex]].toUpperCase() : ''}`,
      title: lastGame?.isBye ? 'You advance without playing' : 'On to the next round',
      detail: 'Advance the week to play out the rest of the round.'
    };
  }

  // ---------------------------------------------------------------- the selected round, by region
  const nodes = division.rounds[roundIndex] ?? [];
  const groups: { label: string; games: BracketNode[] }[] = [];
  nodes.forEach((n) => {
    const label = n.region ?? 'State';
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.games.push(n);
    else groups.push({ label, games: [n] });
  });
  const roundStatus = (i: number) =>
    !isPlayoffsActive || i < currentRoundIndex ? { text: '✓ Final', color: '#16A34A' } : i === currentRoundIndex ? { text: '● This week', color: '#2563EB' } : { text: 'Upcoming', color: '#64748B' };

  return (
    <div className="ui-screen">
      {divisions.map((d) => {
        const final = d.rounds[roundNames.length - 1]?.[0];
        const champ = final && d.championTeamId ? (final.team1.id === d.championTeamId ? final.team1 : final.team2) : undefined;
        return champ ? (
          <div key={d.name} style={championBanner}>
            <div style={{ fontSize: '12px', color: '#92400E', fontWeight: 800 }}>👑 {divisions.length > 1 ? `${d.name.toUpperCase()} ` : ''}STATE CHAMPION</div>
            <div style={{ fontSize: '18px', fontWeight: 800 }}>
              {champ.name} {champ.mascot}
            </div>
            {bracket.championshipVenue && <div style={{ fontSize: '12px', color: '#92400E' }}>Crowned at {bracket.championshipVenue}</div>}
          </div>
        ) : null;
      })}

      <div style={{ ...card, ...statusCard(status.accent) }}>
        <div style={{ ...kicker, color: status.tone }}>{status.kicker}</div>
        <div style={statusTitle}>{status.title}</div>
        <div style={statusDetail}>{status.detail}</div>
        {status.goToGame && (
          <button onClick={onGoToGame} style={{ ...button, ...primaryButton }}>
            🏈 Go to the game ›
          </button>
        )}
      </div>

      {myDivision !== undefined && (
        <div style={{ ...card, padding: '10px 12px', marginBottom: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '6px' }}>Your path</div>
          {roundNames.map((round, i) => {
            const g = myGames[i];
            let dot: 'win' | 'now' | 'loss' | 'open' = 'open';
            let line: React.ReactNode = <span style={{ color: '#94A3B8' }}>{eliminated ? '—' : 'If you win'}</span>;
            if (g?.isBye) {
              dot = 'win';
              line = <b style={{ color: '#15803D' }}>Bye</b>;
            } else if (g?.winnerTeamId) {
              const won = g.winnerTeamId === userTeamId;
              const [us, them] = myScore(g);
              dot = won ? 'win' : 'loss';
              line = (
                <>
                  <b style={{ color: won ? '#15803D' : '#B91C1C' }}>
                    {won ? 'W' : 'L'} {us}-{them}
                  </b>{' '}
                  {g.team1.id === userTeamId ? 'vs' : 'at'} {name(opponentOf(g))}
                </>
              );
            } else if (g) {
              dot = 'now';
              line = (
                <>
                  <b style={{ color: '#1D4ED8' }}>This week</b> · {g.team1.id === userTeamId ? 'vs' : 'at'} {name(opponentOf(g))}
                </>
              );
            }
            return (
              <div key={round} style={{ display: 'flex', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 16px' }}>
                  <div style={pathDot(dot)} />
                  {i < roundNames.length - 1 && <div style={{ flex: 1, width: '2px', background: '#E2E8F0', margin: '2px 0' }} />}
                </div>
                <div style={{ paddingBottom: '9px', fontSize: '13px', minWidth: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748B' }}>{roundLabels[round].toUpperCase()}</div>
                  {line}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {divisions.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${divisions.length}, minmax(0, 1fr))`, gap: '6px', marginBottom: '8px' }} role="group" aria-label="Division">
          {divisions.map((d, i) => (
            <button key={d.name} aria-pressed={i === divisionIndex} onClick={() => setDivisionIndex(i)} style={segment(i === divisionIndex)}>
              {d.name}
              {i === myDivision ? ' ★' : ''}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '10px' }} role="group" aria-label="Round">
        {roundNames.map((round, i) => {
          const s = roundStatus(i);
          const available = !!division.rounds[i];
          return (
            <button key={round} aria-pressed={i === roundIndex} disabled={!available} onClick={() => setRoundIndex(i)} style={roundChip(i === roundIndex, available)}>
              <div style={{ fontSize: '12.5px', fontWeight: 800 }}>{roundLabels[round]}</div>
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: s.color }}>{s.text}</div>
            </button>
          );
        })}
      </div>

      {nodes.length === 0 && <div style={{ ...card, padding: '10px 12px', color: '#64748B', fontSize: '13px' }}>This round is set once the round before it is played.</div>}
      {groups.map((group, g) => {
        const mine = group.games.some(involves) || (divisionIndex === myDivision && group.label === myRegion);
        const key = `${divisionIndex}_${roundIndex}_${group.label}`;
        const open = openRegions[key] ?? (mine || groups.length === 1);
        return (
          <div key={`${group.label}_${g}`} style={{ marginBottom: '8px' }}>
            <button onClick={() => setOpenRegions({ ...openRegions, [key]: !open })} aria-expanded={open} style={regionHeader}>
              <span>
                {group.label.toUpperCase()}
                {mine ? ' · YOUR REGION' : ''} · {group.games.length} game{group.games.length === 1 ? '' : 's'}
              </span>
              <span aria-hidden="true">{open ? '▾' : '▸'}</span>
            </button>
            {open &&
              group.games.map((n) => (
                <div key={n.matchupId} style={{ ...card, ...matchup(involves(n)) }}>
                  {(n.isBye ? [n.team1] : [n.team1, n.team2]).map((t, i) => {
                    const score = i === 0 ? n.team1Score : n.team2Score;
                    const won = n.winnerTeamId === t.id;
                    return (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13.5px', padding: '2px 0' }}>
                        <span style={{ fontWeight: won ? 800 : 600, color: won ? '#15803D' : n.winnerTeamId ? '#94A3B8' : '#0F172A', minWidth: 0 }}>
                          {name(t)}{' '}
                          <span style={{ fontSize: '11.5px', color: '#64748B', fontWeight: 400 }}>
                            ({t.record.wins}-{t.record.losses})
                          </span>
                        </span>
                        <span style={{ marginLeft: 'auto', fontWeight: 800 }}>{score ?? ''}</span>
                      </div>
                    );
                  })}
                  {n.isBye && <div style={{ fontSize: '11.5px', color: '#64748B' }}>Bye: advances without playing</div>}
                  {!n.isBye && !n.winnerTeamId && <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>{involves(n) ? 'This week · your game' : 'This week'}</div>}
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
};

const card: React.CSSProperties = { background: '#fff', borderRadius: '12px', boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)' };
const statusCard = (accent: string): React.CSSProperties => ({ padding: '12px', marginBottom: '12px', borderLeft: `5px solid ${accent}` });
const kicker: React.CSSProperties = { fontSize: '11px', fontWeight: 800, letterSpacing: '0.03em' };
const statusTitle: React.CSSProperties = { fontSize: '16px', fontWeight: 800, marginTop: '2px' };
const statusDetail: React.CSSProperties = { fontSize: '13px', color: '#475569', marginTop: '2px' };
const button: React.CSSProperties = { minHeight: '40px', borderRadius: '8px', fontSize: '13px', fontWeight: 800, padding: '0 14px', marginTop: '8px', cursor: 'pointer' };
const primaryButton: React.CSSProperties = { background: '#2563EB', border: '1px solid #2563EB', color: '#fff' };
const secondaryButton: React.CSSProperties = { background: '#fff', border: '1px solid #CBD5E1', color: '#0F172A' };
const championBanner: React.CSSProperties = { background: '#FEF3C7', border: '2px solid #F59E0B', borderRadius: '12px', padding: '12px', textAlign: 'center', marginBottom: '12px' };
const pathDot = (kind: 'win' | 'now' | 'loss' | 'open'): React.CSSProperties => ({
  width: '14px',
  height: '14px',
  borderRadius: '50%',
  marginTop: '2px',
  border: `2px solid ${kind === 'win' ? '#16A34A' : kind === 'now' ? '#2563EB' : kind === 'loss' ? '#DC2626' : '#CBD5E1'}`,
  background: kind === 'win' ? '#16A34A' : kind === 'now' ? '#2563EB' : kind === 'loss' ? '#DC2626' : '#fff',
  boxShadow: kind === 'now' ? '0 0 0 3px #DBEAFE' : undefined
});
const segment = (on: boolean): React.CSSProperties => ({
  minHeight: '40px',
  borderRadius: '8px',
  border: on ? '2px solid #0F172A' : '1px solid #CBD5E1',
  background: on ? '#0F172A' : '#fff',
  color: on ? '#fff' : '#0F172A',
  fontSize: '13px',
  fontWeight: 800,
  cursor: 'pointer'
});
const roundChip = (on: boolean, available: boolean): React.CSSProperties => ({
  flex: '0 0 auto',
  minHeight: '44px',
  padding: '4px 10px',
  borderRadius: '10px',
  border: on ? '2px solid #2563EB' : '1px solid #CBD5E1',
  background: on ? '#EFF6FF' : '#fff',
  color: '#0F172A',
  textAlign: 'left',
  cursor: available ? 'pointer' : 'default',
  opacity: available ? 1 : 0.55
});
const regionHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  minHeight: '36px',
  background: 'none',
  border: 'none',
  font: 'inherit',
  fontSize: '12px',
  fontWeight: 800,
  color: '#475569',
  letterSpacing: '0.03em',
  padding: '4px 2px',
  cursor: 'pointer'
};
const matchup = (mine: boolean): React.CSSProperties => ({
  padding: '8px 10px',
  marginBottom: '6px',
  ...(mine && { outline: '2px solid #2563EB', background: '#EFF6FF' })
});
