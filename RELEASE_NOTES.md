## v2.3.1 — Language Sync, Selection Actions & Setup Docs

### Language & Settings

- Fixed **Auto-detect** language mode so it re-resolves the browser UI language instead of sticking to the previous choice
- Popup now follows the extension language setting instead of staying hardcoded
- Added a Settings toggle for the text selection toolbar

### Selection Toolbar & Side Panel

- Added inline **Ask AI / Save** actions for highlighted text on web pages
- Improved side panel opening for selection actions by preserving the click gesture path more reliably
- Selection toolbar labels and follow-up prompts now use the active extension locale

### Content Extraction & Chat UX

- Switched more chat/note/agent flows to HTML-first extraction, then clean parsing via Defuddle for more consistent page text
- Selection-based save now keeps the selected content when opening the note dialog
- Added the current date to the AI system prompt
- Chat input remains editable while the model is streaming

### Documentation & Distribution

- Added the Chrome Web Store install link to both README versions
- Added macOS permission guidance for MCP bridge access and Apple Notes export
- Documented the new language and selection toolbar settings
- Corrected GitHub Releases and GHCR image references to the current `pdajoy/mindshelf` repository
