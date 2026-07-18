// Minimal, safe bridge. Exposes a tiny read-only flag so the web app can tell it's running inside
// the SlickChart desktop shell (useful for future desktop-specific tweaks), plus a Retry hook for
// the offline page. contextIsolation is on, so nothing else from Node leaks into the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('slickchartDesktop', {
  isDesktop: true,
  platform: process.platform,
  retry: () => ipcRenderer.send('slickchart-retry')
});
