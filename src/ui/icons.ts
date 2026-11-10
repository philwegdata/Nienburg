/** Small inline icons for the resource bar. All are drawn on a 16×16 grid in the text colour. */
const SHAPES = {
  gold: '<circle cx="8" cy="8" r="6" fill="#e8c66a" stroke="currentColor" stroke-width="1.2"/><path d="M8 5v6M6.2 6.6h2.6a1.2 1.2 0 010 2.4H7.2" fill="none" stroke="currentColor" stroke-width="1.1"/>',
  food: '<path d="M8 15V5" stroke="currentColor" stroke-width="1.2"/><path d="M8 3.2c1.6 1 1.6 2.6 0 3.6-1.6-1-1.6-2.6 0-3.6zM5 6.4c1.8.2 2.8 1.4 2.6 3.2C5.8 9.4 4.8 8.2 5 6.400zM11 6.400c-1.8.2-2.8 1.4-2.6 3.200C10.2 9.4 11.2 8.2 11 6.400zM5 9.800c1.8.2 2.8 1.4 2.6 3.200C5.8 12.8 4.8 11.6 5 9.800zM11 9.800c-1.8.2-2.8 1.4-2.6 3.200C10.2 12.8 11.2 11.6 11 9.800z" fill="#e3cf78" stroke="currentColor" stroke-width=".7"/>',
  materials:
    '<rect x="1.5" y="9" width="6" height="4" fill="#b9b1a0" stroke="currentColor"/><rect x="8.5" y="9" width="6" height="4" fill="#b9b1a0" stroke="currentColor"/><rect x="5" y="4.5" width="6" height="4" fill="#cfc8b8" stroke="currentColor"/>',
  population:
    '<circle cx="8" cy="5" r="2.6" fill="#e8dcc0" stroke="currentColor"/><path d="M3 14c0-3 2.2-5 5-5s5 2 5 5z" fill="#a4573b" stroke="currentColor"/>',
  buildPoints:
    '<path d="M3 13l6.5-6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 3l5 5-1.8 1.8-5-5z" fill="#b9b1a0" stroke="currentColor"/>',
  free: '<path d="M8 2.500l6.5 3.500L8 9.5 1.5 6z" fill="#d9c9a3" stroke="currentColor"/><path d="M1.5 9.500L8 13l6.5-3.5" fill="none" stroke="currentColor"/>',
  cloth:
    '<path d="M3 3h10v10H3z" fill="#9a79b8" stroke="currentColor"/><path d="M3 6.300h10M3 9.700h10M6.3 3v10M9.7 3v10" stroke="currentColor" stroke-width=".6"/>',
  tools:
    '<path d="M4 13l5-7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M6 3.500l6 1.5-1 3.5-6-1.500z" fill="#8d8676" stroke="currentColor"/>',
  beer: '<path d="M4 5h6v8.500H4z" fill="#e3b04a" stroke="currentColor"/><path d="M10 7h2v4h-2" fill="none" stroke="currentColor"/><path d="M4 5c0-2 6-2 6 0" fill="#f6f1e0" stroke="currentColor"/>',
} as const;

export type IconName = keyof typeof SHAPES;

export function icon(name: IconName): HTMLElement {
  const span = document.createElement('span');
  span.className = 'ico';
  span.setAttribute('aria-hidden', 'true');
  // The markup is a fixed string from this file, never user input.
  span.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16">${SHAPES[name]}</svg>`;
  return span;
}
