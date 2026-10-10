import React, { useEffect, useState } from 'react';
import { musicPlayer, useNowPlaying } from '../utils/musicPlayer';
import { NOW_PLAYING_STYLES, setMusicSettings, useMusicSettings } from '../utils/musicSettings';
import { Song, loadSoundtrack } from '../utils/soundtrack';

/**
 * Settings › Music: on or off, the volume, the Now Playing pop-up's style, skip, and the song list (credits).
 * The choices stay in this browser for every career.
 */
export const MusicSettingsPanel: React.FC = () => {
  const { enabled, volume, popupStyle } = useMusicSettings();
  const { song } = useNowPlaying();
  const [songs, setSongs] = useState<Song[] | null>(null);
  const [showList, setShowList] = useState(false);
  useEffect(() => {
    void loadSoundtrack().then(setSongs);
  }, []);

  return (
    <div className="ui-stack" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span className="ui-label" style={{ margin: 0 }}>
          🎵 Music
        </span>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Music"
          onClick={() => setMusicSettings({ enabled: !enabled })}
          style={{ ...toggle, background: enabled ? '#16A34A' : '#CBD5E1' }}
        >
          <span style={{ ...knob, transform: enabled ? 'translateX(22px)' : 'translateX(0)' }} />
        </button>
      </div>
      <div style={{ fontSize: '13px', color: '#475569' }}>
        {songs === null
          ? 'Loading the soundtrack…'
          : songs.length === 0
            ? 'No songs yet: add MP3s and their list to public/music.'
            : enabled
              ? song
                ? `Now playing: ${song.title} · ${song.artist}`
                : `${songs.length} song${songs.length === 1 ? '' : 's'}: music plays on every screen except during games.`
              : 'Music is off.'}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#334155', opacity: enabled ? 1 : 0.5 }}>
        Volume
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(volume * 100)}
          disabled={!enabled}
          onChange={(e) => setMusicSettings({ volume: Number(e.target.value) / 100 })}
          style={{ flex: 1 }}
          aria-label="Music volume"
        />
        <span style={{ width: '36px', textAlign: 'right', fontWeight: 700 }}>{Math.round(volume * 100)}%</span>
      </label>

      <div>
        <div style={{ fontSize: '13px', color: '#334155', marginBottom: '6px' }}>Now Playing pop-up</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }} role="radiogroup" aria-label="Now Playing pop-up style">
          {NOW_PLAYING_STYLES.map((s) => (
            <button key={s.id} role="radio" aria-checked={popupStyle === s.id} title={s.help} onClick={() => setMusicSettings({ popupStyle: s.id })} style={choice(popupStyle === s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button className="ui-btn" onClick={() => musicPlayer.skip()} disabled={!enabled || !song}>
          ⏭ Skip song
        </button>
        {songs && songs.length > 0 && (
          <button className="ui-btn" onClick={() => setShowList(!showList)} aria-expanded={showList}>
            {showList ? 'Hide' : 'Show'} the soundtrack
          </button>
        )}
      </div>
      {showList && songs && (
        <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#334155' }}>
          {songs.map((s) => (
            <li key={s.file}>
              <b>{s.title}</b> · {s.artist}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

const toggle: React.CSSProperties = {
  position: 'relative',
  width: '50px',
  height: '28px',
  borderRadius: '999px',
  border: 'none',
  padding: '3px',
  cursor: 'pointer',
  flex: '0 0 auto'
};
const knob: React.CSSProperties = {
  display: 'block',
  width: '22px',
  height: '22px',
  borderRadius: '50%',
  background: '#fff',
  boxShadow: '0 1px 3px rgba(0,0,0,.3)',
  transition: 'transform 0.15s ease'
};
const choice = (on: boolean): React.CSSProperties => ({
  minHeight: '40px',
  borderRadius: '8px',
  border: on ? '2px solid #2563EB' : '1px solid #CBD5E1',
  background: on ? '#EFF6FF' : '#fff',
  color: on ? '#1D4ED8' : '#0F172A',
  fontWeight: 700,
  fontSize: '13px',
  cursor: 'pointer'
});
