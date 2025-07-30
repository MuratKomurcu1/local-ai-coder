// electron/file-service.ts - Enhanced with recursive indexing
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import chokidar from 'chokidar';

// Database fonksiyonları dinamik olarak yüklenecek
let databaseModule: any = null;
let watcher: chokidar.FSWatcher | null = null;

/**
 * Database modülünü yükle
 */
async function loadDatabaseModule() {
  if (!databaseModule) {
    databaseModule = await import('./database');
  }
  return databaseModule;
}

/**
 * Dosya içeriğinin hash'ini hesapla
 */
function calculateFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Dosyanın metin dosyası olup olmadığını kontrol et - GENİŞLETİLMİŞ
 */
function isTextFile(filePath: string): boolean {
  const textExtensions = [
    // Programming languages
    '.txt', '.md', '.js', '.ts', '.json', '.css', '.html', '.py', '.java', '.cpp', '.c',
    '.jsx', '.tsx', '.php', '.rb', '.go', '.rs', '.sh', '.bat', '.cmd', '.sql',
    '.xml', '.yaml', '.yml', '.ini', '.cfg', '.conf', '.log', '.csv',
    '.rst', '.tex', '.lua', '.pl', '.r', '.m', '.scala', '.swift', '.kt',
    
    // Documentation and markup
    '.markdown', '.mdown', '.mkd', '.textile', '.rdoc', '.org', '.creole',
    '.mediawiki', '.wiki', '.adoc', '.asciidoc',
    
    // Configuration files
    '.env', '.gitignore', '.dockerignore', '.eslintrc', '.prettierrc',
    '.babelrc', '.npmrc', '.yarnrc', '.editorconfig',
    
    // Data files
    '.tsv', '.psv', '.ssv', '.jsonl', '.ndjson',
    
    // Other text files
    '.license', '.changelog', '.readme', '.todo', '.fixme',
    '.dockerfile', '.makefile', '.rakefile', '.gemfile'
  ];
  
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath).toLowerCase();
  
  // Uzantı kontrolü
  if (textExtensions.includes(ext)) {
    return true;
  }
  
  // Uzantısız dosyalar (Dockerfile, Makefile, etc.)
  const textFileNames = [
    'dockerfile', 'makefile', 'rakefile', 'gemfile', 'vagrantfile',
    'readme', 'license', 'changelog', 'todo', 'fixme', 'authors', 'contributors'
  ];
  
  return textFileNames.includes(fileName);
}

/**
 * Klasörün skip edilip edilmeyeceğini kontrol et
 */
/**
 * Klasörün skip edilip edilmeyeceğini kontrol et - GÜVENLİK ODAKLI
 */
function shouldSkipDirectory(dirPath: string): boolean {
  const dirName = path.basename(dirPath).toLowerCase();
  const fullPath = dirPath.toLowerCase();
  
  // ❌ SİSTEM VE DRIVER KLASÖRLER - KESİNLİKLE ATLA
  const systemPaths = [
    'windows', 'system32', 'syswow64', 'drivers', 'driver',
    'program files', 'program files (x86)', 'programdata',
    'users\\all users', 'users\\default', 'users\\public',
    'temp', 'tmp', 'windows.old', 'recovery', 'system volume information',
    '$recycle.bin', 'pagefile.sys', 'hiberfil.sys',
    'msocache', 'intel', 'amd', 'nvidia', 'realtek'
  ];
  
  // Sistem yollarını kontrol et
  for (const sysPath of systemPaths) {
    if (fullPath.includes(sysPath)) {
      return true;
    }
  }
  
  // ❌ GELİŞTİRME ARAÇLARI - GEREKSIZ KLASÖRLER
  const skipDirs = [
    // Package managers
    'node_modules', 'bower_components', 'vendor', 'packages',
    '.npm', '.yarn', '.pnpm', 'npm-cache', 'yarn-cache',
    
    // Version control
    '.git', '.svn', '.hg', '.bzr',
    
    // Build outputs
    'build', 'dist', 'out', 'target', 'bin', 'obj',
    'debug', 'release', '.next', '.nuxt', '.gatsby',
    
    // IDE/Editor
    '.vs', '.vscode', '.idea', '.eclipse', '.sublime',
    
    // Language specific
    '__pycache__', '.venv', 'venv', 'env', '.env',
    '.gradle', '.maven', 'target',
    
    // Cache/temp
    'cache', '.cache', 'logs', '.logs', 'tmp', 'temp',
    '.tmp', '.temp', 'temporary internet files',
    
    // OS specific  
    '.ds_store', 'thumbs.db', 'desktop.ini',
    
    // Backup/Archive
    'backup', 'backups', '.backup', '.bak'
  ];
  
  // Hidden klasörler (. ile başlayan) - bazı istisnalar hariç
  if (dirName.startsWith('.')) {
    const allowedHiddenDirs = ['.vscode', '.github'];
    if (!allowedHiddenDirs.includes(dirName)) {
      return true;
    }
  }
  
  return skipDirs.includes(dirName);
}

/**
 * Dosya yolunun güvenli olup olmadığını kontrol et
 */
function isSafePath(filePath: string): boolean {
  const normalizedPath = path.normalize(filePath).toLowerCase();
  
  // ❌ Windows sistem klasörleri
  const unsafePaths = [
    'c:\\windows',
    'c:\\program files',
    'c:\\program files (x86)',
    'c:\\programdata',
    'c:\\system',
    'c:\\users\\all users',
    'c:\\users\\default',
    'c:\\users\\public',
    'c:\\$'
  ];
  
  for (const unsafePath of unsafePaths) {
    if (normalizedPath.startsWith(unsafePath)) {
      return false;
    }
  }
  
  // ✅ Güvenli user klasörleri
  const homeDir = require('os').homedir().toLowerCase();
  const safePaths = [
    path.join(homeDir, 'desktop'),
    path.join(homeDir, 'documents'),
    path.join(homeDir, 'downloads'),
    path.join(homeDir, 'projects'),
    path.join(homeDir, 'code'),
    path.join(homeDir, 'development'),
    path.join(homeDir, 'workspace')
  ];
  
  return safePaths.some(safePath => normalizedPath.startsWith(safePath.toLowerCase()));
}

/**
 * Metin dosyasını parçalara böl (chunking)
 */
function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? '. ' : '') + sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}

/**
 * Tek bir dosyayı indeksle
 */
async function indexFile(filePath: string): Promise<void> {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ File not found: ${filePath}`);
      return;
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return;
    }

    // Sadece metin dosyalarını indeksle
    if (!isTextFile(filePath)) {
      return; // Sessizce atla
    }

    // Dosya boyutu kontrolü (10MB'dan büyük dosyaları atla)
    if (stats.size > 10 * 1024 * 1024) {
      console.log(`⏭️ Skipping large file: ${path.basename(filePath)} (${Math.round(stats.size / 1024 / 1024)}MB)`);
      return;
    }

    const db = await loadDatabaseModule();
    const contentHash = calculateFileHash(filePath);
    
    // Daha önce indekslenmişse atla
    if (db.isFileIndexed(filePath, contentHash)) {
      return; // Sessizce atla
    }

    console.log(`📖 Indexing: ${path.relative(process.cwd(), filePath)}`);

    // Dosya içeriğini oku
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Çok kısa dosyaları atla
    if (content.trim().length < 10) {
      return;
    }

    // Metni parçalara böl
    const chunks = chunkText(content);
    
    // Her parçayı vektör veritabanına ekle
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = `${filePath}_chunk_${i}`;
      await db.addTextChunk(chunks[i], filePath, chunkId);
    }

    // Meta verileri SQLite'a kaydet
    db.saveFileMetadata(filePath, contentHash, stats.size);
    
    console.log(`✅ Indexed: ${path.basename(filePath)} (${chunks.length} chunks)`);
    
  } catch (error) {
    console.error(`❌ Error indexing file ${filePath}:`, error);
  }
}

/**
 * Bir klasördeki tüm dosyaları REKURSİF olarak indeksle
 */
export async function indexFiles(directoryPath: string, recursive: boolean = true): Promise<void> {
  try {
    console.log(`🚀 Starting to index files in: ${directoryPath} ${recursive ? '(recursive)' : ''}`);
    
    if (!fs.existsSync(directoryPath)) {
      console.error(`❌ Directory not found: ${directoryPath}`);
      return;
    }

    await indexDirectory(directoryPath, recursive);
    
    console.log(`🎉 Indexing completed for: ${directoryPath}`);
    
  } catch (error) {
    console.error('❌ Error during file indexing:', error);
  }
}

/**
 * Recursive directory indexing helper
 */
async function indexDirectory(dirPath: string, recursive: boolean, depth: number = 0): Promise<void> {
  const maxDepth = 10; // Sonsuz döngü koruması
  
  if (depth > maxDepth) {
    console.log(`⏭️ Max depth reached, skipping: ${dirPath}`);
    return;
  }
  
  // Bu klasörü skip etmeli miyiz?
  if (shouldSkipDirectory(dirPath)) {
    console.log(`⏭️ Skipping directory: ${path.basename(dirPath)}`);
    return;
  }

  try {
    const files = fs.readdirSync(dirPath);
    
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      
      try {
        const stats = fs.statSync(filePath);

        if (stats.isFile()) {
          await indexFile(filePath);
        } else if (stats.isDirectory() && recursive) {
          // Alt klasörü recursive olarak indeksle
          await indexDirectory(filePath, recursive, depth + 1);
        }
      } catch (fileError) {
        // Dosya erişim hatalarını sessizce atla (permission denied, etc.)
        continue;
      }
    }
  } catch (dirError) {
    console.error(`❌ Error reading directory ${dirPath}:`, dirError);
  }
}

/**
 * Dosya değişikliklerini izle - GENİŞLETİLMİŞ
 */
export function startFileWatcher(directoryPath: string): void {
  try {
    console.log(`👀 Starting file watcher for: ${directoryPath}`);
    
    // Önceki watcher'ı kapat
    if (watcher) {
      watcher.close();
    }

    watcher = chokidar.watch(directoryPath, {
      ignored: [
        /(^|[\/\\])\../, // Hidden files
        /node_modules/,
        /__pycache__/,
        /\.git/,
        /target/,
        /build/,
        /dist/
      ],
      persistent: true,
      ignoreInitial: true,
      depth: 10 // Recursive depth
    });

    watcher
      .on('add', async (filePath) => {
        console.log(`📁 New file detected: ${path.relative(process.cwd(), filePath)}`);
        await indexFile(filePath);
      })
      .on('change', async (filePath) => {
        console.log(`📝 File changed: ${path.relative(process.cwd(), filePath)}`);
        await indexFile(filePath);
      })
      .on('unlink', (filePath) => {
        console.log(`🗑️ File deleted: ${path.relative(process.cwd(), filePath)}`);
        // TODO: Veritabanından da sil
      })
      .on('error', (error) => {
        console.error('❌ File watcher error:', error);
      });

    console.log('✅ File watcher started successfully');
    
  } catch (error) {
    console.error('❌ Error starting file watcher:', error);
  }
}

/**
 * File watcher'ı durdur
 */
export function stopFileWatcher(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
    console.log('🛑 File watcher stopped');
  }
}