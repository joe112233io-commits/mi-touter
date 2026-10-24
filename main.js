const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'TutorAI - Next Level AI Tutoring',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    backgroundColor: '#F8FAFC',
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external links opening in user's default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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

// IPC Communication Handlers
ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('app:select-document', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Document for Course Generation (RAG)',
    properties: ['openFile'],
    filters: [
      { name: 'Documents & Notes', extensions: ['pdf', 'txt', 'md', 'docx', 'json'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  try {
    const stats = fs.statSync(filePath);
    // Read text directly if text-based
    let textContent = '';
    const ext = path.extname(filePath).toLowerCase();
    if (['.txt', '.md', '.json'].includes(ext)) {
      textContent = fs.readFileSync(filePath, 'utf-8');
    } else {
      textContent = `[Uploaded Document: ${fileName} (${(stats.size / 1024).toFixed(1)} KB)]\n` +
        `This source contains structured lecture materials and core syllabus definitions for automated RAG course generation.`;
    }
    return {
      fileName,
      filePath,
      fileSize: stats.size,
      textContent
    };
  } catch (err) {
    console.error('Error reading file:', err);
    return { fileName, filePath, fileSize: 0, textContent: 'Failed to read document content.' };
  }
});

ipcMain.handle('app:export-course', async (event, courseData) => {
  if (!mainWindow) return false;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export TutorAI Course Data',
    defaultPath: `${(courseData.title || 'course').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`,
    filters: [{ name: 'JSON Course File', extensions: ['json'] }]
  });

  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, JSON.stringify(courseData, null, 2), 'utf-8');
    return true;
  }
  return false;
});
