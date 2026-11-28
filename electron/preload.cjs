'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvisDesktop', {
  isDesktop: true,
  platform: process.platform,
  onHotkey(callback) {
    const listener = () => callback();
    ipcRenderer.on('jarvis:hotkey', listener);
    return () => ipcRenderer.removeListener('jarvis:hotkey', listener);
  },
  openApp: (name) => ipcRenderer.invoke('jarvis:openApp', name),
  closeApp: (name) => ipcRenderer.invoke('jarvis:closeApp', name),
  setVolume: (percent) => ipcRenderer.invoke('jarvis:setVolume', percent),
  openUrl: (url, browser) => ipcRenderer.invoke('jarvis:openUrl', url, browser ?? ''),
  volume: (direction) => ipcRenderer.invoke('jarvis:volume', direction),
  media: (action) => ipcRenderer.invoke('jarvis:media', action),
  lock: () => ipcRenderer.invoke('jarvis:lock'),
  onWake: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('jarvis:wake', listener);
    return () => ipcRenderer.removeListener('jarvis:wake', listener);
  },
  onTimerDue: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('jarvis:timer-due', listener);
    return () => ipcRenderer.removeListener('jarvis:timer-due', listener);
  },
  timersList: () => ipcRenderer.invoke('jarvis:timersList'),
  timersReady: () => ipcRenderer.invoke('jarvis:timersReady'),
  timersAdd: (payload) => ipcRenderer.invoke('jarvis:timersAdd', payload),
  timersRemove: (id) => ipcRenderer.invoke('jarvis:timersRemove', id),
  activityList: (limit) => ipcRenderer.invoke('jarvis:activityList', limit),
  activityAppend: (entry) => ipcRenderer.invoke('jarvis:activityAppend', entry),
  historyList: () => ipcRenderer.invoke('jarvis:historyList'),
  historyLoad: (id) => ipcRenderer.invoke('jarvis:historyLoad', id),
  historySave: (payload) => ipcRenderer.invoke('jarvis:historySave', payload),
  historyRemove: (id) => ipcRenderer.invoke('jarvis:historyRemove', id),
  readClipboard: () => ipcRenderer.invoke('jarvis:clipboardRead'),
  voiceCommand: (options) => ipcRenderer.invoke('jarvis:voiceCommand', options ?? {}),
  voiceConfirm: (options) => ipcRenderer.invoke('jarvis:voiceConfirm', options ?? {}),
  sttStatus: () => ipcRenderer.invoke('jarvis:sttStatus'),
  sttStart: () => ipcRenderer.invoke('jarvis:sttStart'),
  sttStop: () => ipcRenderer.invoke('jarvis:sttStop'),
  sttCancel: () => ipcRenderer.invoke('jarvis:sttCancel'),
  sttPush: (buffer) => ipcRenderer.send('jarvis:sttAudio', buffer),
  onSttPartial(callback) {
    const listener = (_event, text) => callback(String(text ?? ''));
    ipcRenderer.on('jarvis:stt-partial', listener);
    return () => ipcRenderer.removeListener('jarvis:stt-partial', listener);
  },
  onSttFinal(callback) {
    const listener = (_event, text) => callback(String(text ?? ''));
    ipcRenderer.on('jarvis:stt-final', listener);
    return () => ipcRenderer.removeListener('jarvis:stt-final', listener);
  },
  onSttError(callback) {
    const listener = (_event, message) => callback(String(message ?? 'unbekannter Fehler'));
    ipcRenderer.on('jarvis:stt-error', listener);
    return () => ipcRenderer.removeListener('jarvis:stt-error', listener);
  },
  getLlmUsage: () => ipcRenderer.invoke('jarvis:llmUsage'),
  getInfo: () => ipcRenderer.invoke('jarvis:desktopInfo'),
  setAutostart: (enabled) => ipcRenderer.invoke('jarvis:setAutostart', enabled),
  synthesizeSpeech: (text, options) => ipcRenderer.invoke('jarvis:ttsSynthesize', text, options ?? {}),
  memoryLoad: () => ipcRenderer.invoke('jarvis:memoryLoad'),
  memorySave: (file) => ipcRenderer.invoke('jarvis:memorySave', file),
  setDictationMode: (enabled) => ipcRenderer.invoke('jarvis:setDictationMode', enabled),
  dictate: (options) => ipcRenderer.invoke('jarvis:dictate', options ?? {}),
  typeText: (text) => ipcRenderer.invoke('jarvis:typeText', text),
  automationState: () => ipcRenderer.invoke('jarvis:automationState'),
  automationSetEnabled: (enabled) => ipcRenderer.invoke('jarvis:automationSetEnabled', enabled),
  automationSettings: (patch) => ipcRenderer.invoke('jarvis:automationSettings', patch ?? {}),
  automationProfiles: (profiles) => ipcRenderer.invoke('jarvis:automationProfiles', profiles ?? {}),
  automationHidden: (modules) => ipcRenderer.invoke('jarvis:automationHidden', modules ?? []),
  automationSave: (routine) => ipcRenderer.invoke('jarvis:automationSave', routine ?? {}),
  automationDelete: (id) => ipcRenderer.invoke('jarvis:automationDelete', id),
  automationDuplicate: (id) => ipcRenderer.invoke('jarvis:automationDuplicate', id),
  automationToggle: (id, enabled) => ipcRenderer.invoke('jarvis:automationToggle', id, enabled),
  automationRun: (id) => ipcRenderer.invoke('jarvis:automationRun', id),
  automationSimulate: (id) => ipcRenderer.invoke('jarvis:automationSimulate', id),
  automationHistory: (limit) => ipcRenderer.invoke('jarvis:automationHistory', limit),
  automationClearHistory: () => ipcRenderer.invoke('jarvis:automationClearHistory'),
  automationCheck: () => ipcRenderer.invoke('jarvis:automationCheck'),
  onAutomationState(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('jarvis:automation-state', listener);
    return () => ipcRenderer.removeListener('jarvis:automation-state', listener);
  },
  onAutomationNotify(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('jarvis:automation-notify', listener);
    return () => ipcRenderer.removeListener('jarvis:automation-notify', listener);
  },
  onAutomationBriefing(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('jarvis:automation-briefing', listener);
    return () => ipcRenderer.removeListener('jarvis:automation-briefing', listener);
  },
  gamingState: () => ipcRenderer.invoke('jarvis:gamingState'),
  gamingDetect: () => ipcRenderer.invoke('jarvis:gamingDetect'),
  gamingLaunch: (id) => ipcRenderer.invoke('jarvis:gamingLaunch', id),
  gamingStop: () => ipcRenderer.invoke('jarvis:gamingStop'),
  gamingSettings: (patch) => ipcRenderer.invoke('jarvis:gamingSettings', patch ?? {}),
  gamingSelect: (id) => ipcRenderer.invoke('jarvis:gamingSelect', id),
  gamingAddGame: (input) => ipcRenderer.invoke('jarvis:gamingAddGame', input ?? {}),
  gamingUpdateGame: (id, patch) => ipcRenderer.invoke('jarvis:gamingUpdateGame', id, patch ?? {}),
  gamingRemoveGame: (id) => ipcRenderer.invoke('jarvis:gamingRemoveGame', id),
  gamingProfileSave: (profile) => ipcRenderer.invoke('jarvis:gamingProfileSave', profile ?? {}),
  gamingProfileDelete: (id) => ipcRenderer.invoke('jarvis:gamingProfileDelete', id),
  gamingAssetUpload: (dataUrl) => ipcRenderer.invoke('jarvis:gamingAssetUpload', dataUrl),
  gamingArtwork: (id, kind) => ipcRenderer.invoke('jarvis:gamingArtwork', id, kind),
  gamingSourceSave: (source) => ipcRenderer.invoke('jarvis:gamingSourceSave', source ?? {}),
  gamingSourceRemove: (id) => ipcRenderer.invoke('jarvis:gamingSourceRemove', id),
  gamingNewsRefresh: (id) => ipcRenderer.invoke('jarvis:gamingNewsRefresh', id ?? ''),
  gamingGuideSave: (guide) => ipcRenderer.invoke('jarvis:gamingGuideSave', guide ?? {}),
  gamingGuideRemove: (id) => ipcRenderer.invoke('jarvis:gamingGuideRemove', id),
  gamingGuideOpen: (url) => ipcRenderer.invoke('jarvis:gamingGuideOpen', url),
  gamingWowSave: (patch) => ipcRenderer.invoke('jarvis:gamingWowSave', patch ?? {}),
  gamingWowLaunch: () => ipcRenderer.invoke('jarvis:gamingWowLaunch'),
  gamingPickFile: (kind) => ipcRenderer.invoke('jarvis:gamingPickFile', kind === 'folder' ? 'folder' : 'executable'),
  gamingSessionDelete: (id) => ipcRenderer.invoke('jarvis:gamingSessionDelete', id),
  gamingSessionsClear: () => ipcRenderer.invoke('jarvis:gamingSessionsClear'),
  gamingCompanion: (open) => ipcRenderer.invoke('jarvis:gamingCompanion', open),
  gamingCompanionAction: (action) => ipcRenderer.invoke('jarvis:gamingCompanionAction', action),
  onGamingState(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('jarvis:gaming-state', listener);
    return () => ipcRenderer.removeListener('jarvis:gaming-state', listener);
  },
  onGamingReport(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('jarvis:gaming-report', listener);
    return () => ipcRenderer.removeListener('jarvis:gaming-report', listener);
  },
  onGamingNotify(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('jarvis:gaming-notify', listener);
    return () => ipcRenderer.removeListener('jarvis:gaming-notify', listener);
  },
  onCompanionAction(callback) {
    const listener = (_event, action) => callback(String(action ?? ''));
    ipcRenderer.on('jarvis:companion-action', listener);
    return () => ipcRenderer.removeListener('jarvis:companion-action', listener);
  },
  getMonitorConsent: () => ipcRenderer.invoke('jarvis:monitorConsent'),
  setMonitorConsent: (granted) => ipcRenderer.invoke('jarvis:monitorConsent', granted),
  sampleSystem: () => ipcRenderer.invoke('jarvis:monitorSample'),
  reportError: (report) => ipcRenderer.invoke('jarvis:errorReport', report),
  getErrorLog: () => ipcRenderer.invoke('jarvis:errorLog'),
  openLogFolder: () => ipcRenderer.invoke('jarvis:openLogFolder'),
  diagnose: () => ipcRenderer.invoke('jarvis:diagnose'),
  testElevenLabs: () => ipcRenderer.invoke('jarvis:elevenlabsTest'),
  updateState: () => ipcRenderer.invoke('jarvis:updateState'),
  checkForUpdates: () => ipcRenderer.invoke('jarvis:updateCheck'),
  installUpdate: () => ipcRenderer.invoke('jarvis:updateInstall'),
  onUpdateState(callback) {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('jarvis:update-state', listener);
    return () => ipcRenderer.removeListener('jarvis:update-state', listener);
  },
  getApiConfig: () => ipcRenderer.invoke('jarvis:apiConfig'),
  saveApiConfig: (draft) => ipcRenderer.invoke('jarvis:apiConfigSave', draft),
  getHotkeys: () => ipcRenderer.invoke('jarvis:hotkeysGet'),
  setHotkeys: (next) => ipcRenderer.invoke('jarvis:hotkeysSet', next),
  setWakeOnBattery: (enabled) => ipcRenderer.invoke('jarvis:setWakeOnBattery', enabled),
  captureScreen: () => ipcRenderer.invoke('jarvis:captureScreen')
});
