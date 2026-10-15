/**
 * Zero-dependency procedural sound synthesizer using the native Web Audio API: the live game's whistles, thuds,
 * kicks, stings, the band's touchdown hit and its victory and loss tunes. Nothing is a file; every sound is made as
 * it plays (approved by ear in the sound preview, 2026-10-15). Which sound a play gets is decided in playSounds.ts.
 */

import type { GameSound } from './playSounds';

/** A note name ("G4", "Bb3", "G#3") as a frequency in Hz. */
const NOTE_STEPS: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function noteFrequency(name: string): number {
  const m = /^([A-G][b#]?)(\d)$/.exec(name);
  if (!m || NOTE_STEPS[m[1]] === undefined) throw new Error(`Unknown note ${name}`);
  return 440 * Math.pow(2, (NOTE_STEPS[m[1]] + (Number(m[2]) + 1) * 12 - 69) / 12);
}
const N = noteFrequency;

interface ToneOptions {
  type?: OscillatorType;
  to?: number; // glide to this frequency
  glide?: number; // over this many seconds (default: the whole note)
  vol?: number;
  attack?: number;
  hold?: number; // share of the note held at full volume before it fades
  lp?: number; // low-pass filter
  lpFrom?: number; // ...opening from here (a brass attack)
  lpRise?: number;
  lpEnd?: number;
  vib?: number; // vibrato rate (Hz)
}

interface NoiseOptions {
  type?: BiquadFilterType;
  f?: number;
  fTo?: number;
  q?: number;
  vol?: number;
  attack?: number;
  hold?: number;
}

// The level the sounds were approved at (the preview's volume slider)
const MASTER_VOLUME = 0.7;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private initContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_VOLUME;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    return this.ctx;
  }

  /**
   * Starts sound from a tap. iPhones only let a page begin playing sound inside a tap, and the game's first sound comes
   * when a play lands (not on a tap), so the live game calls this on the coach's first touch.
   */
  public unlock(): void {
    const ctx = this.initContext();
    if (!ctx || !this.master) return;
    const silence = ctx.createBufferSource();
    silence.buffer = ctx.createBuffer(1, 1, 22050);
    silence.connect(this.master);
    silence.start(0);
  }

  // --- Building blocks ---------------------------------------------------------------------------------------------

  private tone(freq: number, startIn: number, dur: number, o: ToneOptions = {}): void {
    const ctx = this.initContext();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + startIn;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide ?? dur));
    if (o.vib) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.vib;
      depth.gain.value = freq * 0.012;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const gain = ctx.createGain();
    const vol = o.vol ?? 0.2;
    const attack = o.attack ?? 0.005;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.setValueAtTime(vol, t + Math.max(attack, dur * (o.hold ?? 0)));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out: AudioNode = osc;
    if (o.lp) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      if (o.lpFrom) {
        filter.frequency.setValueAtTime(o.lpFrom, t);
        filter.frequency.exponentialRampToValueAtTime(o.lp, t + (o.lpRise ?? 0.04));
        if (o.lpEnd) filter.frequency.exponentialRampToValueAtTime(o.lpEnd, t + dur);
      } else filter.frequency.value = o.lp;
      osc.connect(filter);
      out = filter;
    }
    out.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(startIn: number, dur: number, o: NoiseOptions = {}): void {
    const ctx = this.initContext();
    if (!ctx || !this.master) return;
    if (!this.noiseBuffer) {
      const length = ctx.sampleRate * 3;
      this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime + startIn;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = o.type ?? 'bandpass';
    filter.frequency.setValueAtTime(o.f ?? 1000, t);
    if (o.fTo) filter.frequency.exponentialRampToValueAtTime(o.fTo, t + dur);
    filter.Q.value = o.q ?? 1;
    const gain = ctx.createGain();
    const vol = o.vol ?? 0.3;
    const attack = o.attack ?? 0.01;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.setValueAtTime(vol, t + Math.max(attack, dur * (o.hold ?? 0)));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
  }

  // The band: brass with a bright attack, a tuba, a drumline
  private brass(freq: number, startIn: number, dur: number, vol = 0.07, bright = 2600): void {
    [1, 1.005].forEach((detune, i) =>
      this.tone(freq * detune, startIn, dur, { type: 'sawtooth', lp: bright, lpFrom: bright * 0.3, lpRise: 0.035, lpEnd: bright * 0.55, vol: i ? vol * 0.7 : vol, attack: 0.02, hold: 0.75 })
    );
  }
  private tuba(freq: number, startIn: number, dur: number, vol = 0.14): void {
    this.tone(freq, startIn, dur, { type: 'sawtooth', lp: 420, vol, attack: 0.02, hold: 0.6 });
  }
  private snare(startIn: number, vol = 0.26): void {
    this.noise(startIn, 0.11, { f: 2100, q: 0.6, vol, attack: 0.002 });
    this.tone(200, startIn, 0.07, { type: 'triangle', to: 150, vol: vol * 0.5, attack: 0.002 });
  }
  private bassDrum(startIn: number, vol = 0.5): void {
    this.tone(105, startIn, 0.2, { to: 45, vol, attack: 0.002 });
  }
  private cymbal(startIn: number, dur = 1.4, vol = 0.12): void {
    this.noise(startIn, dur, { type: 'highpass', f: 6000, vol, attack: 0.002 });
  }
  /** A melody: note names and lengths in eighth notes. */
  private line(startIn: number, eighth: number, notes: [string, number][], vol: number, bright: number): void {
    let t = startIn;
    notes.forEach(([note, length]) => {
      this.brass(N(note), t, length * eighth * 0.92, vol, bright);
      t += length * eighth;
    });
  }

  // --- The game's sounds -------------------------------------------------------------------------------------------

  /** High-frequency referee whistle chirp: penalties, safeties, the halftime talk, the final whistle. */
  public playWhistle(): void {
    const ctx = this.initContext();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2800, ctx.currentTime + 0.08);
    osc.frequency.exponentialRampToValueAtTime(2300, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  }

  /** Deep contact / tackle thud: an ordinary play. */
  public playTackleThud(): void {
    const ctx = this.initContext();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  }

  /** The game stops for the coach's call (4th down, red zone, the try). */
  public playLeverageAlert(): void {
    const ctx = this.initContext();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }

  /** Touchdown: the band's hit, a rising brass fanfare with drums and a cymbal. */
  public playTouchdown(): void {
    const e = 0.11;
    this.line(0, e, [['G4', 1], ['C5', 1], ['E5', 1], ['G5', 5]], 0.08, 3000);
    this.line(0, e, [['E4', 1], ['G4', 1], ['C5', 1], ['E5', 5]], 0.05, 2600);
    this.tuba(N('C3'), 3 * e, 5 * e);
    [0, 1, 2].forEach((i) => this.snare(i * e, 0.2));
    this.bassDrum(3 * e);
    this.cymbal(3 * e, 1.3);
  }

  /** Moving the chains. */
  public playFirstDown(): void {
    this.tone(N('C6'), 0, 0.12, { type: 'triangle', vol: 0.2 });
    this.tone(N('E6'), 0.09, 0.28, { type: 'triangle', vol: 0.2 });
  }

  /** A punt or a field goal leaving the foot. */
  public playKick(startIn = 0): void {
    this.tone(120, startIn, 0.13, { to: 45, vol: 0.6, attack: 0.002 });
    this.noise(startIn, 0.05, { type: 'highpass', f: 2200, vol: 0.22, attack: 0.002 });
  }

  /** A field goal that's good: the kick, then a rising chime. */
  public playFieldGoalGood(): void {
    this.playKick();
    this.tone(N('G5'), 0.6, 0.18, { type: 'triangle', vol: 0.18 });
    this.tone(N('C6'), 0.72, 0.45, { type: 'triangle', vol: 0.2 });
  }

  /** A field goal off the upright. */
  public playDoink(): void {
    this.playKick();
    ([[1250, 0.18], [3080, 0.07], [4710, 0.04]] as const).forEach(([f, v]) => this.tone(f, 0.5, 0.9, { vol: v, attack: 0.001 }));
    this.tone(180, 0.5, 0.1, { to: 90, vol: 0.25, attack: 0.001 });
  }

  /** The coach's team takes the ball away: a quick rising brass sting. */
  public playTakeaway(): void {
    this.brass(N('G4'), 0, 0.07, 0.08);
    this.brass(N('C5'), 0.06, 0.07, 0.08);
    this.brass(N('G5'), 0.12, 0.3, 0.09);
    this.brass(N('E5'), 0.12, 0.3, 0.05);
  }

  /** The coach's team gives the ball away: a quick falling sting. */
  public playGiveaway(): void {
    this.brass(N('E4'), 0, 0.14, 0.07);
    this.brass(N('Eb4'), 0.13, 0.14, 0.07);
    this.tone(N('D4'), 0.26, 0.32, { type: 'sawtooth', lp: 1100, vol: 0.08, attack: 0.02, hold: 0.5, vib: 7 });
  }

  /** The crowd's groan: the coach's team lost the ball or missed a kick. */
  public playGroan(startIn = 0): void {
    this.noise(startIn, 1.5, { type: 'lowpass', f: 1000, fTo: 280, vol: 0.32, attack: 0.12, hold: 0.2 });
    [250, 262, 276, 239].forEach((f, i) => this.tone(f, startIn + i * 0.02, 1.3, { type: 'sawtooth', to: f * 0.6, vol: 0.05, lp: 650, attack: 0.15, hold: 0.25 }));
  }

  /** End of the 1st or 3rd quarter. */
  public playQuarterBuzzer(): void {
    [233, 466].forEach((f, i) => this.tone(f, 0, 1.1, { type: 'square', lp: 1600, vol: i ? 0.04 : 0.09, attack: 0.01, hold: 0.85 }));
  }

  /** The last two minutes of a close game begin. */
  public playClockTicks(): void {
    for (let i = 0; i < 5; i++) {
      this.tone(1900, i * 0.5, 0.05, { vol: i === 4 ? 0.3 : 0.2, attack: 0.001 });
      this.noise(i * 0.5, 0.03, { type: 'highpass', f: 3500, vol: 0.12, attack: 0.001 });
    }
  }

  /** The band after a win (about 5 seconds). */
  public playVictory(startIn = 0): void {
    const e = 0.2;
    const s = startIn;
    this.line(s, e, [['G4', 1], ['C5', 1], ['E5', 1], ['G5', 1], ['E5', 2], ['C5', 1], ['E5', 1], ['G5', 3], ['A5', 1], ['G5', 1], ['F5', 1], ['E5', 1], ['D5', 1],
      ['C5', 1], ['E5', 1], ['G5', 1], ['C6', 1], ['B5', 1], ['G5', 1], ['D5', 1], ['F5', 1], ['E5', 4], ['C6', 4]], 0.075, 3000);
    this.line(s, e, [['E4', 1], ['G4', 1], ['C5', 1], ['E5', 1], ['C5', 2], ['G4', 1], ['C5', 1], ['E5', 3], ['F5', 1], ['E5', 1], ['D5', 1], ['C5', 1], ['B4', 1],
      ['G4', 1], ['C5', 1], ['E5', 1], ['G5', 1], ['G5', 1], ['D5', 1], ['B4', 1], ['D5', 1], ['C5', 4], ['G5', 4]], 0.045, 2400);
    ['C3', 'G3', 'C3', 'G3', 'F3', 'C3', 'G3', 'G3', 'C3', 'E3', 'G3', 'G3', 'C3', 'C3', 'C3', 'C3'].forEach((n, i) => this.tuba(N(n), s + i * 2 * e, 1.6 * e));
    for (let b = 0; b < 16; b++) {
      if (b % 2 === 0) this.bassDrum(s + b * 2 * e);
      this.snare(s + b * 2 * e + e, 0.18);
    }
    const last = s + 24 * e;
    this.cymbal(s, 1);
    this.cymbal(last, 2.2, 0.15);
    this.bassDrum(last, 0.6);
    [0.03, 0.06, 0.09].forEach((d) => this.snare(last - d * 2, 0.12)); // a roll into the last chord
    ['C4', 'E4', 'G4'].forEach((n) => this.brass(N(n), last, 8 * e, 0.035, 2200));
  }

  /** The band after a loss: short, slow and quiet (about 4 seconds). */
  public playDefeat(startIn = 0): void {
    const q = 0.62;
    const s = startIn;
    this.line(s, q / 2, [['E4', 2], ['D4', 1], ['C4', 1], ['B3', 2], ['A3', 4]], 0.05, 1100);
    this.line(s, q / 2, [['C4', 2], ['B3', 1], ['A3', 1], ['G#3', 2], ['E3', 4]], 0.035, 900);
    this.tuba(N('A2'), s, q * 2, 0.1);
    this.tuba(N('E2'), s + q * 2, q * 1.5, 0.1);
    this.tuba(N('A2'), s + q * 3.5, q * 2.5, 0.1);
    for (let i = 0; i < 14; i++) this.snare(s + q * 3.5 + i * 0.07, 0.03 + i * 0.002); // a soft roll under the last note
    this.tone(110, s + q * 3.5, 1.6, { to: 108, vol: 0.18, attack: 0.01 }); // timpani
  }

  /** Plays a play's sounds together (the groan comes once a missed kick has hit the upright). */
  public playAll(sounds: GameSound[]): void {
    sounds.forEach((s) => (s === 'GROAN' ? this.playGroan(sounds.includes('DOINK') ? 0.95 : 0.25) : this.play(s)));
  }

  /** Plays one of the game's sounds by name (playSounds.ts decides which ones a play gets). */
  public play(sound: GameSound): void {
    switch (sound) {
      case 'THUD':
        return this.playTackleThud();
      case 'WHISTLE':
        return this.playWhistle();
      case 'ALERT':
        return this.playLeverageAlert();
      case 'TOUCHDOWN':
        return this.playTouchdown();
      case 'FIRST_DOWN':
        return this.playFirstDown();
      case 'KICK':
        return this.playKick();
      case 'FIELD_GOAL_GOOD':
        return this.playFieldGoalGood();
      case 'DOINK':
        return this.playDoink();
      case 'TAKEAWAY':
        return this.playTakeaway();
      case 'GIVEAWAY':
        return this.playGiveaway();
      case 'GROAN':
        return this.playGroan(0.25);
      case 'QUARTER_BUZZER':
        return this.playQuarterBuzzer();
      case 'CLOCK_TICKS':
        return this.playClockTicks();
    }
  }
}

export const soundFx = new SoundEngine();
