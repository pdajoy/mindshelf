import { Router } from 'express';
import { extractContent, type ExtractorType } from '../services/content-extractor.js';
import { updateTab, getTabById } from '../db/tab-repo.js';

export const contentRouter = Router();

contentRouter.post('/extract', async (req, res) => {
  try {
    const { tabId, html, url, extractor } = req.body;
    if (!html || !url) {
      return res.status(400).json({ error: 'html and url required' });
    }

    const type: ExtractorType = extractor || 'readability';
    const result = extractContent(html, url, type);

    if (tabId) {
      updateTab(tabId, {
        content_text: result.plainText.substring(0, 50000),
        content_html: result.html.substring(0, 100000),
        word_count: result.wordCount,
      } as any);
    }

    res.json({
      title: result.title,
      markdown: result.markdown,
      html: result.html,
      plainText: result.plainText.substring(0, 50000),
      excerpt: result.excerpt,
      wordCount: result.wordCount,
      extractor: result.extractor,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

contentRouter.post('/extract-for-tab/:tabId', async (req, res) => {
  try {
    const { html, url, extractor } = req.body;
    const tab = getTabById(req.params.tabId);
    if (!tab) return res.status(404).json({ error: 'Tab not found' });

    if (!html) {
      if (tab.content_text) {
        return res.json({
          markdown: tab.content_text,
          html: tab.content_html || '',
          plainText: tab.content_text,
          excerpt: tab.content_text.substring(0, 300),
          wordCount: tab.word_count || 0,
          extractor: 'cached',
        });
      }
      return res.status(400).json({ error: 'html required for first extraction' });
    }

    const type: ExtractorType = extractor || 'readability';
    const result = extractContent(html, url || tab.url, type);

    updateTab(tab.id, {
      content_text: result.plainText.substring(0, 50000),
      content_html: result.html.substring(0, 100000),
      word_count: result.wordCount,
    } as any);

    res.json({
      title: result.title,
      markdown: result.markdown,
      html: result.html,
      plainText: result.plainText.substring(0, 50000),
      excerpt: result.excerpt,
      wordCount: result.wordCount,
      extractor: result.extractor,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
