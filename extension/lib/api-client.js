export function sendMessage(type, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...data }, (response) => {
      resolve(response || {});
    });
  });
}

export function getAllTabs() {
  return sendMessage('GET_ALL_TABS');
}

export function extractContent(tabId) {
  return sendMessage('EXTRACT_CONTENT', { tabId });
}

export function extractAllContent(tabIds) {
  return sendMessage('EXTRACT_ALL_CONTENT', { tabIds });
}

export function closeTab(tabId) {
  return sendMessage('CLOSE_TAB', { tabId });
}

export function closeTabs(tabIds) {
  return sendMessage('CLOSE_TABS', { tabIds });
}

export function focusTab(tabId) {
  return sendMessage('FOCUS_TAB', { tabId });
}

export function syncToBackend(tabs) {
  return sendMessage('SYNC_TO_BACKEND', { tabs });
}

export function backendGet(path) {
  return sendMessage('BACKEND_REQUEST', { path, options: { method: 'GET' } });
}

export function backendPost(path, body) {
  return sendMessage('BACKEND_REQUEST', {
    path,
    options: { method: 'POST', body: JSON.stringify(body) },
  });
}

export function backendPatch(path, body) {
  return sendMessage('BACKEND_REQUEST', {
    path,
    options: { method: 'PATCH', body: JSON.stringify(body) },
  });
}

export function backendDelete(path) {
  return sendMessage('BACKEND_REQUEST', { path, options: { method: 'DELETE' } });
}

export function snapshotTab(tabId, options = {}) {
  return sendMessage('SNAPSHOT_TAB', { tabId, options });
}

export function getBookmarkFolders() {
  return sendMessage('GET_BOOKMARK_FOLDERS');
}

export function bookmarkToFolder(folderId, title, url) {
  return sendMessage('BOOKMARK_TO_FOLDER', { folderId, title, url });
}

export function createBookmarkFolder(parentId, folderName) {
  return sendMessage('CREATE_BOOKMARK_FOLDER', { parentId, folderName });
}

export function getBookmarkChildren(folderId) {
  return sendMessage('GET_BOOKMARK_CHILDREN', { folderId });
}

export function deleteBookmark(bookmarkId) {
  return sendMessage('DELETE_BOOKMARK', { bookmarkId });
}

export function getCurrentActiveTab() {
  return sendMessage('GET_CURRENT_TAB');
}
