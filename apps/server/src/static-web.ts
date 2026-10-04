// Ported from Floway apps/platform-node/src/static-web.ts (MIT). See NOTICE.md.
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { HttpBindings } from '@hono/node-server';
import type { ExecutionContext } from 'hono';

type FetchHandler = (request: Request, env?: object, executionCtx?: ExecutionContext) => Promise<Response> | Response;

export const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const serverPaths = ['/api', '/metrics', '/v1', '/v1beta', '/messages', '/chat/completions', '/responses', '/models'];

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const contentTypeFor = (path: string): string =>
  basename(path) === 'LICENSE' ? 'text/plain; charset=utf-8' : contentTypes[extname(path).toLowerCase()] ?? 'application/octet-stream';

// React Router emits browser assets into dist/client. The sibling dist/server
// tree is build-time machinery, not a browser-served application.
const defaultWebDistDir = (): string =>
  fileURLToPath(new URL('../../web/dist/client/', import.meta.url));

export const isServerPath = (pathname: string): boolean =>
  serverPaths.some(path => pathname === path || pathname.startsWith(`${path}/`));

const isStaticAssetPath = (pathname: string): boolean =>
  pathname.startsWith('/assets/');

const etagFor = (size: number, modifiedMs: number): string =>
  `W/"${size.toString(16)}-${Math.trunc(modifiedMs).toString(16)}"`;

const etagMatches = (condition: string, etag: string): boolean =>
  condition.split(',').some(candidate => {
    const normalized = candidate.trim();
    return normalized === '*' || normalized.replace(/^W\//, '') === etag.replace(/^W\//, '');
  });

const isNotModified = (headers: Headers, etag: string, modifiedMs: number): boolean => {
  const ifNoneMatch = headers.get('if-none-match');
  if (ifNoneMatch !== null) return etagMatches(ifNoneMatch, etag);

  const ifModifiedSince = headers.get('if-modified-since');
  if (ifModifiedSince === null) return false;
  const modifiedSince = Date.parse(ifModifiedSince);
  return Number.isFinite(modifiedSince) && Math.floor(modifiedMs / 1_000) * 1_000 <= modifiedSince;
};

const responseFromFile = async (path: string, root: string, request: Request, immutable: boolean): Promise<Response | null> => {
  try {
    const [realRoot, realFile] = await Promise.all([realpath(root), realpath(path)]);
    const relativeFile = relative(realRoot, realFile);
    if (relativeFile === '..' || relativeFile.startsWith(`..${sep}`) || isAbsolute(relativeFile)) return new Response('Not found', { status: 404 });
    const info = await stat(realFile);
    if (!info.isFile()) return null;
    const etag = etagFor(info.size, info.mtimeMs);
    const headers = new Headers({
      'content-type': contentTypeFor(path),
      'cache-control': immutable ? STATIC_ASSET_CACHE_CONTROL : 'no-cache',
      'content-length': String(info.size),
      etag,
      'last-modified': info.mtime.toUTCString(),
    });
    if (isNotModified(request.headers, etag, info.mtimeMs)) return new Response(null, { status: 304, headers });
    if (request.method === 'HEAD') return new Response(null, { headers });
    return new Response(Readable.toWeb(createReadStream(realFile)) as ReadableStream<Uint8Array>, { headers });
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return null;
    throw error;
  }
};

export interface StaticWebOptions {
  distDir: string;
}

// API and data-plane prefixes always reach Hono, including its 404s.
// Other GET/HEAD requests serve assets or the SPA history fallback.
export const createNodeFetchHandler = (serverFetch: FetchHandler, options: StaticWebOptions): FetchHandler =>
  async (request, env, executionCtx) => {
    const url = new URL(request.url);
    let pathname: string;
    try {
      // WHATWG URLs normalize encoded dot segments. Inspect the original
      // HTTP request path before that normalization can hide traversal.
      const rawPath = (env as Partial<HttpBindings> | undefined)?.incoming?.url?.split('?')[0] ?? url.pathname;
      pathname = decodeURIComponent(rawPath);
    } catch {
      return new Response('Malformed URL path', { status: 400 });
    }
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) return new Response('Not found', { status: 404 });
    if (isServerPath(pathname) || isServerPath(url.pathname) || (request.method !== 'GET' && request.method !== 'HEAD')) {
      return await serverFetch(request, env, executionCtx);
    }
    const root = resolve(options.distDir);
    const requestedPath = resolve(root, `.${pathname}`);
    const relativePath = relative(root, requestedPath);
    if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      return new Response('Not found', { status: 404 });
    }

    const asset = await responseFromFile(requestedPath, root, request, pathname.startsWith('/assets/'));
    if (asset) return asset;
    if (isStaticAssetPath(pathname)) return new Response('Not found', { status: 404 });

    const index = await responseFromFile(resolve(root, 'index.html'), root, request, false);
    return index ?? new Response('FlowMock dashboard assets are unavailable; build apps/web before starting the server.', { status: 503 });
  };

export const nodeWebDistDir = (env: NodeJS.ProcessEnv = process.env): string =>
  env.FLOWMOCK_WEB_DIST_DIR === undefined ? defaultWebDistDir() : resolve(fileURLToPath(new URL('../', import.meta.url)), env.FLOWMOCK_WEB_DIST_DIR);
