# Probably AI

A Chrome extension that flags social media posts and comments that are probably AI-generated.

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
