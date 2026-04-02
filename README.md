# Probably AI

A Chrome extension that flags social media posts and comments that are probably AI-generated.

<img width="600" alt="1" src="https://github.com/user-attachments/assets/c986fbef-02b7-4395-9d1e-d681efabdae7" />

<img width="800" alt="4" src="https://github.com/user-attachments/assets/50b3ad67-f3b7-4107-8fcf-d838fb551cb8" />

<img width="800" alt="CleanShot 2026-04-01 at 18 51 21" src="https://github.com/user-attachments/assets/f486dc87-7ba8-48ba-b84a-08df8767855f" />

<img width="800" alt="CleanShot 2026-04-01 at 20 23 42" src="https://github.com/user-attachments/assets/1f7d0bc8-f0f0-4860-8ed5-f9024beb3123" />


## What it does

Probably AI scans posts and comments on **Reddit** and **X (Twitter)** for linguistic patterns commonly found in AI-generated text — things like "delve into", "it's important to note", excessive em-dash usage, and other telltale phrases. When it finds a match, it slaps a little warning badge on the post so you know what you're looking at.

## How it works

- A content script watches the page for new posts and comments as you scroll
- Each piece of text gets checked against a set of detection rules (literal phrases and regex patterns)
- Matches get a visual badge with the matched phrases highlighted
- Everything runs locally in your browser — no data leaves your machine

## Features

- **Auto-hide**: Optionally collapse or dim detected content so you can scroll past it
- **Customizable rules**: Add your own phrases or regex patterns, or tweak the defaults
- **Thread filters**: On Reddit, filter all comments from a user flagged in a thread
- **Zero data collection**: No network requests, no tracking, no accounts — just pattern matching in your browser

## Development

```bash
npm install
npm run build    # outputs to dist/
npm test         # runs vitest
```

Load the `dist/` folder as an unpacked extension in `chrome://extensions` with developer mode enabled.
