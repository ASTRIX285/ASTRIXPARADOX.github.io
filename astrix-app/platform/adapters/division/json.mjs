/**
 * JSON adapter: import a build file and export one. Anything that is not a valid
 * Division build is refused with a plain reason; nothing is half-loaded.
 */
import { normaliseBuild, validateBuild } from '../../../core/build-format/build.mjs';

export const BUILD_FILE_MAX_BYTES = 64 * 1024;

export function createJsonAdapter() {
  return Object.freeze({
    id: 'json',
    label: 'Import a build file',

    status() {
      return { available: true, state: 'ready', reason: 'Load a build file exported from WorkBench.' };
    },

    async load(text) {
      if (typeof text !== 'string') return { ok: false, state: 'invalid', reason: 'Choose a build file to import.' };
      if (text.length > BUILD_FILE_MAX_BYTES) return { ok: false, state: 'invalid', reason: 'That file is too large to be a build.' };
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { return { ok: false, state: 'invalid', reason: 'That file is not valid JSON.' }; }
      const errors = validateBuild(parsed);
      if (errors.length) return { ok: false, state: 'invalid', reason: `That file is not a valid build. ${errors[0]}` };
      if (parsed.game !== 'division') return { ok: false, state: 'wrong-game', reason: 'That build is for another game.' };
      return { ok: true, build: normaliseBuild(parsed) };
    },

    export(build) {
      return JSON.stringify(normaliseBuild(build), null, 2) + '\n';
    },

    fileName(build) {
      const slug = normaliseBuild(build).name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'build';
      return `workbench-${build.title ?? 'division'}-${slug}.json`;
    }
  });
}

export const JSON_ADAPTER = createJsonAdapter();
