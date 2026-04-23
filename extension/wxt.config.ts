import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync(path.resolve('package.json'), 'utf-8'));

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  alias: {
    '@': path.resolve('src'),
  },
  manifest: {
    default_locale: 'en',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    version: pkg.version,
    permissions: [
      'tabs',
      'activeTab',
      'alarms',
      'sidePanel',
      'scripting',
      'storage',
    ],
    host_permissions: ['<all_urls>'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {
      default_popup: 'popup.html',
      default_title: '__MSG_actionTitle__',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
