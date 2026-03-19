# Privacy Policy — MindShelf

**Last updated:** March 20, 2026

## Overview

MindShelf is a browser tab management extension. It processes your tab data **locally in your browser** and does not collect, transmit, or store any personal data on external servers controlled by MindShelf.

## Data Collection

**MindShelf does not collect any user data.** Specifically:

- No analytics or telemetry
- No tracking cookies or identifiers
- No data sent to MindShelf servers (there are no MindShelf servers)
- No user accounts or registration

## Data Processing

All data processing happens locally:

| Data | Where processed | Purpose |
|------|----------------|---------|
| Tab metadata (title, URL) | Browser (extension) | Display, classify, deduplicate tabs |
| Page text content | Browser (extension) | AI classification, note export |
| User settings & AI config | `chrome.storage.local` | Persist preferences locally |
| Enrichment cache | `chrome.storage.local` | Cache classification results (60-day TTL) |

## Third-Party AI Providers

If you configure an AI provider (OpenAI, Anthropic, or compatible API), tab titles and page excerpts are sent **directly from your browser** to the provider you choose. MindShelf does not proxy, intercept, or store this data. You are responsible for reviewing your chosen AI provider's privacy policy.

## Optional Backend

The optional MindShelf backend (`npx mindshelf serve`) runs **on your own machine** for exporting notes to Apple Notes or Obsidian. It communicates only with the extension via local WebSocket (`localhost`). No data leaves your machine through the backend.

## Permissions

MindShelf requests the following Chrome permissions:

- **tabs** — Read tab metadata for classification and management
- **activeTab** — Access current tab content on user interaction (popup click)
- **alarms** — Maintain background heartbeat for local WebSocket connection
- **sidePanel** — Display the main UI
- **scripting** — Extract page text for classification and export
- **storage** — Persist settings and cache locally
- **host_permissions (`<all_urls>`)** — Required by scripting API to extract content from any website

All permissions are used solely for tab management and knowledge export. No data is collected or shared with third parties by MindShelf itself.

## Changes

If this policy changes, the updated version will be posted at this URL with a new "Last updated" date.

## Contact

For questions about this privacy policy, open an issue at [github.com/pdajoy/mindshelf](https://github.com/pdajoy/mindshelf/issues).
