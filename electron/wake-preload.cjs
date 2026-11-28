'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvisWake', {
  send: (buffer) => ipcRenderer.send('jarvis:wake-audio', buffer),
  ready: (info) => ipcRenderer.send('jarvis:wake-ready', info),
  failed: (message) => ipcRenderer.send('jarvis:wake-failed', message),
});
