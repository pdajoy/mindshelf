import { Router } from 'express';
import {
  syncTabs,
  listTabs,
  getTabById,
  updateTab,
  deleteTab,
  batchUpdateStatus,
  type SyncTabInput,
} from '../db/tab-repo.js';

export const tabsRouter = Router();

tabsRouter.post('/sync', (req, res) => {
  try {
    const tabs: SyncTabInput[] = req.body.tabs;
    if (!Array.isArray(tabs)) {
      return res.status(400).json({ error: 'tabs array required' });
    }
    const result = syncTabs(tabs);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

tabsRouter.get('/', (req, res) => {
  try {
    const result = listTabs({
      status: req.query.status as string,
      topic: req.query.topic as string,
      search: req.query.search as string,
      domain: req.query.domain as string,
      sort: req.query.sort as string,
      order: req.query.order as 'asc' | 'desc',
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

tabsRouter.get('/:id', (req, res) => {
  const tab = getTabById(req.params.id);
  if (!tab) return res.status(404).json({ error: 'Tab not found' });
  res.json(tab);
});

tabsRouter.patch('/:id', (req, res) => {
  const tab = updateTab(req.params.id, req.body);
  if (!tab) return res.status(404).json({ error: 'Tab not found' });
  res.json(tab);
});

tabsRouter.delete('/:id', (req, res) => {
  deleteTab(req.params.id);
  res.json({ success: true });
});

tabsRouter.post('/batch/status', (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !status) {
      return res.status(400).json({ error: 'ids array and status required' });
    }
    const count = batchUpdateStatus(ids, status);
    res.json({ updated: count });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
