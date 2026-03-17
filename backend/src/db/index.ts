/**
 * In-memory store — replaces SQLite.
 * All tab data lives in a Map keyed by id (UUID).
 * No file persistence; the frontend uses chrome.storage.local for enrichments.
 */

import type { TabRecordRow } from './tab-repo.js';

const store = new Map<string, TabRecordRow>();

export function getStore(): Map<string, TabRecordRow> {
  return store;
}

export function initDB(): void {
  console.log('[MindShelf] In-memory store initialized');
}
