import { de, type Strings } from './de';
import { en } from './en';

export type Lang = 'de' | 'en';

const tables: Record<Lang, Strings> = { de, en };

export function pickLang(browserLang: string | undefined): Lang {
  return browserLang?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export function strings(lang: Lang): Strings {
  return tables[lang];
}
