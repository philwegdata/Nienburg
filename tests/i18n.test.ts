import { describe, expect, it } from 'vitest';
import { BUILD_MENU } from '../src/data/buildings';
import { pickLang, strings } from '../src/data/i18n';

/** Flattens nested string tables to "a.b" → text. */
function flatten(obj: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') out[prefix + key] = value;
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
});
