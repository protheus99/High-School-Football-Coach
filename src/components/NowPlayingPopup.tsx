import React, { useEffect, useRef, useState } from 'react';
import { musicPlayer, useNowPlaying } from '../utils/musicPlayer';
import { NowPlayingStyle, setMusicSettings, useMusicSettings } from '../utils/musicSettings';
import { Song, coverUrl, songColor, songInitials } from '../utils/soundtrack';
import { onNowPlayingRequest } from '../utils/nowPlayingRequests';

const SHOW_FOR = 5000; // ms on screen when a song starts
const SHOW_ON_REQUEST = 8000; // ms on screen when the coach taps 🎵 in the top bar
const SLIDE = 450; // ms for the slide out


/**
 * "Now Playing", the way sports games do it: when a song starts, a card slides in at the bottom right (above the
 * tab bar), shows the cover, the song and the artist for a few seconds, then slides away. Three styles (Settings).
 * The card has a mute button and a next-song button, stays up while the coach's finger or mouse is on it, and the
 * top bar's 🎵 brings it up any time.
 */
export const NowPlayingPopup: React.FC = () => {
  const { song, playId } = useNowPlaying();
  const { popupStyle, enabled, muted } = useMusicSettings();
  const [shown, setShown] = useState<{ song: Song | null; key: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const [request, setRequest] = useState(0); // bumps when 🎵 is tapped
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const holding = useRef(false); // a finger or the mouse is on the card

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const hideAfter = (ms: number) => {
    clearTimers();
    timers.current = [
      setTimeout(() => {
        if (!holding.current) setVisible(false);
      }, ms),
      setTimeout(() => {
        if (!holding.current) setShown(null);
      }, ms + SLIDE)
    ];
  };
  const showFor = (next: Song | null, ms: number) => {
    setShown({ song: next, key: Date.now() });
    hideAfter(ms); // (clears any earlier timers first)
    timers.current.push(setTimeout(() => setVisible(true), 30));
  };

  // A new song: up for a few seconds
  useEffect(() => {
    if (!song || !enabled) {
      setVisible(false);
      return;
    }
    clearTimers();
    showFor(song, SHOW_FOR);
    return clearTimers;
  }, [song, playId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🎵 in the top bar: up for longer (music that hasn't started yet starts now)
  useEffect(() => {
    return onNowPlayingRequest(() => setRequest((n) => n + 1));
  }, []);
  useEffect(() => {
    if (request === 0) return;
    musicPlayer.unlock();
    clearTimers();
    showFor(musicPlayer.getState().song, SHOW_ON_REQUEST);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null;
  const s = enabled ? shown.song : null;
  const hold = () => {
    holding.current = true;
    clearTimers();
  };
  const release = () => {
    holding.current = false;
    hideAfter(2500);
  };
  return (
    <div
      className={`ui-now-playing${visible ? ' ui-now-playing-in' : ''}`}
      role="group"
      aria-label={s ? `Now playing: ${s.title} by ${s.artist}` : 'Music'}
      onPointerEnter={hold}
      onPointerLeave={release}
      onFocus={hold}
      onBlur={release}
      style={{ cursor: 'default' }}
    >
      {s ? <Card song={s} style={popupStyle} muted={muted} /> : <MusicOff enabled={enabled} />}
    </div>
  );
};

/** Mute (the music keeps playing, silently) and next song: on every style of card. */
const Controls: React.FC<{ muted: boolean; dark: boolean; accent: string; accentText: string }> = ({ muted, dark, accent, accentText }) => (
  <>
    <button
      onClick={() => setMusicSettings({ muted: !muted })}
      aria-label={muted ? 'Unmute music' : 'Mute music'}
      aria-pressed={muted}
      title={muted ? 'Unmute' : 'Mute'}
      style={{ ...roundBtn, background: dark ? 'rgba(255,255,255,.12)' : '#F1F5F9', color: dark ? '#fff' : '#0F172A' }}
    >
      {muted ? '🔇' : '🔊'}
    </button>
    <button onClick={() => musicPlayer.skip()} aria-label="Next song" title="Next song" style={{ ...roundBtn, background: accent, color: accentText, fontWeight: 900 }}>
      ⏭
    </button>
  </>
);

/** 🎵 with the music off (or not started): a way to turn it on. */
const MusicOff: React.FC<{ enabled: boolean }> = ({ enabled }) => (
  <span style={{ ...row, ...ring, gap: '10px', background: '#0F172A', color: '#fff', borderRadius: '12px', padding: '10px 12px', width: '250px', borderLeft: '4px solid #F59E0B', boxShadow: '0 8px 24px rgba(15,23,42,.35)' }}>
    <span style={text}>
      <span style={{ ...label, color: '#F59E0B' }}>MUSIC</span>
      <span style={{ ...line, fontSize: '14px', fontWeight: 800 }}>{enabled ? 'Starting the music…' : 'Music is off'}</span>
    </span>
    {!enabled && (
      <button onClick={() => setMusicSettings({ enabled: true })} style={{ ...roundBtn, width: 'auto', borderRadius: '8px', padding: '0 12px', background: '#F59E0B', color: '#0F172A', fontWeight: 800 }}>
        Turn on
      </button>
    )}
  </span>
);

const Card: React.FC<{ song: Song; style: NowPlayingStyle; muted: boolean }> = ({ song, style, muted }) => {
  if (style === 'VINYL')
    return (
      <span style={{ ...row, ...ring, background: 'rgba(15,23,42,.92)', color: '#fff', borderRadius: '999px', padding: '5px', maxWidth: '300px', boxShadow: '0 6px 18px rgba(15,23,42,.3)' }}>
        <Cover song={song} size={36} round />
        <span style={{ ...text, maxWidth: '150px' }}>
          <span style={{ ...line, fontSize: '13px', fontWeight: 800 }}>♪ {song.title}</span>
          <span style={{ ...line, fontSize: '11px', color: '#CBD5E1' }}>{muted ? 'Muted' : song.artist}</span>
        </span>
        <Controls muted={muted} dark accent="#fff" accentText="#0F172A" />
      </span>
    );
  if (style === 'BIG_COVER')
    return (
      <span style={{ ...row, gap: '10px', background: '#fff', color: '#0F172A', borderRadius: '14px', padding: '10px', width: '300px', border: '1px solid #E2E8F0', boxShadow: '0 10px 28px rgba(15,23,42,.3)' }}>
        <Cover song={song} size={72} />
        <span style={text}>
          <span style={{ ...label, color: '#2563EB' }}>{muted ? 'MUTED' : 'NOW PLAYING'}</span>
          <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '15px', fontWeight: 800, lineHeight: 1.2 }}>{song.title}</span>
          <span style={{ ...line, fontSize: '12px', color: '#475569' }}>{song.artist}</span>
        </span>
        <Controls muted={muted} dark={false} accent="#2563EB" accentText="#fff" />
      </span>
    );
  // CLASSIC (the default)
  return (
    <span style={{ ...row, ...ring, gap: '10px', background: '#0F172A', color: '#fff', borderRadius: '12px', padding: '8px', width: '300px', borderLeft: '4px solid #F59E0B', boxShadow: '0 8px 24px rgba(15,23,42,.35)' }}>
      <Cover song={song} size={52} />
      <span style={text}>
        <span style={{ ...label, color: '#F59E0B', display: 'flex', alignItems: 'center' }}>
          <span className="ui-eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {muted ? 'MUTED' : 'NOW PLAYING'}
        </span>
        <span style={{ ...line, fontSize: '14px', fontWeight: 800 }}>{song.title}</span>
        <span style={{ ...line, fontSize: '12px', color: '#CBD5E1' }}>{song.artist}</span>
      </span>
      <Controls muted={muted} dark accent="#F59E0B" accentText="#0F172A" />
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

// A faint edge so the dark cards stand out on the dark title screen too
const ring: React.CSSProperties = { outline: '1px solid rgba(255,255,255,.14)', outlineOffset: '-1px' };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px', textAlign: 'left' };
const text: React.CSSProperties = { display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 };
const line: React.CSSProperties = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const label: React.CSSProperties = { fontSize: '10px', fontWeight: 800, letterSpacing: '0.08em' };
const roundBtn: React.CSSProperties = {
  font: 'inherit', // first, so the size below wins
  flex: '0 0 40px',
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '15px',
  cursor: 'pointer'
};
