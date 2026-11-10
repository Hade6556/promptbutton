# PromptButton

One press. Reads the conversation, asks what the model still needs, rewrites your prompt.

Every "prompt enhancer" makes your prompt longer. PromptButton reads the whole chat, works out which
of goal / audience / format / constraints / success criteria / examples is actually missing *and not
already answered by the conversation*, asks you only when it matters (max 3 tappable questions), and
rewrites the draft in your own voice. It never sends the message for you.

Works on **claude.ai** and **chatgpt.com**. Trigger: `Alt+Shift+P`, the ✦ button in the corner, or a
[USB button](hardware/) sending the same chord.

**Try it without installing anything:** the playground at <https://hade6556.github.io/promptbutton/> runs the same
two Claude calls on a conversation you paste in (bring your own Anthropic key; it stays in your browser).

**Landing page for the Mac app:** `site/` is a single static `index.html` plus `assets/`, built on the app's own
Ember tokens. `npm run site` serves it at <http://localhost:5500>; it needs no backend, so it can be copied to any
static host as is. `npm run site:deploy` copies `index.html` and `assets/` to the VPS at 72.61.138.63, where Caddy serves
`/var/www/promptbutton` as <https://pimpmypromt.ai> (config in `/etc/caddy/Caddyfile`). The page carries the launch name,
Pimp My Prompt; the app and repo are still PromptButton. The download buttons point at `/download/PimpMyPrompt.dmg`; the page reads `/download/latest.json` to show the
version and size, and shows an error instead of a dead link when it is missing. `npm run dev:staging` serves `site/`
locally, staging pages included.

**Mac download.** One universal DMG (Apple Silicon and Intel, macOS 13 or later):

```bash
npm run desktop:dist     # release/PimpMyPrompt-<version>-universal.dmg: universal Swift helpers, electron-builder, signing
npm run release:upload   # uploads it, repoints /download/PimpMyPrompt.dmg, then writes /download/latest.json
```

With a "Developer ID Application" certificate in the keychain the build is signed with it, and notarized when
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` are set. Without one it is signed ad hoc
(`build/after-pack.cjs`): it launches, but macOS stops the first launch until the user clicks Open Anyway in
System Settings → Privacy & Security, as the site's FAQ explains.
The product shots in `site/assets/shot-*.jpg` are real captures of the panel over a staged editor page (`site/stage/`):
`editor.html` is the backdrop, and `composite.html` renders the built panel renderer over it for states that
need a finished prompt. Rebuild the renderer, copy `desktop/dist/renderer/assets` into `site/stage/panel/`, and
re-shoot when the panel's look changes.

## Windows

The same app runs on Windows 10 and 11 (x64 and ARM64). Only the system layer differs:

| | macOS | Windows |
|---|---|---|
| Read and write the focused field | `desktop/native/axhelper.swift` (Accessibility) | `desktop/native/win/Program.cs` (UI Automation), built to `desktop/bin-win/winhelper.exe` |
| Keyboard fallbacks (copy, select all, paste) | AppleScript | the same helper, `SendInput`, after the hotkey's modifiers are released |
| Window screenshot | `screencapture` | Electron `desktopCapturer` |
| Hotkey | ⌥⇧P or ⌥⌘P | Alt+Shift+P or Ctrl+Alt+P |
| Voice | macOS speech recognition | not yet |
| Permissions | Accessibility and Screen Recording | none |

The helper targets .NET Framework 4.7.2, which ships with Windows, so users install nothing extra. It compiles on a Mac with the .NET SDK.

```bash
npm run desktop:dist:win      # release/PimpMyPrompt-Setup-<version>.exe, one installer for x64 and ARM64
npm run release:upload:win    # publishes it as /download/PimpMyPrompt-Setup.exe and adds it to latest.json
```

The installer is per-user, needs no administrator rights, adds Start menu and desktop shortcuts and opens the app.
It is unsigned, so Windows shows "Windows protected your PC" until it has a code-signing certificate: users click
More info, then Run anyway. To see what the helper reads on a given PC, run
`"%LOCALAPPDATA%\Programs\Pimp My Prompt\resources\app.asar.unpacked\desktop\bin-win\winhelper.exe" selftest`
and click into a text field within three seconds.

## Accounts, limits and billing (server/)

Consumers sign in instead of bringing a key. `server/` is a small Node 24 service on the VPS (systemd unit
`pimpmyprompt`, behind Caddy at `https://pimpmypromt.ai/api/`). It:

- **signs people in** with a 6-digit code emailed through Resend, and keeps only hashes of codes and tokens;
- **relays the app's Claude calls** with the server's Anthropic key. Only the app's model, its one beta and a capped
  `max_tokens` are accepted, so a token is not a general Claude key. Content is never stored or logged;
- **meters usage** from each response's token counts (streamed or not) against the plan: a one-time trial
  (`TRIAL_MICROS`, $1 of usage, about 25 presses) or Pro (`PRO_MICROS`, $8 a period, about 200 presses);
- **bills through Stripe**: Checkout for the subscription, the Customer Portal to change or cancel, and signed,
  de-duplicated webhooks for renewals, failed payments, cancellations, refunds, disputes and fraud warnings.

The app tries, in order: an own key saved under Account, the signed-in account, then a developer `.env` key.

```bash
npm run server:test                       # end to end against local stand-ins for Anthropic and Stripe
npm run server:deploy                     # rsync + npm ci + restart (first time: npm run server:deploy -- --setup)
STRIPE_SECRET_KEY=sk_... node server/scripts/stripe-setup.mts   # one-time: product, price, webhook
```

Secrets live only in `/etc/pimpmyprompt/env` on the server (root:pmp, 0640): `ANTHROPIC_API_KEY`, `CODE_SECRET`,
`RESEND_API_KEY`, `MAIL_FROM`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`. The legal pages are
`site/privacy.html` and `site/terms.html`; Stripe returns people to `site/billing/`.

## Desktop app (works in any app, like VS Code)

`desktop/` is an Electron menu-bar app for macOS. Press `⌥⇧P` in **any** app and a panel appears over it:

- the draft is read from the focused field through the macOS Accessibility API (or from your selection);
- the conversation is a **screenshot of the front window**, sent to Claude as an image — the same trick Cluely-style
  overlays use, so it works in VS Code's chat, Cursor, Slack, ChatGPT desktop, anything;
- questions → streamed rewrite → **Insert** writes the result back into the field (AX `AXValue`, verified; falls back
  to pasting over a selection, then to copying with a "select all and paste" button — it never selects-all on its own);
- the API call runs in Electron's Node process, so organisations that block browser calls need no proxy.

```bash
npm run desktop          # builds desktop/dist and launches; the script unsets ELECTRON_RUN_AS_NODE for VS Code terminals
kill -USR2 <pid>         # scriptable trigger (the pid is in the startup log) — for tests or non-keyboard buttons
```

API key: paste it in the panel's Settings, **or** put `ANTHROPIC_API_KEY=sk-ant-…` in a `.env` file in the repo (or
`~/.promptbutton.env`). The file is read on every press, so no restart is needed. `npm run eval`, `npm run proxy` and
`eval/smoke.mts` read the same `.env`.

First launch on macOS asks for two permissions, both under System Settings → Privacy & Security:
**Accessibility** (read the field, paste) and **Screen Recording** (the window screenshot). Grant them to
"Electron" while running from source; restart the app after granting Screen Recording.

**Voice.** The mic button in the box's bottom row listens (macOS speech recognition, on-device when your
language supports it) and stops by itself when you pause. What you said is then read against what the box is
showing and acted on at once: with a master prompt on screen, "also make it TypeScript and drop the role"
revises it; at a question, "for developers, single HTML file" answers two questions; over a chat, "go with
option two but use Postgres" writes and inserts that reply; anywhere, a new request or brain dump becomes the
draft and runs the full pipeline; "put it in", "undo", "skip", "start over" do what they say. A "heard" line
shows what was understood, with Undo. The first use asks for **Microphone** and **Speech Recognition**.
`npm run voice-smoke` checks the interpretation on 12 cases. The tray menu has the ask
mode, the rewrite depth (full master prompt or concise), "Hide from screen sharing" (`setContentProtection`),
the API key, and undo of the last insert.

## What happens when you press

1. **Read** — the last dozen turns are scraped from the page and sent with your draft.
2. **Gate** — a structured gap analysis names what is missing (goal, audience, output format, constraints,
   success criteria, examples, unclear reference, scope) and scores ambiguity 0–1. Questions appear only
   above the threshold (default 0.6), never more than three, each with tappable suggested answers. Short
   follow-ups in a live conversation score low and skip straight to the rewrite.
3. **Rewrite** — streamed into a preview with additions highlighted. Facts come from the conversation and your
   answers; anything still unknown becomes a `[bracketed placeholder]`, never an invention. Use it, edit it
   in place, or cancel. Undo restores the original.

## One line → master prompt

The gap analysis classifies each draft (mode, scale, domain) and the rewriter acts on it. Short
**follow-ups** ("make it shorter") and **quick** asks ("convert 72°F") stay short. Anything that asks for a
deliverable — "i want to build a landing page", "write the launch email", a brain dump — becomes a master
prompt: Role (the specific practitioner, not "an expert") · Goal and why · Context · Task · Quality bar ·
Constraints · Output · Done when · Examples · Assumptions, typically 1,200–2,500 characters. The content
comes from a per-domain playbook (`src/llm/domains.ts`: front-end, software, writing, marketing, data,
learning, planning, creative, personal, other) listing what a top practitioner pins down and what excellent
looks like; every item is covered from the conversation and your answers, or as a default marked `(assumed)`
— never as an invented fact. The receipts are in [docs/master-prompt-playbook.md](docs/master-prompt-playbook.md):
Anthropic's prompting best practices and Prompt Improver, OpenAI's meta-prompt, ExpertPrompting, the 26
"principled instructions", the role-prompting caveats, and the 2026 checklist comparison. "Concise" in the
tray menu, popup or playground returns to tighten-only. On our 37-case eval the answer to the rewrite is
preferred over the answer to the raw draft 59% of the time (tie 24%, draft 16%; 75% on cold first
messages) with no false asks on clear drafts — `eval/results/summary-v5.md` and `compare-v4-v5.md`.

## Why this design

- Context-aware rewriting improves responses, more so in longer conversations — Sarkar et al. 2025, [arXiv 2503.16789](https://arxiv.org/abs/2503.16789v1)
- Detecting underspecified requests and rewriting them to be fully specified improves QA — [arXiv 2602.11938](https://www.arxiv.org/pdf/2602.11938)
- Clarifying questions help **only when asked selectively**; forced questions hurt on clear prompts — CLAM, [arXiv 2212.07769](https://arxiv.org/abs/2212.07769v2)
- Naming the ambiguity type before writing the question yields better questions — [arXiv 2504.12113](https://alphaxiv.org/overview/2504.12113v2)
- Duplicated context in a prompt measurably hurts; few-shot examples are the most robust technique — The Prompt Report, [arXiv 2406.06608](https://arxiv.org/html/2406.06608v5)

## Develop

```bash
npm install
npm run dev        # extension → .output/chrome-mv3, watches
npm run web:dev    # playground / landing page at http://localhost:5173
```

Load the extension: `chrome://extensions` → Developer mode → **Load unpacked** → `.output/chrome-mv3`.
Click the icon, paste an Anthropic API key (stored only in `chrome.storage.local`), open claude.ai or
chatgpt.com, type a draft, press `Alt+Shift+P` or the ✦ button.
If the shortcut does nothing, check `chrome://extensions/shortcuts` — another extension may own the chord.

```bash
npm run typecheck  # extension + web
npm run build      # extension
npm run web:build  # playground → web/dist
npm run eval       # run + judge; see eval/README.md
ANTHROPIC_API_KEY=sk-ant-… node --import tsx eval/smoke.mts   # quick live check of both Claude calls
node --import tsx scripts/make-icons.mts                       # regenerate public/icon/*.png
```

### “CORS requests are not allowed for this Organization”

Some organisations (custom data-retention settings) refuse API calls made directly from a browser, which is
how both the extension and the playground call Claude. Two ways around it:

- Use a key from a personal Anthropic account, or
- run the bundled local proxy and point the app at it:

```bash
npm run proxy                                  # http://127.0.0.1:8787, forwards /v1/* from Node
# optional: ANTHROPIC_API_KEY=sk-ant-… npm run proxy  keeps the key out of the browser entirely
```

Then set **API base URL** to `http://127.0.0.1:8787` — extension popup → Advanced, or the playground's key dialog.
The proxy binds to localhost only, forwards just the headers the API needs, and streams responses through.

### Turning on GitHub Pages

The deploy workflow sits in `.github/workflows.pending/` because the `gh` token for this repo's account lacks
the `workflow` scope, which GitHub requires to push workflow files. To enable it:

```bash
gh auth switch -u Hade6556 && gh auth refresh -h github.com -s workflow   # one-time, opens the browser
git mv .github/workflows.pending/pages.yml .github/workflows/pages.yml && git commit -m "Enable Pages deploy" && git push
```

Then make the repo public (Settings → General → Danger zone) and set Settings → Pages → Source to **GitHub Actions**.
The site appears at `https://hade6556.github.io/promptbutton/`.

## Layout

```
entrypoints/background.ts   hotkey → active tab; Claude calls (holds the key); streams the rewrite over a port
entrypoints/content.ts      per-site adapter, the in-page panel, writes the result into the composer
entrypoints/popup/          API key, "when to ask" mode, rewrite depth
src/adapters/               chatgpt, claude, generic — readDraft / readHistory / writeDraft
src/llm/                    prompts, domain playbooks, context serialization, gap analysis, rewrite, error mapping
src/ui/panel.ts             shadow-DOM panel: questions → streaming preview with diff → use / edit / undo; ✦ button
src/utils/diff.ts           word-level LCS diff for the highlights
web/                        playground + landing page (Preact + Vite); imports the same src/llm modules
desktop/                    Electron overlay: main.ts (hotkey, panel, tray), capture.ts (AX + screenshot), insert.ts (write-back), renderer/ (Preact panel)
proxy/server.mts            local forwarder for orgs that block browser calls (browser surfaces only)
eval/                       28 cases with hidden intent, simulated-user answers, position-swapped judge
hardware/                   CircuitPython firmware for a one-key USB keyboard sending Alt+Shift+P
scripts/make-icons.mts      renders the keycap icon PNGs with no image dependencies
```

## Status

- [x] Day 1 — hotkey → rewrite → composer (chatgpt.com), undo, popup settings
- [x] Day 2 — claude.ai adapter (composer verified; message scraper with row fallback), panel, ✦ button
- [x] Day 3 — gap analysis, ambiguity gate, tappable questions
- [x] Day 4 — eval harness (`npm run eval`)
- [x] Day 5 — streaming preview, diff highlights, error states, icons, playground
- [x] Day 6 — hardware firmware + wiring guide
- [ ] Verify end-to-end in a real session with a key: extension on both sites, `eval/smoke.mts`, a full `npm run eval`
- [ ] Record the demo video
