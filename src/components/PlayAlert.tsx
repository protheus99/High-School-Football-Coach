import React, { useEffect } from 'react';
import { luminance } from '../utils/color';
import { PlayAlertData, PlayAlertKind } from '../sim/playAlerts';

const LABELS: Record<PlayAlertKind, string> = {
  FIRST_DOWN: 'FIRST DOWN!',
  TOUCHDOWN: 'TOUCHDOWN!',
  INTERCEPTION: 'INTERCEPTION!',
  FUMBLE: 'FUMBLE!',
  FIELD_GOAL: "IT'S GOOD!",
  SAFETY: 'SAFETY!',
  TURNOVER_ON_DOWNS: 'TURNOVER ON DOWNS!',
  PUNT: 'PUNT'
};

/** How long each banner stays up (ms): big moments linger. */
const DURATION: Record<PlayAlertKind, number> = {
  FIRST_DOWN: 1300,
  TOUCHDOWN: 2400,
  INTERCEPTION: 2000,
  FUMBLE: 2000,
  FIELD_GOAL: 1800,
  SAFETY: 2000,
  TURNOVER_ON_DOWNS: 1800,
  PUNT: 1400
};

/**
 * A flashing banner for big moments, shown in the message strip under the field. It dismisses itself
 * and never covers the scoreboard or the play-calling buttons.
 */
export const PlayAlert: React.FC<{ alert: PlayAlertData; onDone: () => void }> = ({ alert, onDone }) => {
  useEffect(() => {
    const timer = setTimeout(onDone, DURATION[alert.kind]);
    return () => clearTimeout(timer);
  }, [alert, onDone]);

  const color = alert.team.primaryColor || '#0F172A';
  const text = (luminance(color) ?? 0) > 0.45 ? '#0F172A' : '#FFFFFF';
  const big = alert.kind === 'TOUCHDOWN';
  const small = alert.kind === 'PUNT'; // a routine change of possession: noticeable, not dramatic

  return (
    <div
      key={alert.id}
      role="status"
      aria-live="assertive"
      className={`play-alert${big ? ' play-alert-big' : ''}${small ? ' play-alert-small' : ''}`}
      style={{ background: color, color: text, borderColor: alert.team.secondaryColor || '#FACC15' }}
    >
      <span className="play-alert-title">{LABELS[alert.kind]}</span>
      <span className="play-alert-team">{small ? `${alert.team.name} ball` : alert.team.name}</span>
    </div>
  );
};
