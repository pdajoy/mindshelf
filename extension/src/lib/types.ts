export interface TabRecord {
  id: string;
  url: string;
  canonical_url: string;
  title: string;
  domain: string;
  favicon_url: string;

  topic: string | null;
  tags: string[];
  ai_summary: string | null;
  ai_detailed_summary: string | null;

  user_score: number | null;
  status: string;

  content_text: string | null;
  language: string | null;
  word_count: number | null;
  source_tab_id: number | null;
  source_window_id: number | null;

  scanned_at: string;
  processed_at: string | null;
  closed_at: string | null;
  created_at: string;
}


export interface AIModel {
  provider: string;
  model: string;
  label: string;
  isDefault: boolean;
}

export interface ClassifyProgress {
  stage: number;
  stageName: string;
  processed: number;
  total: number;
}

export type ExportTarget = 'apple_notes' | 'obsidian';
export type ExportDepth = 'light' | 'standard' | 'full';

export interface ExportLog {
  id: string;
  tab_record_id: string;
  target: ExportTarget;
  target_id: string | null;
  target_folder: string | null;
  export_depth: ExportDepth;
  status: 'success' | 'failed' | 'pending';
  error: string | null;
  created_at: string;
}

export interface DuplicateGroupResult {
  id: string;
  canonicalUrl: string;
  tabs: Array<{ id: string; title: string; url: string; scannedAt: string }>;
  similarity: number;
  reason: string;
}

export type SortField = 'title' | 'domain' | 'scanned_at' | 'topic';
export type SortDirection = 'asc' | 'desc';
export type TabFilter = 'all' | 'processed' | 'unprocessed';

export interface SyncedTab {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  favIconUrl?: string;
  active: boolean;
  pinned: boolean;
  discarded: boolean;
  lastAccessed?: number;
}

export const MESSAGE_TYPES = {
  SCAN_TABS: 'SCAN_TABS',
  EXTRACT_CONTENT: 'EXTRACT_CONTENT',
  CLOSE_TAB: 'CLOSE_TAB',
  ACTIVATE_TAB: 'ACTIVATE_TAB',
  GET_ACTIVE_TAB: 'GET_ACTIVE_TAB',
  TAB_UPDATED: 'TAB_UPDATED',
  TAB_REMOVED: 'TAB_REMOVED',
  TAB_CREATED: 'TAB_CREATED',
} as const;
