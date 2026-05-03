const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appAPI', {
  isDesktop: true,
  list:    ()                => ipcRenderer.invoke('designs:list'),
  read:    (name)            => ipcRenderer.invoke('designs:read', name),
  write:   (name, content)   => ipcRenderer.invoke('designs:write', name, content),
  remove:  (name)            => ipcRenderer.invoke('designs:delete', name),
  exists:  (name)            => ipcRenderer.invoke('designs:exists', name),
  dataDir: ()                => ipcRenderer.invoke('designs:dir'),
  reveal:  ()                => ipcRenderer.invoke('designs:reveal'),
  trace:   (dataUrl, options) => ipcRenderer.invoke('trace:bitmap', dataUrl, options),
});
