// Shim for import.meta.url in CJS context (used by esbuild --inject)
import { pathToFileURL } from 'url';
export const __import_meta_url = pathToFileURL(__filename).href;
