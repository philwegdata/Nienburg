import type { Lang } from '../../core/types';
import { de, type Strings } from './de';
import { en } from './en';

export type { Lang, Strings };

const tables: Record<Lang, Strings> = { de, en };

export function pickLang(browserLang: string | undefined): Lang {
  return browserLang?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function strings(lang: Lang): Strings {
  return tables[lang];
}

/** Picks the singular (first) or plural (second) template for `n` and fills in {n}. */
export function plural(forms: readonly string[], n: number): string {
  return fill((n === 1 ? forms[0] : forms[1]) ?? '', { n });
}

/** Replaces {name} placeholders in a template. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
