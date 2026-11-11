/**
 * Plays every city with every bot layout and prints how it went.
 * Usage: npm run sim [-- turns [seeds]]
 */
import { CITIES } from '../src/data/cities';
import { rulesFor } from '../src/data/rules';
import { PLANS, runBot } from './bot';

const turns = Number(process.argv[2] ?? 160);
const seeds = Number(process.argv[3] ?? 1);

for (const city of CITIES) {
  const RULES = rulesFor(city);
  for (const spec of PLANS[city.id] ?? []) {
    // With several seeds, show how much luck (events, fires) moves the stars.
    for (let seed = 2; seed <= seeds; seed++) {
      const other = runBot(city, spec, RULES, turns, seed * 7919);
      console.log(`  (Zufall ${seed}: Sterne ${other.stars.map((n) => n ?? '–').join(' / ')})`);
    }
    const r = runBot(city, spec, RULES, turns);
    const star = (n: number | null) => (n === null ? '   –' : String(n).padStart(4));
    console.log(`\n${city.name.de} · ${spec.name}`);
    console.log(`  Sterne in Runde:  ${r.stars.map(star).join(' ')}`);
    console.log(`  Einwohner:        ${r.population} (Höchststand ${r.peakPopulation})`);
    console.log(`  Häuser je Stufe:  ${r.levels.join(' / ')}`);
    console.log(
      `  Gold:             ${r.gold} am Ende, Tiefststand ${r.minGold}, Zuschüsse ${r.subsidies}`,
    );
    console.log(`  Goldverlauf:      ${r.goldCurve.join(' ')}`);
    console.log(
      `  Brände ${r.fires}, Ereignisse ${r.events}, Wartezeit ${r.waiting} Runden, nicht gebaut ${r.unbuilt}`,
    );
    console.log(
      `  Häufigste Hinweise: ${r.hints
        .slice(0, 6)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ')}`,
    );
    console.log(`  Zuletzt offen:    ${r.lastHints.join(', ') || 'nichts'}`);
  }
}
