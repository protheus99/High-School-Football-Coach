import React from 'react';
import { NewsArticle } from '../sim/newsEngine';

interface NewsMediaViewProps {
  articles: NewsArticle[];
}

export const NewsMediaView: React.FC<NewsMediaViewProps> = ({ articles }) => {
  return (
    <div style={{ padding: '20px', maxWidth: '850px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ borderBottom: '2px solid #0F172A', paddingBottom: '8px', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>📰 THE FRIDAY NIGHT CHRONICLE</h2>
        <div style={{ fontSize: '12px', color: '#64748B' }}>Local High School Sports Desk & Sideline Rumor Mill</div>
      </div>

      {articles.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {articles.map((art) => (
            <div
              key={art.id}
              style={{
                background: '#fff',
                border: '1px solid #E2E8F0',
                borderLeft: `5px solid ${art.impactSentiment === 'POSITIVE' ? '#10B981' : art.impactSentiment === 'NEGATIVE' ? '#EF4444' : '#3B82F6'}`,
                borderRadius: '6px',
                padding: '16px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase' }}>
                  {art.outlet.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: '11px', color: '#94A3B8' }}>Week {art.week}</span>
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#0F172A' }}>{art.headline}</h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>{art.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: '#94A3B8', textAlign: 'center', padding: '30px' }}>No headlines recorded yet this season.</div>
      )}
    </div>
  );
};
