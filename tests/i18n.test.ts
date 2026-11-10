import { describe, expect, it } from 'vitest';
import { pickLang, strings } from '../src/data/i18n';

describe('i18n', () => {
  it('picks German for German browsers and English otherwise', () => {
    expect(pickLang('de-DE')).toBe('de');
    expect(pickLang('fr')).toBe('en');
    expect(pickLang(undefined)).toBe('en');
  });

  it('has the same non-empty keys in every language', () => {
    const de = strings('de');
    const en = strings('en');
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    for (const value of [...Object.values(de), ...Object.values(en)]) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
