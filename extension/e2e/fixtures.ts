import { expect, test, chromium, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../dist/chrome-mv3');

interface LaunchOptions {
  viewport?: { width: number; height: number };
}

export async function launchExtension(testInfo: TestInfo, options: LaunchOptions = {}): Promise<{
  context: BrowserContext;
  extensionId: string;
}> {
  const manifestPath = path.join(extensionPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Extension build not found at ${extensionPath}. Run npm run build first.`);
  }

  const context = await chromium.launchPersistentContext(
    path.join(testInfo.outputDir, 'user-data'),
    {
      channel: 'chromium',
      viewport: options.viewport ?? { width: 360, height: 720 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    },
  );

  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  const extensionId = serviceWorker.url().split('/')[2];
  return { context, extensionId };
}

export async function openExtensionPage(
  context: BrowserContext,
  extensionId: string,
  pagePath: 'popup.html' | 'sidepanel.html',
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/${pagePath}`);
  return page;
}

export { expect, test };
