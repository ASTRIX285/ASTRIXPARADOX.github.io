/**
 * JSON adapter: import a build file and export one. Anything that is not a valid
 * Division build is refused with a plain reason; nothing is half-loaded.
 */
import { PLATFORMS, isPlatform, normaliseBuild, validateBuild } from '../../../core/build-format/build.mjs';

export const BUILD_FILE_MAX_BYTES = 64 * 1024;

export function createJsonAdapter() {
  return Object.freeze({
    id: 'json',
    label: 'Import a build file',

    status() {
      return { available: true, state: 'ready', reason: 'Load a build file exported from WorkBench.' };
    },

    /**
     * Import a build file. A file with no platform is not guessed: pass the platform the
     * player picked, or the result asks for one (state 'needs-platform').
     */
    async load(text, { platform } = {}) {
      if (typeof text !== 'string') return { ok: false, state: 'invalid', reason: 'Choose a build file to import.' };
      if (text.length > BUILD_FILE_MAX_BYTES) return { ok: false, state: 'invalid', reason: 'That file is too large to be a build.' };
      let parsed;
      try { parsed = JSON.parse(text); }
      catch { return { ok: false, state: 'invalid', reason: 'That file is not valid JSON.' }; }
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !('platform' in parsed)) {
        // Check everything else first (the stand-in platform is never stored), so a broken file is refused as broken.
        const rest = validateBuild({ ...parsed, platform: PLATFORMS[0] });
        if (rest.length) return { ok: false, state: 'invalid', reason: `That file is not a valid build. ${rest[0]}` };
        if (parsed.game !== 'division') return { ok: false, state: 'wrong-game', reason: 'That build is for another game.' };
        if (!isPlatform(platform)) return { ok: false, state: 'needs-platform', reason: `This build file does not say which platform it is for. Choose one: ${PLATFORMS.join(', ')}.` };
        parsed = { ...parsed, platform };
      }
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
