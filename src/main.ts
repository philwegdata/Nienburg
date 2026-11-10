import './style.css';
import { pickLang, strings } from './data/i18n';
import { drawPlaceholder } from './render/canvas';

const lang = pickLang(navigator.language);
const t = strings(lang);
document.documentElement.lang = lang;

const tagline = document.querySelector<HTMLParagraphElement>('#tagline');
if (tagline) tagline.textContent = t.tagline;

const canvas = document.querySelector<HTMLCanvasElement>('#map');
if (!canvas) throw new Error('Missing #map canvas');

const redraw = () => drawPlaceholder(canvas, t.mapPlaceholder);
window.addEventListener('resize', redraw);
redraw();
