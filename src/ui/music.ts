/**
 * Quiet music, made on the spot: a soft drone and a wandering tune in a scale that suits the
 * region. Nothing is recorded or borrowed; every phrase is new.
 */
import type { CityLook } from '../core/types';

export type MusicStyle = 'europe' | 'maghreb' | 'eastasia' | 'andes';

interface Style {
  /** Semitones above the root. */
  scale: number[];
  root: number;
  /** Seconds per beat. */
  beat: number;
  voice: 'pluck' | 'flute';
}

const STYLES: Record<MusicStyle, Style> = {
  // Dorian, plucked like a lute.
  europe: { scale: [0, 2, 3, 5, 7, 9, 10], root: 220, beat: 0.55, voice: 'pluck' },
  // A scale with a step and a half, plucked like an oud.
  maghreb: { scale: [0, 1, 4, 5, 7, 8, 10], root: 196, beat: 0.5, voice: 'pluck' },
  // Five notes, plucked like a zither.
  eastasia: { scale: [0, 2, 4, 7, 9], root: 262, beat: 0.6, voice: 'pluck' },
  // Five notes in minor, breathed like a flute.
  andes: { scale: [0, 3, 5, 7, 10], root: 233, beat: 0.65, voice: 'flute' },
};

/** Which music fits a town, by what its places of faith look like. */
export function styleFor(look: CityLook | undefined): MusicStyle {
  if (look?.faith === 'dome') return 'maghreb';
  if (look?.faith === 'pagoda') return 'eastasia';
  if (look?.faith === 'plain') return 'andes';
  return 'europe';
}

let audio: AudioContext | null = null;
let master: GainNode | null = null;
let drone: OscillatorNode[] = [];
let timer: number | null = null;
let style: MusicStyle = 'europe';
let nextAt = 0;
let step = 0;
let degree = 0;

function note(freq: number, at: number, length: number, voice: Style['voice']): void {
  if (!audio || !master) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = voice === 'flute' ? 'sine' : 'triangle';
  osc.frequency.value = freq;
  const peak = voice === 'flute' ? 0.5 : 0.7;
  const attack = voice === 'flute' ? 0.08 : 0.008;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  if (voice === 'flute') {
    // A slight waver, as a breath would give.
    const lfo = audio.createOscillator();
    const depth = audio.createGain();
    lfo.frequency.value = 5;
    depth.gain.value = freq * 0.006;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + length + 0.05);
  }
  osc.connect(gain).connect(master);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

/** Schedules the coming beats a little ahead, so the tune stays steady. */
function schedule(): void {
  if (!audio) return;
  const s = STYLES[style];
  while (nextAt < audio.currentTime + 0.4) {
    // Phrases of eight beats with a breath of two between them.
    const inPhrase = step % 10 < 8;
    if (inPhrase && Math.random() < 0.62) {
      degree = Math.max(
        0,
        Math.min(s.scale.length * 2 - 1, degree + Math.round((Math.random() - 0.5) * 4)),
      );
      const octave = Math.floor(degree / s.scale.length);
      const semis = s.scale[degree % s.scale.length]! + 12 * octave;
      const long = step % 10 === 7 ? 3 : Math.random() < 0.3 ? 2 : 1;
      note(s.root * 2 ** (semis / 12), nextAt, s.beat * long * 1.6, s.voice);
    }
    nextAt += s.beat;
    step++;
  }
}

function startDrone(): void {
  if (!audio || !master) return;
  for (const o of drone) o.stop();
  const root = STYLES[style].root / 2;
  drone = [root, root * 1.5].map((freq) => {
    const o = audio!.createOscillator();
    const g = audio!.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = 0.12;
    o.connect(g).connect(master!);
    o.start();
    return o;
  });
}

/** Starts the music, or changes its style if it is already playing. */
export function playMusic(next: MusicStyle): void {
  try {
    const changed = next !== style;
    style = next;
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    if (!master) {
      master = audio.createGain();
      master.gain.value = 0.045;
      master.connect(audio.destination);
    }
    if (timer === null) {
      nextAt = audio.currentTime + 0.3;
      startDrone();
      timer = window.setInterval(schedule, 150);
    } else if (changed) startDrone();
  } catch {
    // No audio available; the game is fine without it.
  }
}

export function stopMusic(): void {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  for (const o of drone) o.stop();
  drone = [];
}

export function musicPlaying(): boolean {
  return timer !== null;
}
