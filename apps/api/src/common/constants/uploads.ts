import { extname, join } from 'path';

// Directory where uploaded materials are stored and served from (/uploads).
// Mount this as a volume in production for persistence.
export const UPLOADS_DIR = join(__dirname, '..', '..', '..', 'uploads');

/**
 * Extensions a browser will execute as a document. Uploads are served from the
 * SAME origin as the app (see Caddyfile: /uploads/* is proxied to the API), so
 * one of these would run JavaScript with access to the site's localStorage —
 * where the access and refresh tokens live. Uploading is staff-only, which makes
 * this a tutor -> admin escalation rather than an anonymous one, but that is
 * still the wrong direction for it to be possible at all.
 *
 * SVG is on the list because it is an image that can carry <script>.
 */
const EXECUTABLE_EXTENSIONS = new Set([
  '.htm',
  '.html',
  '.xhtml',
  '.shtml',
  '.xht',
  '.svg',
  '.svgz',
  '.xml',
  '.xsl',
  '.xslt',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.wasm',
  '.php',
  '.phtml',
  '.jsp',
  '.asp',
  '.aspx',
  '.cgi',
  '.pl',
  '.py',
  '.sh',
  '.hta',
]);

/** The same list by MIME type, for a client that lies about the extension. */
const EXECUTABLE_MIME = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/xml',
  'application/xml',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'application/wasm',
  'application/xhtml',
]);

/** Media that is safe to render in place — everything else is downloaded. */
const INLINE_MIME_PREFIXES = ['image/', 'audio/', 'video/'];
const INLINE_MIME_EXACT = new Set(['application/pdf']);

/** Is this upload something a browser would run as a document? */
export function isExecutableUpload(originalName: string, mimeType: string): boolean {
  const ext = extname(originalName || '').toLowerCase();
  return EXECUTABLE_EXTENSIONS.has(ext) || EXECUTABLE_MIME.has((mimeType || '').toLowerCase());
}

/**
 * May this stored file be shown in place rather than downloaded? Pictures,
 * audio, video and PDFs are the point of the feature; a document has no reason
 * to be rendered by the browser and every reason not to be.
 */
export function isInlineType(mimeType: string): boolean {
  const mime = (mimeType || '').toLowerCase();
  return (
    INLINE_MIME_PREFIXES.some((p) => mime.startsWith(p)) || INLINE_MIME_EXACT.has(mime)
  );
}

/** MIME type a stored upload is served with, keyed by its extension. */
const EXT_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.wav': 'audio/wav',
  '.weba': 'audio/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
};

/** The type a stored file will be served as, from its name alone. */
export function storedMimeFor(fileName: string): string {
  return EXT_MIME[extname(fileName || '').toLowerCase()] ?? 'application/octet-stream';
}
