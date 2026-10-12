import React from 'react';
import { useGameStore } from '../store/gameStore';
import { formatCP } from '../sim/coachPoints';
import { SELF_REPORT } from '../sim/compliance';
import { Sheet } from './ui/Sheet';
import { StageMeter } from './ComplianceView';

/** One choice: a title and its effects, ▲ good and ▼ bad. */
const Choice: React.FC<{ title: string; lines: [boolean, string][]; accent: string; onClick: () => void }> = ({ title, lines, accent, onClick }) => (
  <button
    onClick={onClick}
    style={{
      display: 'block',
      width: '100%',
      textAlign: 'left',
      marginTop: '10px',
      padding: '10px 12px',
      background: '#fff',
      border: '1px solid #E2E8F0',
      borderLeft: `5px solid ${accent}`,
      borderRadius: '10px',
      font: 'inherit',
      color: '#0F172A',
      cursor: 'pointer'
    }}
  >
    <b style={{ display: 'block', fontSize: '15px', marginBottom: '4px' }}>{title}</b>
    {lines.map(([good, text]) => (
      <div key={text} style={{ display: 'flex', gap: '6px', fontSize: '13px', lineHeight: 1.5 }}>
        <span style={{ color: good ? '#15803D' : '#B91C1C' }}>{good ? '▲' : '▼'}</span>
        <span>{text}</span>
      </div>
    ))}
  </button>
);

/**
 * The state's two calls: when it asks for records (Questions) and when it opens an inquiry. Self-report now, or
 * say nothing; "Decide later" leaves it on the Hub and in Team › Compliance.
 */
export const ComplianceDecisionSheet: React.FC = () => {
  const { compliance, leagueTeams, userTeamId, selfReport, deferComplianceDecision } = useGameStore();
  const decision = compliance.pendingDecision;
  if (!decision || compliance.decisionDeferred) return null;
  const team = leagueTeams.find((t) => t.id === userTeamId);
  const inquiry = decision === 'INQUIRY';
  const terms = SELF_REPORT[compliance.stage];
  const sayNothing = () => useGameStore.setState({ compliance: { ...compliance, pendingDecision: null, decisionDeferred: false } });
  return (
    <Sheet
      title={inquiry ? 'A formal inquiry is open' : 'The state has questions'}
      subtitle={`Compliance · ${inquiry ? 'Inquiry' : 'Questions'}${team ? ` · ${team.name}` : ''}`}
      dismissible={false}
      footer={
        <div style={{ textAlign: 'center' }}>
          <button onClick={deferComplianceDecision} style={{ background: 'none', border: 'none', color: '#475569', fontSize: '14px', textDecoration: 'underline', cursor: 'pointer', minHeight: '40px' }}>
            Decide later
          </button>
        </div>
      }
    >
      <StageMeter stage={compliance.stage} />
      <p style={{ margin: '10px 0 0', fontSize: '14px', lineHeight: 1.5, color: '#334155' }}>
        {inquiry
          ? 'State investigators opened an inquiry into your recruiting. It can run up to 3 seasons and may find something any week.'
          : 'The state association asked for your recruiting records. Someone has been talking about your boosters.'}
      </p>
      <Choice
        title="Self-report now"
        accent="#2563EB"
        onClick={selfReport}
        lines={[
          [false, `Fine ${formatCP(terms.fine)}`],
          [false, terms.ineligible ? 'Paid players ruled ineligible' : `Paid players sit ${terms.gamesOut} games`],
          ...(terms.probationSeasons ? ([[false, `${terms.probationSeasons} season of probation`]] as [boolean, string][]) : []),
          [true, inquiry ? 'No playoff ban, evidence cleared' : 'All evidence cleared']
        ]}
      />
      <Choice
        title={inquiry ? 'Ride it out' : 'Say nothing'}
        accent="#DC2626"
        onClick={sayNothing}
        lines={
          inquiry
            ? [
                [true, 'No fine now'],
                [false, 'If they find it: ineligible players, up to 2 seasons of probation and a playoff ban']
              ]
            : [
                [true, 'No fine, no suspensions now'],
                [false, 'The questions may become a formal inquiry']
              ]
        }
      />
    </Sheet>
  );
};

/** The contract's final review, shown as it ends: nothing found, or vacated wins and a lower Hall of Fame score. */
export const FinalReviewSheet: React.FC = () => {
  const { compliance, dismissFinalReview } = useGameStore();
  const review = compliance.finalReview;
  if (!review) return null;
  return (
    <Sheet
      title="Final review"
      subtitle={`Contract complete · ${review.school}`}
      onClose={dismissFinalReview}
      footer={
        <button className="ui-btn ui-btn-block" style={{ background: '#2563EB', color: '#fff', borderColor: '#2563EB' }} onClick={dismissFinalReview}>
          Done
        </button>
      }
    >
      <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>As your contract ends, the state reviewed your program&apos;s recruiting.</p>
      {review.found ? (
        <>
          <div style={{ marginTop: '10px', padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', color: '#7F1D1D', fontSize: '14px' }}>
            <b style={{ display: 'block' }}>Improper booster offers found</b>
            {review.vacatedWins} {review.vacatedWins === 1 ? 'win' : 'wins'} vacated: your Hall of Fame score drops from {review.scoreBefore} to {review.scoreAfter}.
          </div>
          <p style={{ margin: '10px 0 0', fontSize: '13px', color: '#475569' }}>{review.school} serves recruiting probation next season. Your next contract starts clean.</p>
        </>
      ) : (
        <div style={{ marginTop: '10px', padding: '10px 12px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', color: '#14532D', fontSize: '14px' }}>
          <b style={{ display: 'block' }}>Nothing found</b>
          Your Hall of Fame entry stands as it is.
        </div>
      )}
    </Sheet>
  );
};
