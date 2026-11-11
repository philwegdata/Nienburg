/** Small helpers for building the interface without a framework. */

export function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  cls?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

export function button(text: string, onClick: () => void, cls?: string): HTMLButtonElement {
  const b = node('button', text, cls);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
