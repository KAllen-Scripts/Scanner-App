const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const cred = require('./src/credentials');
const path = require('path');

// Register asset protocol
function registerAssetProtocol() {
  protocol.registerFileProtocol('asset', (request, callback) => {
    const url = request.url.replace('asset://', '');
    const filePath = path.join(__dirname, url);
    callback(filePath);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 300,
    webPreferences: {
      preload: path.join(__dirname, 'src', 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// IPC handlers for credentials
ipcMain.handle('load-credentials', () => {
  return cred.loadCredentials();
});
ipcMain.handle('save-credentials', (event, apiKey, apiSecret, accountKey) => {
  cred.saveCredentials(apiKey, apiSecret, accountKey);
  return true;
});

app.whenReady().then(() => {
  registerAssetProtocol();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
