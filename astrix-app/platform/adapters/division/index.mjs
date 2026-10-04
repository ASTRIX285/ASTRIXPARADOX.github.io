/** Division build adapters, all on platform/contracts/build-adapter.mjs. */
export { createManualAdapter, MANUAL_ADAPTER } from './manual.mjs';
export { createJsonAdapter, JSON_ADAPTER, BUILD_FILE_MAX_BYTES } from './json.mjs';
export { createUbisoftAdapter, UBISOFT_ADAPTER } from './ubisoft.mjs';
export { shareUrl, readShareParam, SHARE_PARAM } from './share.mjs';

import { MANUAL_ADAPTER } from './manual.mjs';
import { JSON_ADAPTER } from './json.mjs';
import { UBISOFT_ADAPTER } from './ubisoft.mjs';

export const DIVISION_ADAPTERS = Object.freeze([MANUAL_ADAPTER, JSON_ADAPTER, UBISOFT_ADAPTER]);
