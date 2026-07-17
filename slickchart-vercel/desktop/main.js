// SlickChart desktop (Electron) — a thin native shell around the LIVE web app, the same
// "remote" model the mobile apps use: it loads https://slickchart.app/slickchart, so every web
// deploy reaches the desktop app automatically with no re-release. If the machine is offline (or
// the site can't be reached) it shows a local offline page with a Retry button.
const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');

// The live provider app. Keep in sync with capacitor.config.json's server.url.
const APP_URL = 'https://slickchart.app/slickchart';
const APP_ORIGIN = 'https://slickchart.app';

// Windows: give the app a stable identity so notifications/taskbar grouping work.
if (process.platform === 'win32') { try { app.setAppUserModelId('com.slickchart.app'); } catch (e) {} }

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    title: 'SlickChart',
    show: false,
    autoHideMenuBar: process.platform !== 'darwin', // keep the menu bar on mac (needed for copy/paste), hide on win/linux
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Grant the media permissions the app needs (camera for client photos, mic for voice notes,
  // notifications) — but ONLY to our own origin. Everything else is denied.
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const url = (wc && wc.getURL && wc.getURL()) || '';
    const ours = url.indexOf(APP_ORIGIN) === 0;
    const allowed = ['media', 'notifications', 'clipboard-read', 'clipboard-sanitized-write'];
    callback(ours && allowed.indexOf(permission) !== -1);
  });

  loadApp();

  // If the page fails to load (offline / server unreachable), fall back to the local offline page.
  mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDesc, validatedURL, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 /* not a user abort */) {
      mainWindow.loadFile(path.join(__dirname, 'offline.html'));
    }
  });

  // Open external links (anything off our origin, or explicit target=_blank) in the user's real
  // browser instead of a bare Electron window — Stripe checkout, Square, Amazon links, etc.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { shell.openExternal(url); } catch (e) {}
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    try {
      const u = new URL(url);
      if (u.origin !== APP_ORIGIN) { e.preventDefault(); shell.openExternal(url); }
    } catch (err) {}
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function loadApp() {
  if (mainWindow) mainWindow.loadURL(APP_URL);
}

// Exposed to the offline page's Retry button (via preload) to re-attempt the live app.
const { ipcMain } = require('electron');
ipcMain.on('slickchart-retry', () => loadApp());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
