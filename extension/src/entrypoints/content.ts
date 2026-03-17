export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'EXTRACT_CONTENT_CS') {
        extractContent().then(sendResponse);
        return true;
      }
    });
  },
});

async function extractContent() {
  try {
    const text = document.body.innerText || '';
    return {
      content_text: text.slice(0, 15000),
      title: document.title,
      url: window.location.href,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
