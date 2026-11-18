import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareVersions, readRelease } from '../desktop/update-feed';

const FEED = 'https://firstry.ai/download/latest.json';
const good = { version: '0.5.2', file: 'Firstry-0.5.2-universal.dmg', bytes: 227_000_000, sha256: 'a'.repeat(64) };

test('versions compare as numbers, not text', () => {
  assert.equal(compareVersions('0.10.0', '0.9.9'), 1);
  assert.equal(compareVersions('0.5.1', '0.5.2'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
});

test('a release is read from latest.json, with the file fetched from beside it', () => {
  assert.deepEqual(readRelease(good, FEED), { version: '0.5.2', url: 'https://firstry.ai/download/Firstry-0.5.2-universal.dmg', bytes: 227_000_000, sha256: 'a'.repeat(64) });
});

test('a release that could point somewhere else, or is malformed, is refused', () => {
  assert.equal(readRelease({ ...good, file: 'https://evil.example/x.dmg' }, FEED), null);
  assert.equal(readRelease({ ...good, file: '../../x.dmg' }, FEED), null);
  assert.equal(readRelease({ ...good, sha256: 'xyz' }, FEED), null);
  assert.equal(readRelease({ ...good, version: '0.5' }, FEED), null);
  assert.equal(readRelease({ ...good, bytes: 0 }, FEED), null);
  assert.equal(readRelease(null, FEED), null);
});
