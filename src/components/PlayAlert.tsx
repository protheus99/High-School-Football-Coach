import React, { useEffect } from 'react';
import { readableOnWhite } from '../utils/color';
import { PlayAlertData, PlayAlertKind, alertLabel, alertTone } from '../sim/playAlerts';

/** How long each banner stays up (ms): big moments linger. */
const DURATION: Record<PlayAlertKind, number> = {
  FIRST_DOWN: 1300,
  TOUCHDOWN: 2400,
  INTERCEPTION: 2000,
  FUMBLE: 2000,
  FIELD_GOAL: 1800,
  FG_MISSED: 1500,
  FG_BLOCKED: 1700,
  SAFETY: 2000,
  TURNOVER_ON_DOWNS: 1800,
  PUNT: 1400
};

/**
 * A flashing banner for big moments, shown in the message strip under the field. It dismisses itself
 * and never covers the scoreboard or the play-calling buttons.
 */
export const PlayAlert: React.FC<{ alert: PlayAlertData; userTeamId?: string; onDone: () => void }> = ({ alert, userTeamId, onDone }) => {
  useEffect(() => {
    const timer = setTimeout(onDone, DURATION[alert.kind]);
    return () => clearTimeout(timer);
  }, [alert, onDone]);

  const tone = alertTone(alert, userTeamId);
  const big = alert.kind === 'TOUCHDOWN';
  // Routine changes of possession: noticeable, not dramatic ("<team> ball" says who takes over)
  const small = alert.kind === 'PUNT' || alert.kind === 'FG_MISSED';

  return (
    <div
      key={alert.id}
      role="status"
      aria-live="assertive"
      data-alert-id={alert.id}
      data-alert-kind={alert.kind}
      data-alert-tone={tone}
      className={`play-alert play-alert-${tone}${big ? ' play-alert-big' : ''}${small ? ' play-alert-small' : ''}`}
      style={{ borderColor: alert.team.primaryColor || '#0F172A' }}
    >
      <span className="play-alert-title">{alertLabel(alert, tone)}</span>
      <span className="play-alert-team" style={{ color: readableOnWhite(alert.team.primaryColor, alert.team.secondaryColor) }}>
        {small ? `${alert.team.name} ball` : alert.team.name}
      </span>
    </div>
  );
};
