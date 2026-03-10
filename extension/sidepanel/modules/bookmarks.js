import {
  getBookmarkFolders, bookmarkToFolder, createBookmarkFolder,
  getBookmarkChildren, deleteBookmark,
} from '../../lib/api-client.js';
import { state, $, esc, toast, toggleModal } from './state.js';

export function openFolderPicker(callback) {
  state.folderPickerCallback = callback;
  state.selectedFolderId = null;
  toggleModal('folderPickerModal', true);
  loadFolderTree();
}

async function loadFolderTree() {
  const list = $('#folderPickerList');
  list.innerHTML = '<div class="spinner" style="margin:10px auto"></div>';

  const result = await getBookmarkFolders();
  if (result.error) { list.innerHTML = '<p style="color:var(--c-text3)">加载失败</p>'; return; }

  list.innerHTML = result.folders.map(f =>
    `<div class="folder-option" data-id="${f.id}" style="padding-left:${8 + f.depth * 16}px">
      📁 ${esc(f.title)}
    </div>`
  ).join('');

  list.querySelectorAll('.folder-option').forEach(el => {
    el.addEventListener('click', () => {
      list.querySelectorAll('.folder-option').forEach(e => e.classList.remove('selected'));
      el.classList.add('selected');
      state.selectedFolderId = el.dataset.id;
    });
  });
}

export async function createNewFolder() {
  const name = $('#newFolderName').value.trim();
  if (!name) return toast('请输入文件夹名');
  const parentId = state.selectedFolderId || '1';
  const result = await createBookmarkFolder(parentId, name);
  if (result.error) return toast('创建失败: ' + result.error);
  state.selectedFolderId = result.id;
  toast(`已创建: ${name}`);
  $('#newFolderName').value = '';
  loadFolderTree();
}

export function confirmFolderPick() {
  if (!state.selectedFolderId) return toast('请选择一个文件夹');
  toggleModal('folderPickerModal', false);
  if (state.folderPickerCallback) {
    state.folderPickerCallback(state.selectedFolderId);
    state.folderPickerCallback = null;
  }
}

export async function bookmarkGroupWithPicker(group) {
  openFolderPicker(async (folderId) => {
    const subfolder = await createBookmarkFolder(folderId, group.name);
    const targetId = subfolder.id || folderId;
    for (const tab of group.tabs) {
      await bookmarkToFolder(targetId, tab.title || tab.url, tab.url);
    }
    toast(`已收藏「${group.name}」下 ${group.tabs.length} 个标签`);
  });
}

export async function batchBookmarkWithPicker() {
  const ids = [...state.selectedIds];
  if (!ids.length) return toast('请先选择标签');
  openFolderPicker(async (folderId) => {
    for (const id of ids) {
      const tab = state.tabs.find(t => t.id === id);
      if (tab) await bookmarkToFolder(folderId, tab.title || tab.url, tab.url);
    }
    toast(`已收藏 ${ids.length} 个标签`);
  });
}

export async function openBookmarkManager() {
  toggleModal('bookmarkModal', true);
  const body = $('#bookmarkBody');
  body.innerHTML = '<div class="spinner" style="margin:20px auto"></div>';

  const result = await getBookmarkFolders();
  if (result.error) { body.innerHTML = '<p style="color:var(--c-text3)">加载失败</p>'; return; }

  const tabHelperFolders = result.folders.filter(f => f.title === 'Tab Helper' || f.depth <= 1);

  body.innerHTML = `
    <p style="font-size:11px;color:var(--c-text3);margin-bottom:10px">点击文件夹查看内容</p>
    <div id="bmFolderList">${tabHelperFolders.map(f =>
      `<div class="bm-folder" data-id="${f.id}" style="padding-left:${8 + f.depth * 16}px">
        📁 ${esc(f.title)}
      </div>`
    ).join('')}</div>
    <div id="bmContent" style="margin-top:10px"></div>
  `;

  body.querySelectorAll('.bm-folder').forEach(el => {
    el.addEventListener('click', () => loadBookmarkContent(el.dataset.id));
  });
}

async function loadBookmarkContent(folderId) {
  const content = $('#bmContent');
  content.innerHTML = '<div class="spinner" style="margin:10px auto"></div>';

  const result = await getBookmarkChildren(folderId);
  if (result.error) { content.innerHTML = '<p style="color:var(--c-text3)">加载失败</p>'; return; }

  if (!result.items?.length) {
    content.innerHTML = '<p style="color:var(--c-text3);font-size:12px">此文件夹为空</p>';
    return;
  }

  content.innerHTML = result.items.map(item => {
    if (item.isFolder) {
      return `<div class="bm-folder" data-id="${item.id}" style="padding-left:8px">📁 ${esc(item.title)}</div>`;
    }
    return `<div class="bm-link">
      <a href="${esc(item.url)}" title="${esc(item.url)}" data-url="${esc(item.url)}">${esc(item.title || item.url)}</a>
      <div class="bm-actions">
        <button class="tab-action-btn" data-open="${esc(item.url)}" title="打开">↗</button>
        <button class="tab-action-btn danger" data-del="${item.id}" title="删除">✕</button>
      </div>
    </div>`;
  }).join('');

  content.querySelectorAll('.bm-folder').forEach(el => {
    el.addEventListener('click', () => loadBookmarkContent(el.dataset.id));
  });
  content.querySelectorAll('[data-open]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: btn.dataset.open, active: false });
    });
  });
  content.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await deleteBookmark(btn.dataset.del);
      btn.closest('.bm-link').remove();
      toast('已删除');
    });
  });
}
