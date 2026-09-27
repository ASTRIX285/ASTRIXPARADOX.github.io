export const MAX_JSON_BYTES: number;
export class PayloadSizeError extends Error { code: string; context: string; bytes: number; limit: number; constructor(context: string, bytes: number, limit?: number); }
export function jsonByteLength(value: unknown, options?: {limit?: number; context?: string}): number;
export function boundedStringify(value: unknown, context?: string, limit?: number): string;
export function readBoundedJson(response: Response, context?: string, limit?: number): Promise<any>;
export function graphFingerprint(value: unknown): string;
export function readBoundedText(response: Response, context?: string, limit?: number): Promise<string>;
export const MAX_PREPARED_PAGE_BYTES: number;
