/** Turning a town into a link and back: JSON, squeezed when the browser can, in URL-safe base64. */

function toBase64Url(bytes: Uint8Array): string {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const plain = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(plain.length);
  for (let i = 0; i < plain.length; i++) bytes[i] = plain.charCodeAt(i);
  return bytes;
}

async function through(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** 'z' + deflated JSON where the browser can compress, else 'j' + plain JSON. */
export async function encodeShare(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (typeof CompressionStream === 'function') {
    return `z${toBase64Url(await through(bytes, new CompressionStream('deflate-raw')))}`;
  }
  return `j${toBase64Url(bytes)}`;
}

export async function decodeShare(text: string): Promise<unknown> {
  try {
    const bytes = fromBase64Url(text.slice(1));
    const json =
      text[0] === 'z' && typeof DecompressionStream === 'function'
        ? await through(bytes, new DecompressionStream('deflate-raw'))
        : text[0] === 'j'
          ? bytes
          : null;
    return json ? (JSON.parse(new TextDecoder().decode(json)) as unknown) : null;
  } catch {
    return null;
  }
}
