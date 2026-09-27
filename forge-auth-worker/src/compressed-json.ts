/** Bounded UTF-8 decoding for public responses and compressed account uploads. */
export async function readBounded(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RangeError('payload_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
export async function gzip(body: string): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
export async function gunzip(bytes: Uint8Array, limit: number): Promise<string> {
  const stream = new Blob([new Uint8Array(bytes).buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new TextDecoder('utf-8', { fatal: true }).decode(await readBounded(stream, limit));
}
