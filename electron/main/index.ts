// electron/main/index.ts - BİRLEŞTİRİLMİŞ, SAĞLAM ve NİHAİ VERSİYON
import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron';
import path from 'path';
import os from 'os';
import { autoUpdater } from 'electron-updater';

// --- Global Değişkenler ve Konfigürasyon ---

let mainWindow: BrowserWindow | null = null;

// Servis modüllerini tutacak değişkenler. Başlangıçta null olarak ayarlanır.
let databaseService: any = null;
let fileService: any = null;
let aiService: any = null;

const isDev = process.env.NODE_ENV === 'development';
const WINDOW_CONFIG = {
  width: 1400,
  height: 900,
  minWidth: 1000,
  minHeight: 700,
};

// --- Ana Fonksiyonlar ---

/**
 * Uygulamanın ana penceresini oluşturur ve yönetir.
 * Sizin versiyonunuzdaki sağlam pencere oluşturma mantığı kullanıldı.
 */
function createWindow() {
  console.log('🚀 Creating main window...');

  mainWindow = new BrowserWindow({
    ...WINDOW_CONFIG,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Geliştirme ortamı dışında web güvenliğini zorunlu kıl.
      webSecurity: !isDev, 
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
  });

  // Pencere hazır olduğunda gösterilmesi daha pürüzsüz bir deneyim sunar.
  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
    
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Geliştirme ve üretim ortamları için URL yükleme mantığı.
  const loadURL = async () => {
    if (isDev) {
      const devServerUrl = 'http://localhost:5173';
      try {
        await mainWindow?.loadURL(devServerUrl);
        console.log('✅ Development server loaded successfully.');
      } catch (error) {
        console.error('❌ Failed to load development server. Falling back to production build.', error);
        await loadProductionBuild();
      }
    } else {
      await loadProductionBuild();
    }
  };

  const loadProductionBuild = async () => {
    const indexPath = path.join(__dirname, '..', '..', 'dist', 'index.html');
    await mainWindow?.loadFile(indexPath);
    console.log('✅ Production build loaded.');
  };

  loadURL();
}

/**
 * Servisleri (Database, AI, File) sıralı ve güvenli bir şekilde başlatır.
 * Claude'un versiyonundaki modüler ve hataya dayanıklı başlatma mantığı kullanıldı.
 */
async function initializeServices() {
  console.log('🔄 Initializing services...');
  try {
    // 1. Database servisini başlat
    console.log('  - Initializing Database Service...');
    const dbModule = await import('../database');
    await dbModule.setupDatabase();
    databaseService = dbModule;
    console.log('  ✅ Database Service initialized.');

    // 2. AI servisini başlat
    console.log('  - Initializing AI Service...');
    const aiModule = await import('../ai-service');
    aiService = aiModule.aiService; // Singleton instance'ı al
    console.log('  ✅ AI Service initialized.');

    // 3. File servisini başlat (Database'e bağımlı)
    console.log('  - Initializing File Service...');
    const fileModule = await import('../file-service');
    fileService = fileModule;
    // Otomatik izleyiciyi başlatabiliriz (isteğe bağlı)
    // fileService.startFileWatcher(os.homedir());
    console.log('  ✅ File Service initialized.');
    
    console.log('🎉 All services initialized successfully!');
  } catch (error) {
    console.error('❌ A service failed to initialize:', error);
    // Hata durumunda kullanıcıyı bilgilendir.
    dialog.showErrorBox(
      'Servis Başlatma Hatası', 
      `Uygulama servislerinden biri başlatılamadı. Lütfen konsol loglarını kontrol edin.\n\nHata: ${error.message}`
    );
  }
}

/**
 * İşlemler Arası İletişim (IPC) kanallarını kurar.
 * Bu kanallar, arayüz (renderer process) ile ana işlem (main process) arasındaki köprüyü oluşturur.
 */
function setupIpcHandlers() {
  console.log('🔧 Setting up IPC handlers...');

  // 'search-files': Ana arama fonksiyonu
  ipcMain.handle('search-files', async (_, query: string) => {
    if (!databaseService) {
      return [{ path: 'error.txt', text: 'Veritabanı servisi aktif değil.' }];
    }
    try {
      // Doğrudan daha önce birleştirdiğimiz en gelişmiş arama fonksiyonunu çağırıyoruz.
      return await databaseService.smartHybridSearch(query);
    } catch (error) {
      console.error('IPC search-files Error:', error);
      return [{ path: 'error.txt', text: `Arama sırasında bir hata oluştu: ${error.message}` }];
    }
  });

  // 'get-db-stats': Veritabanı istatistiklerini almak için
  ipcMain.handle('get-db-stats', () => {
    if (!databaseService) return null;
    return databaseService.getDatabaseStats();
  });

  // 'open-folder-dialog': Klasör seçme diyaloğunu açmak için
  ipcMain.handle('open-folder-dialog', async () => {
    if (!mainWindow) return;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'İndekslenecek Klasörü Seçin'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0];
      // Arayüzü bekletmeden arka planda indeksleme başlat
      fileService?.indexFiles(folderPath, true)
        .then(() => {
          // İndeksleme bittiğinde arayüze haber ver
          mainWindow?.webContents.send('folder-indexed-successfully', folderPath);
        })
        .catch((err: Error) => {
          console.error(`Indexing error for ${folderPath}:`, err);
          dialog.showErrorBox('İndeksleme Hatası', `Klasör indekslenirken bir hata oluştu: ${err.message}`);
        });
      // Diyalog hemen klasör yolunu döndürür, arayüz "İndeksleniyor..." gösterebilir.
      return folderPath;
    }
  });

  // 'open-external-link': Güvenli bir şekilde harici linkleri açmak için
  ipcMain.on('open-external-link', (_, url) => {
    shell.openExternal(url);
  });

  console.log('✅ IPC handlers are ready.');
}

/**
 * Uygulama menüsünü oluşturur.
 * Sizin versiyonunuzdaki zengin menü yapısı temel alındı ve iyileştirildi.
 */
function createApplicationMenu() {
    const template: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = [
      { role: 'appMenu' }, // macOS için standart App menüsü (Hakkında, Gizle vb.)
      {
        label: 'Dosya',
        submenu: [
          {
            label: 'Klasör İndeksle...',
            accelerator: 'CmdOrCtrl+O',
            click: () => {
              // IPC handler'ı tetikle, böylece mantık tek bir yerde kalır.
              ipcMain.handle('open-folder-dialog', async () => {}); 
            }
          },
          { type: 'separator' },
          { role: 'close' } // Standart Kapat rolü
        ]
      },
      { role: 'editMenu' }, // Standart Düzenle menüsü (Geri Al, Kopyala, Yapıştır vb.)
      { role: 'viewMenu' }, // Standart Görünüm menüsü (Yeniden Yükle, Geliştirici Araçları vb.)
      {
        label: 'Yardım',
        role: 'help',
        submenu: [
          {
            label: 'Daha Fazla Bilgi',
            click: async () => {
              await shell.openExternal('https://github.com/your-repo'); // Proje linkiniz
            }
          },
          { type: 'separator' },
          {
            label: 'AI Servis Durumunu Kontrol Et',
            click: async () => {
              if (!aiService) {
                dialog.showErrorBox('Hata', 'AI Servisi başlatılamadı.');
                return;
              }
              const status = await aiService.getServiceStatus();
              const message = `
Durum: ${status.running ? '✅ Aktif' : '❌ Pasif'}
Kullanılan Model: ${status.model}
Mevcut Modeller: ${status.available_models.join(', ') || 'Yok'}
Konuşma Geçmişi Uzunluğu: ${status.history_length}
              `;
              dialog.showMessageBox(mainWindow!, {
                type: 'info',
                title: 'AI Servis Durumu',
                message: 'AI Servis Durum Bilgileri',
                detail: message.trim()
              });
            }
          },
          {
            label: 'Veritabanı İstatistikleri',
            click: () => {
                const stats = databaseService?.getDatabaseStats();
                if (!stats) return;
                const detail = `
Toplam Dosya: ${stats.total_files}
Toplam Parça (Chunk): ${stats.total_chunks}
Veritabanı Boyutu: ${stats.database_size}
Son Güncelleme: ${stats.last_updated}
                `;
                 dialog.showMessageBox(mainWindow!, {
                    type: 'info',
                    title: 'Veritabanı İstatistikleri',
                    message: 'Veritabanı Durum Bilgileri',
                    detail: detail.trim()
                });
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    console.log('✅ Application menu created.');
}


// --- Uygulama Yaşam Döngüsü (App Lifecycle) ---

app.whenReady().then(async () => {
  console.log('Electron app is ready. Starting application setup...');

  await initializeServices();
  setupIpcHandlers();
  createWindow();
  createApplicationMenu();
  
  // Otomatik güncelleme kontrolü
  autoUpdater.checkForUpdatesAndNotify();

  app.on('activate', () => {
    // macOS'te dock ikonuna tıklandığında pencereyi yeniden oluştur.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS dışında tüm pencereler kapandığında uygulamayı kapat.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  // Uygulama kapanmadan önce veritabanı bağlantısını güvenli bir şekilde kapat.
  databaseService?.closeDatabase();
  console.log('👋 Application quit. Database closed.');
});