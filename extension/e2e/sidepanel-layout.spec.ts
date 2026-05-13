import { expect, launchExtension, openExtensionPage, test } from './fixtures';

test('list title uses the row width while hover actions float above it', async ({}, testInfo) => {
  const longTitle = 'A very long MindShelf tab title that should keep the full row width before hover actions appear';
  const { context, extensionId } = await launchExtension(testInfo, { viewport: { width: 320, height: 720 } });
  try {
    const source = await context.newPage();
    await source.goto(`data:text/html,${encodeURIComponent(`<title>${longTitle}</title><main>Playwright fixture page</main>`)}`);

    const page = await openExtensionPage(context, extensionId, 'sidepanel.html');
    await page.evaluate(async () => {
      localStorage.setItem('mindshelf_language', 'en');
      await (globalThis as any).chrome.storage.local.set({ mindshelf_settings: { language: 'en' } });
    });
    await page.reload();

    const title = page.getByTitle(longTitle).first();
    await expect(title).toBeVisible();
    const box = await title.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(230);

    await title.hover();
    await expect(page.getByTitle('AI Summary').first()).toBeVisible();
  } finally {
    await context.close();
  }
});
