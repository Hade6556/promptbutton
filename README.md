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
"Electron" while running from source; restart the app after granting Screen Recording. The tray menu has the ask
mode, "Hide from screen sharing" (`setContentProtection`), the API key, and undo of the last insert.

## What happens when you press

1. **Read** — the last dozen turns are scraped from the page and sent with your draft.
2. **Gate** — a structured gap analysis names what is missing (goal, audience, output format, constraints,
   success criteria, examples, unclear reference, scope) and scores ambiguity 0–1. Questions appear only
   above the threshold (default 0.6), never more than three, each with tappable suggested answers. Short
   follow-ups in a live conversation score low and skip straight to the rewrite.
3. **Rewrite** — streamed into a preview with additions highlighted. Facts come from the conversation and your
   answers; anything still unknown becomes a `[bracketed placeholder]`, never an invention. Use it, edit it
   in place, or cancel. Undo restores the original.

## Brain dump → master prompt

The rewriter picks a mode per draft: short **follow-ups** stay short, mostly-clear **requests** get tightened,
and a **brain dump** becomes a master prompt with Goal · Context · Task · Constraints · Output · Done when ·
Examples · Open questions (+ a role line and a "think first" line only when they earn their place). Every
section traces to vendor guidance or a study — the receipts and their caveats are in
[docs/master-prompt-playbook.md](docs/master-prompt-playbook.md): Anthropic's prompting best practices and
Prompt Improver, OpenAI's guide, a small 2026 comparison in which checklist-structured prompts beat raw ones
(7.50 vs 5.67 on an 8-point single-rater rubric), and the Prompt Report. The evidence supports the bundle,
not each section individually; `npm run eval` measures what it does on our own cases. Anything the rewriter
chooses rather than the user stating it is marked `(assumed)`; it never adds "think step by step" for
reasoning models, keeps a length budget, and refines a previous rewrite instead of regenerating it.

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
entrypoints/popup/          API key + "when to ask" mode
src/adapters/               chatgpt, claude, generic — readDraft / readHistory / writeDraft
src/llm/                    prompts, context serialization, gap analysis, rewrite, error mapping
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
