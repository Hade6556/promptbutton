import type { IncomingMessage, ServerResponse } from 'node:http';

export class TooLarge extends Error {}

export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new TooLarge();
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

/** Errors on the Claude route use the API's own shape, so the app's SDK maps them like real API errors. */
export function apiError(res: ServerResponse, status: number, type: string, message: string, headers: Record<string, string> = {}): void {
  json(res, status, { type: 'error', error: { type, message } }, headers);
}

/** Caddy is the only client on 127.0.0.1 and appends the real address last. */
export function clientIp(req: IncomingMessage): string {
  const remote = req.socket.remoteAddress ?? '';
  const forwarded = String(req.headers['x-forwarded-for'] ?? '');
  if (forwarded && /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote)) return forwarded.split(',').pop()!.trim();
  return remote;
}
