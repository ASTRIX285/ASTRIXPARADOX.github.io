/**
 * Share links for Division builds: /hub/workbench/<title>/?b=<share string>.
 */
import { decodeBuild, encodeBuild } from '../../../core/build-format/build.mjs';

export const SHARE_PARAM = 'b';

export function shareUrl(build) {
  return `/hub/workbench/${build.title}/?${SHARE_PARAM}=${encodeBuild(build)}`;
}

/** The build in a page's query string, or null when there is none. Throws a TypeError for a broken link. */
export function readShareParam(search) {
  const value = new URLSearchParams(search).get(SHARE_PARAM);
  if (value === null) return null;
  const build = decodeBuild(value);
  if (build.game !== 'division') throw new TypeError('That link is for another game.');
  return build;
}
