import { describe, expect, it } from 'vitest';
import { BUILD_MENU } from '../src/data/buildings';
import { fill, pickLang, plural, strings } from '../src/data/i18n';

/** Flattens nested string tables to "a.b" → text. */
function flatten(obj: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') out[prefix + key] = value;
    else if (Array.isArray(value)) value.forEach((v, i) => (out[`${prefix}${key}.${i}`] = v));
    else Object.assign(out, flatten(value as object, `${prefix}${key}.`));
  }
  return out;
}

describe('i18n', () => {
  it('picks German for German browsers and English otherwise', () => {
    expect(pickLang('de-DE')).toBe('de');
    expect(pickLang('fr')).toBe('en');
    expect(pickLang(undefined)).toBe('en');
  });

  it('has the same non-empty keys in every language', () => {
    const de = flatten(strings('de'));
    const en = flatten(strings('en'));
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    for (const value of [...Object.values(de), ...Object.values(en)]) {
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('names and describes every building in the menu', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      for (const id of BUILD_MENU) {
        expect(t.building[id]).toBeTruthy();
        expect(t.buildingInfo[id]).toBeTruthy();
      }
    }
  });

  it('fills placeholders and picks singular or plural', () => {
    expect(fill('{a} → {b}, {missing}', { a: 1, b: 'x' })).toBe('1 → x, {missing}');
    const forms = strings('de').hint.noWater;
    expect(plural(forms, 1)).toBe('Ein Haus braucht Wasser.');
    expect(plural(forms, 3)).toBe('3 Häuser brauchen Wasser.');
  });

  it('gives every hint and count message a singular and a plural form', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      for (const forms of [...Object.values(t.hint), t.report.upgraded, t.report.downgraded]) {
        expect(forms).toHaveLength(2);
      }
    }
  });

  it('has a text for every event, running or reported', () => {
    const kinds = ['fair', 'pilgrims', 'goodHarvest', 'jugglers', 'harshWinter', 'dryWell'];
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      expect(Object.keys(t.event).sort()).toEqual([...kinds].sort());
      expect(Object.keys(t.eventNow).sort()).toEqual(['dryWell', 'harshWinter', 'jugglers']);
    }
  });

  it('explains every key in the help and every reason a building stands idle', () => {
    for (const lang of ['de', 'en'] as const) {
      const t = strings(lang);
      expect(t.keys.length).toBeGreaterThanOrEqual(8);
      expect(t.helpText.length).toBeGreaterThanOrEqual(6);
      expect(Object.keys(t.idle).sort()).toEqual(
        [
          'construction',
          'damaged',
          'dry',
          'needsPlaza',
          'needsWater',
          'noGate',
          'noAccess',
          'unstaffed',
        ].sort(),
      );
    }
  });
});
