// Writes each script's fingerprint into the landing page's import of it, so that a new version is fetched at once.
// (The server lets browsers keep everything under /assets/ for a week.) Runs as part of `npm run dash:build`, and on
// its own as `npm run site:stamp` after editing a script by hand.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const page = 'site/index.html';
let html = readFileSync(page, 'utf8');
const before = html;
for (const name of ['dash.js', 'gradient-ascii.js']) {
  const hash = createHash('sha256').update(readFileSync(`site/assets/${name}`)).digest('hex').slice(0, 8);
  const path = `./assets/${name}`;
  html = html.replace(new RegExp(`(${path.replaceAll('.', '\\.')})(\\?v=[0-9a-f]+)?(?=')`), `$1?v=${hash}`);
  if (!html.includes(`'${path}?v=${hash}'`)) throw new Error(`stamp: ${page} does not import ${path}`);
  console.log(`${name} is ${hash} in ${page}`);
}
if (html !== before) writeFileSync(page, html);
