import React, { useEffect, useState } from 'react';
import { musicPlayer, useNowPlaying } from '../utils/musicPlayer';
import { NowPlayingStyle, useMusicSettings } from '../utils/musicSettings';
import { Song, coverUrl, songColor, songInitials } from '../utils/soundtrack';

const SHOW_FOR = 5000; // ms on screen per song
const SLIDE = 450; // ms for the slide out

/**
 * "Now Playing", the way sports games do it: when a song starts, a card slides in at the bottom right (above the
 * tab bar), shows the cover, the song and the artist for a few seconds, then slides away. Three styles (Settings);
 * a tap skips to the next song.
 */
export const NowPlayingPopup: React.FC = () => {
  const { song, playId } = useNowPlaying();
  const { popupStyle, enabled } = useMusicSettings();
  const [shown, setShown] = useState<{ song: Song; playId: number } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!song || !enabled) {
      setVisible(false);
      return;
    }
    setShown({ song, playId });
    const enter = setTimeout(() => setVisible(true), 30);
    const leave = setTimeout(() => setVisible(false), SHOW_FOR);
    const clear = setTimeout(() => setShown(null), SHOW_FOR + SLIDE);
    return () => [enter, leave, clear].forEach(clearTimeout);
  }, [song, playId, enabled]);

  if (!shown) return null;
  const s = shown.song;
  return (
    <button
      className={`ui-now-playing${visible ? ' ui-now-playing-in' : ''}`}
      onClick={() => musicPlayer.skip()}
      aria-label={`Now playing: ${s.title} by ${s.artist}. Tap to skip.`}
      title="Tap to skip"
    >
      <Card song={s} style={popupStyle} />
    </button>
  );
};

const Card: React.FC<{ song: Song; style: NowPlayingStyle }> = ({ song, style }) => {
  if (style === 'VINYL')
    return (
      <span style={{ ...row, ...ring, background: 'rgba(15,23,42,.92)', color: '#fff', borderRadius: '999px', padding: '5px 14px 5px 5px', maxWidth: '260px', boxShadow: '0 6px 18px rgba(15,23,42,.3)' }}>
        <Cover song={song} size={36} round />
        <span style={text}>
          <span style={{ ...line, fontSize: '13px', fontWeight: 800 }}>♪ {song.title}</span>
          <span style={{ ...line, fontSize: '11px', color: '#CBD5E1' }}>{song.artist}</span>
        </span>
      </span>
    );
  if (style === 'BIG_COVER')
    return (
      <span style={{ ...row, gap: '10px', background: '#fff', color: '#0F172A', borderRadius: '14px', padding: '10px', width: '270px', border: '1px solid #E2E8F0', boxShadow: '0 10px 28px rgba(15,23,42,.3)' }}>
        <Cover song={song} size={72} />
        <span style={text}>
          <span style={{ ...label, color: '#2563EB' }}>NOW PLAYING</span>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '15px', fontWeight: 800, lineHeight: 1.2 }}>{song.title}</span>
          <span style={{ ...line, fontSize: '12px', color: '#475569' }}>{song.artist}</span>
        </span>
        <span aria-hidden="true" style={{ flex: '0 0 32px', width: '32px', height: '32px', borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>
          ⏭
        </span>
      </span>
    );
  // CLASSIC (the default)
  return (
    <span style={{ ...row, ...ring, gap: '10px', background: '#0F172A', color: '#fff', borderRadius: '12px', padding: '8px 12px 8px 8px', width: '250px', borderLeft: '4px solid #F59E0B', boxShadow: '0 8px 24px rgba(15,23,42,.35)' }}>
      <Cover song={song} size={52} />
      <span style={text}>
        <span style={{ ...label, color: '#F59E0B', display: 'flex', alignItems: 'center' }}>
          <span className="ui-eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          NOW PLAYING
        </span>
        <span style={{ ...line, fontSize: '14px', fontWeight: 800 }}>{song.title}</span>
        <span style={{ ...line, fontSize: '12px', color: '#CBD5E1' }}>{song.artist}</span>
        <Progress />
      </span>
    </span>
  );
};

/** The song's cover, or its initials on a color of its own when there's no image (or it fails to load). */
const Cover: React.FC<{ song: Song; size: number; round?: boolean }> = ({ song, size, round }) => {
  const [failed, setFailed] = useState(false);
  const url = coverUrl(song);
  const box: React.CSSProperties = {
    flex: `0 0 ${size}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: round ? '50%' : '8px',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: songColor(song.title),
    color: '#fff',
    fontWeight: 900,
    fontSize: `${Math.round(size / 2.8)}px`,
    ...(round && { animation: 'ui-spin 4s linear infinite', boxShadow: `inset 0 0 0 ${Math.round(size / 6)}px rgba(0,0,0,.35)` })
  };
  return (
    <span style={box} aria-hidden="true">
      {url && !failed ? (
        <img src={url} alt="" onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        songInitials(song.title)
      )}
    </span>
  );
};

/** How far into the song, moving for the few seconds the card is up. */
const Progress: React.FC = () => {
  const [width, setWidth] = useState(() => musicPlayer.progress());
  useEffect(() => {
    const duration = musicPlayer.duration();
    const id = setTimeout(() => setWidth(Math.min(1, musicPlayer.progress() + (duration > 0 ? SHOW_FOR / 1000 / duration : 0.03))), 50);
    return () => clearTimeout(id);
  }, []);
  return (
    <span style={{ display: 'block', height: '3px', background: 'rgba(255,255,255,.18)', borderRadius: '2px', overflow: 'hidden', marginTop: '6px' }}>
      <span style={{ display: 'block', height: '100%', width: `${width * 100}%`, background: '#F59E0B', transition: `width ${SHOW_FOR}ms linear` }} />
    </span>
  );
};

// A faint edge so the dark cards stand out on the dark title screen too
const ring: React.CSSProperties = { outline: '1px solid rgba(255,255,255,.14)', outlineOffset: '-1px' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' };
const text: React.CSSProperties = { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 };
const line: React.CSSProperties = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const label: React.CSSProperties = { fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em' };
