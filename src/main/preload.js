'use strict';
// The only bridge between the screens and the main process. Every call goes
// through one channel, and the main process checks the action and the
// signed-in person's role before doing anything.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, args) => ipcRenderer.invoke('api', String(channel), args === undefined ? null : args),
  onUpdateStatus: (fn) => {
    const handler = (_e, status) => fn(status);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  }
});
