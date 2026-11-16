<div align="center">

<img src="https://capsule-render.vercel.app/api?type=rect&color=0:1b1f23,100:3a4149&height=190&section=header&text=First%20Try&fontSize=66&fontColor=ffffff&fontAlignY=36&desc=One%20press.%20Reads%20the%20chat%2C%20asks%20what%20the%20model%20still%20needs%2C%20rewrites%20your%20prompt.&descSize=17&descAlignY=60" alt="First Try banner" width="100%" />

**A desktop app and browser extension that turns a rough draft into a complete prompt, using only what is already in the conversation.**

[![Top language](https://img.shields.io/github/languages/top/Hade6556/promptbutton?style=for-the-badge)](https://github.com/Hade6556/promptbutton)
[![License](https://img.shields.io/github/license/Hade6556/promptbutton?style=for-the-badge)](#license)
[![Last commit](https://img.shields.io/github/last-commit/Hade6556/promptbutton?style=for-the-badge)](https://github.com/Hade6556/promptbutton/commits)
[![Stars](https://img.shields.io/github/stars/Hade6556/promptbutton?style=for-the-badge)](https://github.com/Hade6556/promptbutton/stargazers)

[![Electron](https://img.shields.io/badge/Electron-45-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Preact](https://img.shields.io/badge/Preact-11-673AB8?style=for-the-badge&logo=preact&logoColor=white)](https://preactjs.com/)
[![WXT](https://img.shields.io/badge/WXT-extension-67D55E?style=for-the-badge)](https://wxt.dev/)
[![Claude API](https://img.shields.io/badge/Claude%20API-Anthropic-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://docs.anthropic.com/)

[Website and downloads](https://firstry.ai) · [How it works](#how-it-works) · [Quick start](#quick-start) · [Layout](#repository-layout)

</div>

---

## What it does

Every "prompt enhancer" makes your prompt longer. First Try reads the whole chat, works out which of goal, audience, format, constraints, success criteria and examples is actually missing and not already answered in the conversation, asks you only when it matters (at most three tappable questions), and rewrites the draft in your own voice. It never sends the message for you.

> **[screenshot placeholder]** Capture the panel floating over VS Code's chat with the three question chips visible, then a second shot of the streamed rewrite with additions highlighted and the Insert button. Suggested size 1600×1000, light and dark variants.

The product is called First Try (it launched as Pimp My Prompt). The repository and the code's internal names are still PromptButton.

## Where it runs

| Surface | Trigger | Reads the conversation from |
|---|---|---|
| macOS menu-bar app (13+, universal) | `⌥⇧P` or `⌥⌘P` in any app | Accessibility API for the field, a screenshot of the front window for the chat |
| Windows 10/11 app (x64, ARM64) | `Alt+Shift+P` or `Ctrl+Alt+P` | UI Automation helper, Electron `desktopCapturer` |
| Chrome extension | `Alt+Shift+P` or the ✦ button | claude.ai and chatgpt.com DOM adapters |
| Web playground | paste a conversation | the pasted text, with your own key kept in the browser |
| USB button | one physical key sending `Alt+Shift+P` | same as the extension |

## How it works

1. **Read.** The last dozen turns and your draft are sent to Claude.
2. **Gate.** A structured gap analysis names what is missing (goal, audience, output format, constraints, success criteria, examples, unclear reference, scope) and scores ambiguity from 0 to 1. Questions appear only above the threshold, never more than three, each with suggested answers. Short follow-ups in a live chat skip straight to the rewrite.
3. **Rewrite.** Streamed into a preview with additions highlighted. Facts come from the conversation and your answers. Anything still unknown becomes a `[bracketed placeholder]`, never an invention. Use it, edit it in place, undo, or cancel.

Drafts that ask for a deliverable become a master prompt: Role, Goal, Context, Task, Quality bar, Constraints, Output, Done when, Examples, Assumptions. The content comes from a per-domain playbook in `src/llm/domains.ts`. The research behind each rule is in [docs/master-prompt-playbook.md](docs/master-prompt-playbook.md).

## Features

- Works in any app on the desktop, not only in the browser: VS Code, Cursor, Slack, ChatGPT desktop.
- Writes the result back into the field it came from, with a verified Accessibility write, then paste-over-selection, then copy as fallbacks.
- Voice input on macOS: say an answer, a revision ("also make it TypeScript"), or a whole new request. On-device speech recognition where the language supports it.
- "Concise" mode that only tightens the draft instead of expanding it.
- Hide-from-screen-sharing toggle, undo of the last insert, and a tray menu for the ask mode and rewrite depth.
- Bring your own Anthropic key, or sign in to a metered account with a free trial and a Pro plan billed through Stripe.
- A knowledge base (`kb/`) of prompting techniques with evidence, compiled into the app and published as a sources page.
- An eval harness that measures whether the rewrite actually gets a better answer. On the 37-case set in `eval/results/summary-v5.md`, the answer to the rewrite was preferred over the answer to the raw draft 59% of the time, with no false asks on clear drafts.
- Dash, the mascot, drawn in code (`src/mascot/dash.ts`) and rendered to every icon and picture.

## Tech stack

| Layer | Choice |
|---|---|
| Desktop app | Electron 45, Preact 11, esbuild, Vite |
| Native helpers | Swift (Accessibility, dictation) on macOS, C# .NET Framework 4.7.2 UI Automation on Windows |
| Browser extension | WXT (Manifest V3), TypeScript, shadow-DOM panel |
| Model | Claude via `@anthropic-ai/sdk`, structured outputs validated with Zod |
| Account server | Node 24, Resend for sign-in codes, Stripe Checkout, Customer Portal and webhooks |
| Site | Static HTML in `site/`, served by Caddy on a VPS |
| Hardware | CircuitPython firmware for a one-key USB keyboard |
| Packaging | electron-builder, universal DMG and NSIS installer |

## Quick start

Requirements: Node 22 or newer, and on macOS the Xcode Command Line Tools (the build calls `xcrun swiftc`).

### macOS app from source

```bash
git clone https://github.com/Hade6556/promptbutton.git
cd promptbutton
npm install                                   # also runs `wxt prepare`
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env    # or paste the key in the panel's Settings later
npm run desktop                               # compiles the Swift helpers, bundles, launches the menu-bar app
```

First launch asks for **Accessibility** and **Screen Recording** under System Settings → Privacy & Security. Grant them to "Electron" while running from source and restart the app after granting Screen Recording. Voice adds **Microphone** and **Speech Recognition** on first use.

### Chrome extension

```bash
npm run dev          # builds .output/chrome-mv3 and watches
```

Open `chrome://extensions`, turn on Developer mode, choose **Load unpacked** and pick `.output/chrome-mv3`. Click the icon, paste an Anthropic key (stored only in `chrome.storage.local`), open claude.ai or chatgpt.com, type a draft and press `Alt+Shift+P`.

### Web playground

```bash
npm run web:dev      # http://localhost:5173
```

### Checks

```bash
npm run typecheck    # extension, web and desktop
npm run test         # unit tests plus the server's end-to-end tests against local stand-ins
npm run eval         # run + judge the 37-case eval; needs ANTHROPIC_API_KEY, roughly 10 to 15 minutes
```

## Usage

| Action | macOS | Windows / Chrome |
|---|---|---|
| Improve the prompt in the focused field | `⌥⇧P` or `⌥⌘P` | `Alt+Shift+P` or `Ctrl+Alt+P` |
| Insert the rewrite | Insert button or Enter | same |
| Undo the last insert | tray menu or panel | panel |
| Scriptable trigger | `kill -USR2 <pid>` | not available |

If an organisation's Anthropic settings block browser calls, run `npm run proxy` and set the API base URL to `http://127.0.0.1:8787` in the extension popup or the playground's key dialog.

### Packaging and release

```bash
npm run desktop:dist          # release/Firstry-<version>-universal.dmg, signed if a Developer ID is in the keychain
npm run desktop:dist:win      # release/Firstry-Setup-<version>.exe for x64 and ARM64
npm run release:upload        # uploads and repoints /download/Firstry.dmg and /download/latest.json
```

## Repository layout

```
desktop/        Electron overlay: main.ts (hotkey, panel, tray), capture.ts, insert.ts, renderer/ (Preact)
entrypoints/    extension background, content script and popup
src/            adapters (chatgpt, claude, generic), llm/ (prompts, gap analysis, rewrite), ui/, mascot/
web/            playground and landing page (Preact + Vite), shares src/llm
site/           static marketing site, legal pages, download metadata
server/         accounts, usage metering and Stripe billing (Node 24)
proxy/          local forwarder for organisations that block browser calls
eval/           cases with hidden intent, simulated-user answers, position-swapped judge
kb/             SQLite knowledge base of techniques with evidence, compiled into the app
hardware/       CircuitPython firmware and wiring guide for the USB button
```

## Contributing

1. Fork and branch from `main`.
2. Run `npm run typecheck` and `npm run test` before opening a pull request.
3. A change to the prompts or the gap analysis should come with an eval run. Attach the new `eval/results/summary.md` and, if you changed a prompt, a `compare.mts` run against the previous results.
4. New prompting techniques go through `kb/`: add a source, extract, verify the quote, and only then approve.
5. Keep the extension's permissions as they are (`storage`, `activeTab`, the Anthropic host) unless the change needs more.

## License

No license file is in the repository yet, so the default "all rights reserved" applies. **[placeholder: add a LICENSE file; the badge above updates by itself]**
