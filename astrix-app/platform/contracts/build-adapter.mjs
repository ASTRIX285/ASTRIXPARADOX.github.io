/**
 * Generic contract for a build source (manual entry, a build file, a platform account).
 *
 * Every adapter has the same shape, so a page can list them and show the right
 * state without knowing where a build comes from:
 *   id         short id, e.g. 'manual'
 *   label      plain label for the UI
 *   status()   { available: boolean, state: string, reason: string }
 *   load(input) Promise of { ok: true, build } or { ok: false, state, reason }
 */
export const BUILD_ADAPTER_CONTRACT_VERSION = '1.0.0';

export function validateBuildAdapter(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('Build adapter must be an object.');
  if (typeof adapter.id !== 'string' || !/^[a-z0-9-]+$/.test(adapter.id)) throw new TypeError('Build adapter needs an id.');
  if (typeof adapter.label !== 'string' || !adapter.label) throw new TypeError(`Build adapter ${adapter.id} needs a label.`);
  for (const method of ['status', 'load']) {
    if (typeof adapter[method] !== 'function') throw new TypeError(`Build adapter ${adapter.id} is missing ${method}().`);
  }
  const status = adapter.status();
  if (typeof status?.available !== 'boolean' || typeof status?.state !== 'string' || typeof status?.reason !== 'string') {
    throw new TypeError(`Build adapter ${adapter.id} status() must return available, state and reason.`);
  }
  return adapter;
}
