import { soundOn } from './prefs';

export type SoundName = 'build' | 'remove' | 'turn' | 'star' | 'no';

/** One short note: frequency in Hz, start and length in seconds. */
type Note = [freq: number, at: number, length: number];

const TUNES: Record<SoundName, { wave: OscillatorType; notes: Note[] }> = {
  build: { wave: 'triangle', notes: [[220, 0, 0.07]] },
  remove: { wave: 'triangle', notes: [[150, 0, 0.09]] },
  turn: {
    wave: 'sine',
    notes: [
      [392, 0, 0.18],
      [523, 0.12, 0.3],
    ],
  },
  star: {
    wave: 'sine',
    notes: [
      [523, 0, 0.16],
      [659, 0.13, 0.16],
      [784, 0.26, 0.4],
    ],
  },
  no: { wave: 'sine', notes: [[130, 0, 0.12]] },
};

let audio: AudioContext | null = null;

/** Plays a quiet little sound, if the player has switched sounds on. */
export function play(name: SoundName): void {
  if (!soundOn()) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const tune = TUNES[name];
    for (const [freq, at, length] of tune.notes) {
      const start = audio.currentTime + at;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = tune.wave;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.07, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + length + 0.02);
    }
  } catch {
    // No audio available; the game is fine without it.
  }
}
