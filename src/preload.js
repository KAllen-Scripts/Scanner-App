const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('credentials', {
  load: () => ipcRenderer.invoke('load-credentials'),
  save: (apiKey, apiSecret, accountKey) => ipcRenderer.invoke('save-credentials', apiKey, apiSecret, accountKey)
});
