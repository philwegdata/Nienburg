/** Sizes the canvas backing store to its CSS size and returns a context scaled to CSS pixels. */
export function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported');
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/** Phase 0 placeholder: an empty meadow with a short message. */
export function drawPlaceholder(canvas: HTMLCanvasElement, message: string): void {
  const ctx = fitCanvas(canvas);
  const { width, height } = canvas.getBoundingClientRect();
  ctx.fillStyle = '#b9c79a';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#3b2a20';
  ctx.font = 'italic 18px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, width / 2, height / 2);
}
