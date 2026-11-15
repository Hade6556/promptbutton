// Writes the Dash bundle's fingerprint into the landing page's import of it, so that a new bundle is fetched at once.
// (The server lets browsers keep everything under /assets/ for a week.) Runs as part of `npm run dash:build`.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const page = 'site/index.html';
const hash = createHash('sha256').update(readFileSync('site/assets/dash.js')).digest('hex').slice(0, 8);
const html = readFileSync(page, 'utf8');
const next = html.replace(/(\.\/assets\/dash\.js)(\?v=[0-9a-f]+)?/, `$1?v=${hash}`);
if (!next.includes(`./assets/dash.js?v=${hash}`)) throw new Error(`stamp-dash: ${page} does not import ./assets/dash.js`);
if (next !== html) writeFileSync(page, next);
console.log(`dash.js is ${hash} in ${page}`);
