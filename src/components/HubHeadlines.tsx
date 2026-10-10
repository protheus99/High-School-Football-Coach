import React from 'react';
import { useGameStore } from '../store/gameStore';
import { NewsCategory, newsCategory, pickHeadlines } from '../sim/newsEngine';
import type { AgendaTab } from './WeeklyAgenda';

const STYLE: Record<NewsCategory, { icon: string; label: string; tint: string; color: string; target: AgendaTab }> = {
  YOUR_GAME: { icon: '🏈', label: 'YOUR GAME', tint: '#DBEAFE', color: '#1E40AF', target: 'NEWS' },
  RANKINGS: { icon: '📊', label: 'RANKINGS', tint: '#DBEAFE', color: '#1E40AF', target: 'POLLS' },
  RECRUITING: { icon: '🤝', label: 'RECRUITING', tint: '#DCFCE7', color: '#166534', target: 'COLLEGE' },
  PROGRAM: { icon: '⚖️', label: 'PROGRAM', tint: '#FEE2E2', color: '#991B1B', target: 'NEWS' },
  LEAGUE: { icon: '🏟️', label: 'LEAGUE', tint: '#F1F5F9', color: '#334155', target: 'NEWS' }
};

const MAX_HEADLINES = 5;
const DETAIL_LENGTH = 110;
const trim = (text: string) => (text.length > DETAIL_LENGTH ? `${text.slice(0, DETAIL_LENGTH - 1).trimEnd()}…` : text);

/**
 * The week's headlines on the Hub: the few stories that matter most since the week began (the coach's game,
 * real moves in the polls, his players' commitments, program trouble), a dot on the ones he hasn't seen, and a
 * tap to the screen behind each. Everything else is a tap away in News.
 */
export const HubHeadlines: React.FC<{ onNavigate: (tab: AgendaTab) => void }> = ({ onNavigate }) => {
  const { newsArticles, newsMark, newsSeen, districtTeams, userTeamId } = useGameStore();
  const team = districtTeams.find((t) => t.id === userTeamId);
  const fresh = newsArticles.slice(0, Math.max(0, newsArticles.length - newsMark));
  const unread = new Set(newsArticles.slice(0, Math.max(0, newsArticles.length - newsSeen)).map((a) => a.id));
  const headlines = pickHeadlines(fresh, team?.name ?? '', MAX_HEADLINES);
  return (
    <section aria-labelledby="headlines-title" style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 2px 8px' }}>
        <h3 id="headlines-title" style={{ margin: 0, fontSize: '16px' }}>
          📰 Headlines
        </h3>
        <span style={{ fontSize: '12px', color: '#475569' }}>since last week</span>
      </div>
      <div style={card}>
        {headlines.length === 0 && <div style={{ padding: '12px', fontSize: '13px', color: '#64748B' }}>No big stories this week.</div>}
        {headlines.map((a, i) => {
          const s = STYLE[newsCategory(a)];
          return (
            <button key={a.id} onClick={() => onNavigate(s.target)} style={{ ...row, borderTop: i === 0 ? 'none' : '1px solid #F1F5F9' }}>
              <span aria-hidden="true" style={{ ...circle, background: s.tint }}>
                {s.icon}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 800, letterSpacing: '0.03em', color: s.color }}>{s.label}</span>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, lineHeight: 1.3, color: '#0F172A' }}>{a.headline}</span>
                <span style={{ display: 'block', fontSize: '11.5px', color: '#64748B', marginTop: '1px' }}>{trim(a.content)}</span>
              </span>
              {unread.has(a.id) && <span aria-label="New" style={dot} />}
            </button>
          );
        })}
        <button onClick={() => onNavigate('NEWS')} style={allNews}>
          All news ›
        </button>
      </div>
    </section>
  );
};

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 1px 2px rgba(15,23,42,.08), 0 2px 8px rgba(15,23,42,.06)'
};
const row: React.CSSProperties = {
  display: 'flex',
  gap: '9px',
  alignItems: 'flex-start',
  width: '100%',
  padding: '10px 12px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  font: 'inherit',
  cursor: 'pointer'
};
const circle: React.CSSProperties = {
  flex: '0 0 30px',
  width: '30px',
  height: '30px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '15px'
};
const dot: React.CSSProperties = { width: '8px', height: '8px', borderRadius: '50%', background: '#2563EB', flex: '0 0 8px', marginTop: '5px' };
const allNews: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: '42px',
  textAlign: 'center',
  fontSize: '13px',
  fontWeight: 800,
  color: '#1D4ED8',
  background: 'none',
  border: 'none',
  borderTop: '1px solid #F1F5F9',
  cursor: 'pointer'
};
