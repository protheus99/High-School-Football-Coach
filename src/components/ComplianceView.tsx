import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { formatCP } from '../sim/coachPoints';
import { BOOSTER_OFFERS, COMPLIANCE_TRAINING, ComplianceStage, RECORDS_CLEANUP, SELF_REPORT, STAGE_LABELS, STAGE_ORDER } from '../sim/compliance';
import { STAGE_COLORS, selfReportSummary, stageDescription } from '../utils/complianceText';

/** The stage meter: Quiet, Whispers, Questions, Inquiry, filled up to the current stage. */
export const StageMeter: React.FC<{ stage: ComplianceStage }> = ({ stage }) => {
  const at = STAGE_ORDER.indexOf(stage);
  return (
    <div aria-label={`Stage: ${STAGE_LABELS[stage]}`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px', margin: '8px 0 4px' }}>
        {STAGE_ORDER.map((s, i) => (
          <div key={s} style={{ height: '8px', borderRadius: '4px', background: i <= at ? STAGE_COLORS[stage] : '#E2E8F0' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px', fontSize: '11px', color: '#64748B', textAlign: 'center' }}>
        {STAGE_ORDER.map((s) => (
          <span key={s} style={{ fontWeight: s === stage ? 'bold' : 'normal', color: s === stage ? STAGE_COLORS[stage] : undefined }}>
            {STAGE_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  );
};

/**
 * Team › Compliance: where the state's attention stands (the hidden numbers stay hidden), what people are
 * saying, who the boosters paid, clean-up purchases, and self-reporting.
 */
export const ComplianceView: React.FC = () => {
  const { compliance, coachPoints, currentYear, holdComplianceTraining, cleanUpRecords, selfReport } = useGameStore();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const { stage } = compliance;
  const trainingDone = compliance.trainingSeason === currentYear;
  const cleanupDone = compliance.cleanupSeason === currentYear;
  const fine = SELF_REPORT[stage].fine;

  return (
    <div className="ui-screen">
      {done && (
        <div role="status" style={{ ...card, borderLeft: '5px solid #2563EB', background: '#EFF6FF' }}>
          {done}
        </div>
      )}
      {coachPoints < 0 && (
        <div role="alert" style={{ ...card, background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#7F1D1D' }}>
          Your Coach Points are below zero ({formatCP(coachPoints)}). Nothing that costs CP can be bought until your weekly income brings them back up.
        </div>
      )}

      <div style={{ ...card, borderLeft: `5px solid ${STAGE_COLORS[stage]}` }}>
        <div style={cardTitle}>⚖️ {STAGE_LABELS[stage]}</div>
        <div style={muted}>{stageDescription(stage, compliance.inquiryWeeks)}</div>
        <StageMeter stage={stage} />
      </div>

      {compliance.pendingDecision && compliance.decisionDeferred && (
        <div style={{ ...card, borderLeft: '5px solid #EA580C', background: '#FFF7ED' }}>
          <div style={cardTitle}>{compliance.pendingDecision === 'INQUIRY' ? 'A formal inquiry is open' : 'The state has questions'}</div>
          <div style={muted}>You chose to decide later. Self-report below, or say nothing and let it ride.</div>
          <button className="ui-btn" style={{ marginTop: '8px' }} onClick={() => useGameStore.setState({ compliance: { ...compliance, decisionDeferred: false } })}>
            Review the choice
          </button>
        </div>
      )}

      <div style={card}>
        <div style={cardTitle}>📰 What people are saying</div>
        {compliance.hints.length === 0 ? (
          <div style={muted}>No talk about your program.</div>
        ) : (
          compliance.hints.map((h, i) => (
            <div key={i} style={{ fontSize: '13px', color: '#334155', padding: '4px 0', borderTop: i ? '1px solid #F1F5F9' : 'none' }}>
              {h.text}
              <span style={{ color: '#94A3B8', fontSize: '12px' }}> · {h.year} Wk {h.week}</span>
            </div>
          ))
        )}
      </div>

      <div style={card}>
        <div style={cardTitle}>🚩 Booster offers</div>
        {compliance.offers.length === 0 ? (
          <div style={muted}>No booster offers this contract.</div>
        ) : (
          compliance.offers.map((r) => (
            <div key={r.prospectId} style={{ fontSize: '13px', color: '#334155', padding: '4px 0' }}>
              <b>{r.name}</b> · {r.position} · {r.offers.map((o) => BOOSTER_OFFERS[o].label).join(', ')}
              <span style={{ color: '#94A3B8', fontSize: '12px' }}> · {r.season}</span>
            </div>
          ))
        )}
      </div>

      <div style={card}>
        <div style={cardTitle}>🛡️ Clean up</div>
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '4px' }}>Compliance training · {formatCP(COMPLIANCE_TRAINING.cost)} · once a season</div>
        <div style={muted}>The program learns the rules: suspicion cools right away.</div>
        <button
          className="ui-btn ui-btn-block"
          style={{ marginTop: '8px', ...(trainingDone || coachPoints < COMPLIANCE_TRAINING.cost ? {} : primaryBtn('#2563EB')) }}
          disabled={trainingDone || coachPoints < COMPLIANCE_TRAINING.cost}
          onClick={() => {
            holdComplianceTraining();
            setDone('Compliance training held: the talk around your program cools down.');
          }}
        >
          {trainingDone ? 'Done this season' : coachPoints < COMPLIANCE_TRAINING.cost ? `Needs ${formatCP(COMPLIANCE_TRAINING.cost)}` : `Hold compliance training · ${formatCP(COMPLIANCE_TRAINING.cost)}`}
        </button>
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginTop: '14px' }}>Records cleanup · {formatCP(RECORDS_CLEANUP.cost)} · once a season</div>
        <div style={muted}>Tidy the paperwork: less evidence, a lighter penalty if they find it.</div>
        <button
          className="ui-btn ui-btn-block"
          style={{ marginTop: '8px', ...(cleanupDone || coachPoints < RECORDS_CLEANUP.cost ? {} : primaryBtn('#0F766E')) }}
          disabled={cleanupDone || coachPoints < RECORDS_CLEANUP.cost}
          onClick={() => {
            cleanUpRecords();
            setDone('Records cleaned up: there is less for anyone to find.');
          }}
        >
          {cleanupDone ? 'Done this season' : coachPoints < RECORDS_CLEANUP.cost ? `Needs ${formatCP(RECORDS_CLEANUP.cost)}` : `Clean up the records · ${formatCP(RECORDS_CLEANUP.cost)}`}
        </button>
      </div>

      <div style={{ ...card, background: '#FEF2F2', border: '1px solid #FCA5A5' }}>
        <div style={{ ...cardTitle, color: '#991B1B' }}>📄 Self-report</div>
        <div style={{ fontSize: '13px', color: '#7F1D1D', lineHeight: 1.5 }}>{selfReportSummary(stage)} Reporting earlier always costs less.</div>
        {confirm ? (
          <div style={{ marginTop: '8px', padding: '8px', background: '#fff', border: '1px solid #FCA5A5', borderRadius: '8px', fontSize: '13px', color: '#7F1D1D' }}>
            Self-report to the state association now?{coachPoints - fine < 0 ? ` The fine takes your Coach Points to ${formatCP(coachPoints - fine)}.` : ''}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button
                className="ui-btn"
                style={primaryBtn('#DC2626')}
                onClick={() => {
                  selfReport();
                  setConfirm(false);
                  setDone('Self-report filed. The slate is clean: the state has what it needs.');
                }}
              >
                Self-report
              </button>
              <button className="ui-btn" onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="ui-btn ui-btn-block" style={{ marginTop: '8px', ...primaryBtn('#DC2626') }} onClick={() => setConfirm(true)}>
            Self-report to the state association
          </button>
        )}
      </div>
    </div>
  );
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #E2E8F0',
  borderRadius: '10px',
  padding: '12px',
  marginBottom: '10px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)'
};
const cardTitle: React.CSSProperties = { fontSize: '16px', fontWeight: 'bold', color: '#0F172A', marginBottom: '4px' };
const muted: React.CSSProperties = { fontSize: '13px', color: '#64748B' };
const primaryBtn = (background: string): React.CSSProperties => ({ background, color: '#fff', borderColor: background });
