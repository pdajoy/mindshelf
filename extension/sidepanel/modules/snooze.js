import { state, $, toast, toggleModal } from './state.js';
import { renderTabs } from './render.js';

export function openSnooze(tabIds) {
  state.snoozeTargetIds = tabIds;
  const count = tabIds.length;
  $('#snoozeHint').textContent = count > 1 ? `为 ${count} 个标签设定提醒` : '选择提醒时间';
  toggleModal('snoozeModal', true);
}

export async function snoozeBy(minutes) {
  await applySnooze(Date.now() + minutes * 60 * 1000);
}

export async function snoozeCustom() {
  const val = $('#snoozeCustomTime').value;
  if (!val) return toast('请选择时间');
  const wakeAt = new Date(val).getTime();
  if (wakeAt <= Date.now()) return toast('时间必须是未来');
  await applySnooze(wakeAt);
}

async function applySnooze(wakeAt) {
  const ids = state.snoozeTargetIds;
  const stored = await chrome.storage.local.get(['snoozedTabs']);
  const map = stored.snoozedTabs || {};

  for (const id of ids) {
    const tab = state.tabs.find(t => t.id === id);
    if (!tab) continue;
    map[id] = { url: tab.url, title: tab.title, wakeAt, chromeTabId: tab.chromeTabId };
    tab._snoozed = true;
    tab._snoozeUntil = wakeAt;
  }

  await chrome.storage.local.set({ snoozedTabs: map });
  const delayMin = Math.max(0.5, (wakeAt - Date.now()) / 60000);
  await chrome.alarms.create(`snooze-${wakeAt}`, { delayInMinutes: delayMin });

  toggleModal('snoozeModal', false);
  renderTabs();
  toast(`已设定提醒：${delayMin < 60 ? `${Math.round(delayMin)} 分钟后` : `${Math.round(delayMin / 60)} 小时后`}通知你`);
}

export async function checkSnoozedTabs() {
  const stored = await chrome.storage.local.get(['snoozedTabs']);
  const map = stored.snoozedTabs || {};
  for (const tab of state.tabs) {
    if (map[tab.id]) { tab._snoozed = true; tab._snoozeUntil = map[tab.id].wakeAt; }
  }
}
