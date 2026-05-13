import { expect, launchExtension, openExtensionPage, test } from './fixtures';

const SETTINGS_KEY = 'mindshelf_settings';

test('first provider model is activated and persisted', async ({}, testInfo) => {
  const { context, extensionId } = await launchExtension(testInfo, { viewport: { width: 320, height: 720 } });
  try {
    const page = await openExtensionPage(context, extensionId, 'sidepanel.html');
    await page.evaluate(async ({ settingsKey }) => {
      const chromeApi = (globalThis as any).chrome;
      await chromeApi.storage.local.clear();
      await chromeApi.storage.local.set({ [settingsKey]: { language: 'en' } });
      localStorage.setItem('mindshelf_language', 'en');
    }, { settingsKey: SETTINGS_KEY });
    await page.reload();

    const settingsButton = page.getByTitle('Settings');
    await expect(settingsButton).toBeVisible();
    await expect(settingsButton).toBeInViewport();
    await settingsButton.click();

    await page.getByRole('button', { name: /Add Provider/i }).click();
    await page.getByText('New Provider').click();
    await page.getByPlaceholder('sk-...').fill('test-key');
    await page.getByPlaceholder('Add model name').fill('gpt-test-model');
    await page.getByPlaceholder('Add model name').press('Enter');

    await expect(page.getByText(/New Provider \/ gpt-test-model/)).toBeVisible();
    await expect.poll(async () => page.evaluate(async ({ settingsKey }) => {
      const chromeApi = (globalThis as any).chrome;
      const stored = await chromeApi.storage.local.get(settingsKey);
      return stored[settingsKey]?.activeModel;
    }, { settingsKey: SETTINGS_KEY })).toBe('gpt-test-model');

    await page.reload();
    await page.getByTitle('Settings').click();
    await expect(page.getByText(/New Provider \/ gpt-test-model/)).toBeVisible();
  } finally {
    await context.close();
  }
});
