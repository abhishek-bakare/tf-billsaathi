const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true, // Allows Node.js access in the app
      contextIsolation: false
    }
  });

  // DEVELOPMENT: Load the URL of your running local server
  // Make sure 'npm run dev' is running in another terminal!
  win.loadURL('http://localhost:5173');

  // PRODUCTION: Load the built file (Uncomment this line when you build the .exe later)
  // win.loadFile(path.join(__dirname, 'dist/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});