# PromptButton

One press. Reads the conversation, asks what the model still needs, rewrites your prompt.

Every "prompt enhancer" makes your prompt longer. PromptButton reads the whole chat, works out which
of goal / audience / format / constraints / success criteria / examples is actually missing *and not
already answered by the conversation*, asks you only when it matters (max 3 tappable questions), and
rewrites the draft in your own voice. It never sends the message for you.

Works on **claude.ai** and **chatgpt.com**. Trigger: `Alt+Shift+P` (or a USB button sending the same chord).

**Try it without installing anything:** the playground at <https://hade6556.github.io/promptbutton/> runs the same
two Claude calls on a conversation you paste in (bring your own Anthropic key; it stays in your browser).

## Why this design

- Context-aware rewriting improves responses, more so in longer conversations — Sarkar et al. 2025, [arXiv 2503.16789](https://arxiv.org/abs/2503.16789v1)
- Detecting underspecified requests and rewriting them to be fully specified improves QA — [arXiv 2602.11938](https://www.arxiv.org/pdf/2602.11938)
- Clarifying questions help **only when asked selectively**; forced questions hurt on clear prompts — CLAM, [arXiv 2212.07769](https://arxiv.org/abs/2212.07769v2)
- Naming the ambiguity type before writing the question yields better questions — [arXiv 2504.12113](https://alphaxiv.org/overview/2504.12113v2)
- Duplicated context in a prompt measurably hurts; few-shot examples are the most robust technique — The Prompt Report, [arXiv 2406.06608](https://arxiv.org/html/2406.06608v5)

## Develop

```bash
npm install
npm run dev        # builds to .output/chrome-mv3 and watches
```

Load it in Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → pick `.output/chrome-mv3`.
Click the extension icon, paste an Anthropic API key (stored only in `chrome.storage.local`), open
claude.ai or chatgpt.com, type a draft, press `Alt+Shift+P`.

If the shortcut does nothing, check `chrome://extensions/shortcuts` — another extension may own the chord.

```bash
npm run web:dev    # the playground / landing page (Preact + Vite) at http://localhost:5173
npm run web:build  # → web/dist; deployed to GitHub Pages by the workflow below on push to main

npm run typecheck  # extension + web
npm run build
npm run eval       # (day 4) win rate vs. original prompts, false-ask rate on clear prompts

ANTHROPIC_API_KEY=sk-ant-… node --import tsx eval/smoke.mts   # live check of both Claude calls on 3 fixtures
```

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
entrypoints/background.ts   hotkey → active tab; runs the Claude calls (holds the key)
entrypoints/content.ts      per-site adapter, UI, writes the result into the composer
entrypoints/popup/          API key + "when to ask" mode
src/adapters/               chatgpt, claude, generic — readDraft / readHistory / writeDraft
src/llm/                    prompts, context serialization, gap analysis, rewrite
src/ui/                     shadow-DOM toast (panel with questions comes next)
web/                        playground + landing page; imports the same src/llm modules
eval/                       cases + pairwise LLM judge
```

## Status

- [x] Day 1 — hotkey → rewrite → text replaced in composer (chatgpt.com), undo, popup settings
- [ ] Day 2 — claude.ai adapter verified, conversation scraping, preview panel, floating button
- [ ] Day 3 — gap analysis + ambiguity gate + inline questions
- [ ] Day 4 — eval harness, threshold tuning
- [ ] Day 5 — polish, streaming preview, demo video
- [ ] Day 6 — hardware button (optional)
