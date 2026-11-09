/// <reference types="node" />
// Local forwarding proxy for organisations that block browser (CORS) calls to the Anthropic API.
//
//   npm run proxy                       # listens on http://127.0.0.1:8787
//   ANTHROPIC_API_KEY=sk-ant-… npm run proxy   # optional: hold the key here instead of in the browser
//
// Then set "API base URL" to http://127.0.0.1:8787 in the extension popup or the playground.
// The proxy forwards /v1/* to api.anthropic.com from Node (no Origin header, no browser-access
// header), streams responses back, and answers CORS preflights for the page/extension.
import http from 'node:http';
import { Readable } from 'node:stream';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = '127.0.0.1';
const UPSTREAM = 'https://api.anthropic.com';
const ENV_KEY = process.env.ANTHROPIC_API_KEY;

const FORWARD_REQUEST_HEADERS = ['content-type', 'accept', 'anthropic-version', 'anthropic-beta'];
const FORWARD_RESPONSE_HEADERS = ['content-type', 'request-id', 'x-request-id', 'retry-after', 'anthropic-ratelimit-requests-remaining', 'anthropic-ratelimit-tokens-remaining'];

function cors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', FORWARD_RESPONSE_HEADERS.join(', '));
  res.setHeader('Access-Control-Max-Age', '86400');
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (!req.url?.startsWith('/v1/')) {
    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Only /v1/* is proxied.' }));
    return;
  }

  const apiKey = ENV_KEY ?? req.headers['x-api-key'];
  if (!apiKey || Array.isArray(apiKey)) {
    res.writeHead(401, { 'content-type': 'application/json' }).end(
      JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'No API key: set ANTHROPIC_API_KEY for the proxy or send x-api-key.' } }),
    );
    return;
  }

  const headers: Record<string, string> = { 'x-api-key': apiKey };
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }

  try {
    const started = Date.now();
    const upstream = await fetch(UPSTREAM + req.url, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : new Uint8Array(await readBody(req)),
    });
    for (const name of FORWARD_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }
    res.writeHead(upstream.status);
    if (upstream.body) {
      Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).pipe(res);
      res.on('finish', () => console.log(`${req.method} ${req.url} → ${upstream.status} (${Date.now() - started} ms)`));
    } else {
      res.end();
    }
  } catch (error) {
    console.error(`${req.method} ${req.url} → upstream failure`, error);
    res.writeHead(502, { 'content-type': 'application/json' }).end(
      JSON.stringify({ type: 'error', error: { type: 'api_error', message: `Proxy could not reach ${UPSTREAM}: ${error instanceof Error ? error.message : String(error)}` } }),
    );
  }
});

server.listen(PORT, HOST, () => {
  console.log(`PromptButton proxy → ${UPSTREAM}`);
  console.log(`Listening on http://${HOST}:${PORT}  (key: ${ENV_KEY ? 'from ANTHROPIC_API_KEY' : 'forwarded from the client'})`);
  console.log(`Set "API base URL" to http://${HOST}:${PORT} in the extension popup or the playground.`);
});
