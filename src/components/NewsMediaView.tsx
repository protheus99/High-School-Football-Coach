import React from 'react';
import { NewsArticle } from '../sim/newsEngine';
import { PageHeader } from './ui/PageHeader';

interface NewsMediaViewProps {
  articles: NewsArticle[];
}

export const NewsMediaView: React.FC<NewsMediaViewProps> = ({ articles }) => {
  return (
    <>
    <PageHeader title="News" subtitle="The Friday Night Chronicle: the local sports desk and sideline rumor mill" />
    <div className="ui-screen" style={{ maxWidth: '850px' }}>

      {articles.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {articles.map((art) => (
            <div
              key={art.id}
              style={{
                background: '#fff',
                border: '1px solid #E2E8F0',
                borderLeft: `5px solid ${art.impactSentiment === 'POSITIVE' ? '#10B981' : art.impactSentiment === 'NEGATIVE' ? '#EF4444' : '#3B82F6'}`,
                borderRadius: '10px',
                padding: '12px 14px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748B', textTransform: 'uppercase' }}>
                  {art.outlet.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: '12px', color: '#64748B' }}>Week {art.week}</span>
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', color: '#0F172A' }}>{art.headline}</h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: '1.5' }}>{art.content}</p>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: '#64748B', textAlign: 'center', padding: '30px' }}>No headlines recorded yet this season.</div>
      )}
    </div>
    </>
  );
};
