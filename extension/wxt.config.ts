import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',
  modules: ['@wxt-dev/module-react'],
  alias: {
    '@': path.resolve('src'),
  },
  manifest: {
    name: 'MindShelf',
    description: 'Personal Knowledge Asset Library — AI-powered tab management and knowledge export',
    version: '2.0.0',
    permissions: [
      'tabs',
      'activeTab',
      'bookmarks',
      'notifications',
      'alarms',
      'sidePanel',
      'scripting',
      'storage',
    ],
    host_permissions: ['<all_urls>'],
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_popup: 'popup.html',
      default_title: 'MindShelf',
    },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
