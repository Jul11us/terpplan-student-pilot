import type { CanvasPayload } from "./canvas";
export const EXPORT_SOURCE: string;
export const IMPORT_HASH_KEY: string;
export function defaultTarget(): string;
export function exportSource(target?: string): string;
export function bookmarkletHref(target?: string): string;
export function readImportFragment(hash: string): Promise<CanvasPayload | null>;
