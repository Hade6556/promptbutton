// Paste reliability check against a real app, using the app's own capture and insert code.
//   npm run paste-test -- "ChatGPT" 10
// Click into the app's chat box first. Each run reads the box, switches to Finder (so the target
// is NOT frontmost, as when the panel has focus), inserts a unique prompt, then reads the box
// again through Accessibility to confirm it holds exactly that prompt. Nothing is ever sent.
import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { captureContext, copyWholeField, runHelper } from '../desktop/capture';
import { insertText } from '../desktop/insert';
import { landed } from '../desktop/paste-check';

const run = promisify(execFile);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [target = 'TextEdit', runsArg = '10'] = process.argv.slice(process.argv.findIndex((a) => a.endsWith('paste-test.cjs')) + 1);
const runs = Number(runsArg) || 10;

void app.whenReady().then(async () => {
  app.dock?.hide();
  let passed = 0;
  const outcomes: Record<string, number> = {};
  for (let i = 1; i <= runs; i++) {
    await run('/usr/bin/open', ['-a', target]);
    await delay(900);
    // Put the keyboard in the chat box, as the user's click would (PASTE_TEST_NO_FOCUS=1 keeps the current focus).
    const pids = (await run('/usr/bin/pgrep', ['-x', target]).catch(() => ({ stdout: '' }))).stdout.trim().split('\n').filter(Boolean);
    if (pids[0] && process.env.PASTE_TEST_NO_FOCUS !== '1') await runHelper(['focusfield', pids[0]]).catch((e) => console.log(`  (could not focus a text field: ${e instanceof Error ? e.message : e})`));
    await delay(300);
    let capture = await captureContext();
    // Someone using the Mac can take the front back: wait for the target rather than failing the run.
    for (let tries = 0; tries < 4 && !new RegExp(target.replace(/\s+/g, '.?'), 'i').test(capture.appName); tries++) {
      await run('/usr/bin/open', ['-a', target]);
      await delay(1000);
      capture = await captureContext();
    }
    if (!new RegExp(target.replace(/\s+/g, '.?'), 'i').test(capture.appName)) {
      console.log(`run ${i}: FAIL — frontmost app is "${capture.appName}", not ${target}`);
      continue;
    }
    await run('/usr/bin/open', ['-a', 'Finder']); // the target loses the front, like when the panel is key
    await delay(500);
    const token = Math.random().toString(36).slice(2, 10);
    const text = `Run ${i} ${token}\nGoal:\nRename the photos in a folder by the date they were taken.\n\nOutput:\nOne Python file, under 120 lines.`;
    const started = Date.now();
    const result = await insertText(capture, text);
    const ms = Date.now() - started;
    await delay(500);
    // Independent read of the box: through Accessibility, or by select-all + copy for apps that describe nothing.
    const now = capture.blind
      ? await copyWholeField(capture.pid).then((value) => (value === null ? null : { pid: capture.pid, value }))
      : await runHelper<{ pid: number; value: string }>(['focused']).catch(() => null);
    const inField = Boolean(now && now.pid === capture.pid && landed(now.value, text));
    const ok = inField && result.outcome !== 'copied';
    if (ok) passed++;
    const label = `${result.outcome}${result.reason ? `/${result.reason}` : ''}`;
    outcomes[label] = (outcomes[label] ?? 0) + 1;
    console.log(`run ${i}: ${ok ? 'ok  ' : 'FAIL'} ${label} in ${ms} ms — role=${capture.role || '?'}${capture.blind ? ' (blind)' : ''} source=${capture.source} read-back=${inField ? 'matches' : now ? `differs (${now.value.length} chars)` : 'unreadable'}`);
  }
  console.log(`\n${target}: ${passed}/${runs} pasted and confirmed. Outcomes: ${JSON.stringify(outcomes)}`);
  app.exit(passed === runs ? 0 : 1);
});
