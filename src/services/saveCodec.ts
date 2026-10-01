// Compact save encoding: saves are JSON compressed with the browser's built-in gzip (CompressionStream).
// A full Texas league is ~23 MB as JSON and ~2 MB compressed, because thousands of players share the same shape.

export const SAVE_FORMAT_GZIP = 'gzip-json';

export const canCompressSaves = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/** JSON text -> gzip bytes. */
export async function compressText(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** gzip bytes -> JSON text. */
export async function decompressText(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
