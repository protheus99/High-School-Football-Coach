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
  TURNOVER_ON_DOWNS: 'TURNOVER ON DOWNS!'
};

/** How long each banner stays up (ms): big moments linger. */
const DURATION: Record<PlayAlertKind, number> = {
  FIRST_DOWN: 1300,
  TOUCHDOWN: 2400,
  INTERCEPTION: 2000,
  FUMBLE: 2000,
  FIELD_GOAL: 1800,
  SAFETY: 2000,
  TURNOVER_ON_DOWNS: 1800
};

/**
 * A flashing banner over the field for big moments. It ignores taps (the game stays playable underneath)
 * and dismisses itself.
 */
export const PlayAlert: React.FC<{ alert: PlayAlertData | null; onDone: () => void }> = ({ alert, onDone }) => {
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(onDone, DURATION[alert.kind]);
    return () => clearTimeout(timer);
  }, [alert, onDone]);

  if (!alert) return null;
  const color = alert.team.primaryColor || '#0F172A';
  const text = (luminance(color) ?? 0) > 0.45 ? '#0F172A' : '#FFFFFF';
  const big = alert.kind === 'TOUCHDOWN';

  return (
    <div className="play-alert-layer" role="status" aria-live="assertive">
      <div
        key={alert.id}
        className={`play-alert${big ? ' play-alert-big' : ''}`}
        style={{ background: color, color: text, borderColor: alert.team.secondaryColor || '#FACC15' }}
      >
        <div className="play-alert-title">{LABELS[alert.kind]}</div>
        <div className="play-alert-team">{alert.team.name}</div>
      </div>
    </div>
  );
};
