// Dosya: electron/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

// Arayüzden çağrılabilecek fonksiyonların güvenli bir listesi
const electronAPI = {
  // ARAMA
  searchFiles: (query: string) => ipcRenderer.invoke('search-files', query),

  // VERİTABANI
  getDatabaseStats: () => ipcRenderer.invoke('get-db-stats'),
  
  // DOSYA İŞLEMLERİ
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
};

// electronAPI nesnesini, güvenli bir şekilde renderer process'teki 'window' nesnesine ekle
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// TypeScript'in renderer'da window.electronAPI'yi tanıması için tip tanımı
export type ElectronAPI = typeof electronAPI;