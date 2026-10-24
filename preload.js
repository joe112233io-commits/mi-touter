const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  selectDocument: () => ipcRenderer.invoke('app:select-document'),
  exportCourse: (courseData) => ipcRenderer.invoke('app:export-course', courseData)
});
