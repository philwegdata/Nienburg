import './style.css';
import { CITIES } from './data/cities';
import { pickLang, strings } from './data/i18n';
import { startApp } from './ui/app';

const lang = pickLang(navigator.language);
const t = strings(lang);
document.documentElement.lang = lang;

function need<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing element ${selector}`);
  return node;
}

const canvas = need<HTMLCanvasElement>('#map');
canvas.setAttribute('aria-label', t.mapLabel);

startApp(
  {
    canvas,
    tools: need<HTMLElement>('#tools'),
    hint: need<HTMLElement>('#hint'),
    info: need<HTMLElement>('#info'),
    resources: need<HTMLElement>('#resources'),
    date: need<HTMLElement>('#date'),
    undo: need<HTMLButtonElement>('#undo'),
    end: need<HTMLButtonElement>('#end'),
    newGame: need<HTMLButtonElement>('#new'),
    report: need<HTMLDialogElement>('#report'),
  },
  CITIES[0]!,
  t,
);
