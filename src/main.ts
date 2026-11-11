import './style.css';
import { CITIES } from './data/cities';
import { pickLang, strings } from './data/i18n';
import { startApp } from './ui/app';
import { storedLang } from './ui/prefs';

// The player's own choice wins over the browser's language.
const lang = storedLang() ?? pickLang(navigator.language);
const t = strings(lang);
document.documentElement.lang = lang;

function need<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element ${selector}`);
  return node;
}

const canvas = need<HTMLCanvasElement>('#map');
canvas.setAttribute('aria-label', `${t.mapLabel}. ${t.mapKeys}`);

startApp(
  {
    canvas,
    tabs: need<HTMLElement>('#tabs'),
    tools: need<HTMLElement>('#tools'),
    hint: need<HTMLElement>('#hint'),
    info: need<HTMLElement>('#info'),
    resources: need<HTMLElement>('#resources'),
    date: need<HTMLElement>('#date'),
    menu: need<HTMLButtonElement>('#menu'),
    undo: need<HTMLButtonElement>('#undo'),
    end: need<HTMLButtonElement>('#end'),
    view: need<HTMLSelectElement>('#view'),
    viewLabel: need<HTMLElement>('#viewLabel'),
    report: need<HTMLDialogElement>('#report'),
    goals: need<HTMLDialogElement>('#goals'),
    cities: need<HTMLDialogElement>('#cities'),
    settings: need<HTMLDialogElement>('#settings'),
    help: need<HTMLDialogElement>('#help'),
    tutorial: need<HTMLElement>('#tutorial'),
  },
  CITIES,
  t,
  lang,
);
