(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'EXTRACT_PAGE') {
      sendResponse(extractContent());
    }
  });

  function extractContent() {
    const selectors = [
      'article', '[role="main"]', 'main',
      '.post-content', '.article-content', '.entry-content', '#content',
    ];

    let mainContent = '';
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.length > 100) {
        mainContent = el.innerText;
        break;
      }
    }
    if (!mainContent) {
      mainContent = document.body?.innerText || '';
    }

    mainContent = mainContent
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .substring(0, 8000);

    const meta = {};
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) meta.description = descEl.content;

    const kwEl = document.querySelector('meta[name="keywords"]');
    if (kwEl) meta.keywords = kwEl.content;

    const pubEl = document.querySelector('meta[property="article:published_time"]')
      || document.querySelector('time[datetime]');
    if (pubEl) meta.publishedDate = pubEl.content || pubEl.getAttribute('datetime');

    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) meta.image = ogImage.content;

    return {
      content: mainContent,
      meta,
      title: document.title,
      url: location.href,
      wordCount: mainContent.split(/\s+/).length,
    };
  }
})();
