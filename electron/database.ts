// electron/database.ts - DÜZELTİLMİŞ VERSİYON
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

// ✅ DÜZELTME 1: Import düzeltildi
let aiServiceModule: any = null;

// Interface tanımları
interface FileResult {
  path: string;
  file_size: number;
  indexed_date: string;
  content_hash?: string;
  file_type?: string;
  language?: string;
}

interface SearchResult {
  path: string;
  text: string;
  file_size?: number;
  indexed_date?: string;
  chunk_id?: string;
  type?: string;
  error?: string;
  relevance_score?: number;
  file_type?: string;
  language?: string;
}

interface DatabaseStats {
  total_files: number;
  total_chunks: number;
  last_updated: string;
  database_size: string;
  indexed_extensions: string[];
}

// Dinamik import için değişkenler
let Database: any;
let lancedb: any;

// Veritabanı bağlantıları
let sqliteDb: any;
let vectorTable: any;
let isInitialized = false;

const DB_DIR = path.join(app.getPath('userData'), 'SingletonDB');
const SQLITE_PATH = path.join(DB_DIR, 'metadata.sqlite');
const BACKUP_DIR = path.join(DB_DIR, 'backups');

/**
 * ✅ DÜZELTME 2: AI Service lazy loading
 */
async function getAIService() {
  if (!aiServiceModule) {
    try {
      const module = await import('./ai-service');
      aiServiceModule = module.aiService || module.default;
      console.log('✅ AI Service loaded');
    } catch (error) {
      console.warn('⚠️ AI Service not available:', error);
      // Mock AI service
      aiServiceModule = {
        getEmbedding: async (text: string) => {
          // Basit hash-based embedding
          const hash = text.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
          }, 0);
          return Array(768).fill(0).map((_, i) => Math.sin(Math.abs(hash) + i * 0.1) * 0.1);
        }
      };
    }
  }
  return aiServiceModule;
}

/**
 * Veritabanı yedekleme sistemi
 */
async function createBackup(): Promise<void> {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `database_backup_${timestamp}.sqlite`);
    
    if (fs.existsSync(SQLITE_PATH)) {
      fs.copyFileSync(SQLITE_PATH, backupPath);
      console.log(`💾 Database backup created: ${backupPath}`);
    }
  } catch (error) {
    console.error('❌ Backup creation failed:', error);
  }
}

/**
 * Veritabanı sağlık kontrolü
 */
function checkDatabaseHealth(): boolean {
  try {
    if (!sqliteDb) return false;
    
    // Basit bir sorgu çalıştırarak bağlantıyı test et
    const result = sqliteDb.prepare('SELECT COUNT(*) as count FROM files').get();
    return typeof result.count === 'number';
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    return false;
  }
}

/**
 * ✅ DÜZELTME 3: Database schema düzeltildi
 */
export async function setupDatabase(): Promise<boolean> {
  try {
    console.log(`📁 Database directory: ${DB_DIR}`);
    
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
      console.log('📁 Created database directory');
    }
    
    // Günlük yedek oluştur
    await createBackup();
    
    // 1. Better-sqlite3'ü dinamik olarak yükle ve kur
    console.log('📦 Loading better-sqlite3...');
    try {
      const sqlite3Module = await import('better-sqlite3');
      Database = sqlite3Module.default;
      console.log('✅ Better-sqlite3 loaded');
      
      console.log('🗄️ Setting up SQLite database...');
      sqliteDb = new Database(SQLITE_PATH);
      
      // ✅ DÜZELTME: Gelişmiş tablo yapısı - chunk_count kolonu eklendi
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT UNIQUE NOT NULL,
          content_hash TEXT NOT NULL,
          last_indexed INTEGER NOT NULL,
          file_size INTEGER,
          file_type TEXT,
          language TEXT,
          chunk_count INTEGER DEFAULT 0,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE TABLE IF NOT EXISTS chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_path TEXT NOT NULL,
          chunk_id TEXT NOT NULL,
          text_content TEXT NOT NULL,
          file_type TEXT,
          language TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now')),
          UNIQUE(file_path, chunk_id)
        );

        CREATE TABLE IF NOT EXISTS search_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL,
          results_count INTEGER,
          search_type TEXT,
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        -- İndeksler
        CREATE INDEX IF NOT EXISTS idx_files_path ON files(file_path);
        CREATE INDEX IF NOT EXISTS idx_files_hash ON files(content_hash);
        CREATE INDEX IF NOT EXISTS idx_files_type ON files(file_type);
        CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(file_path);
        CREATE INDEX IF NOT EXISTS idx_search_history_query ON search_history(query);
      `);
      
      // ✅ DÜZELTME: Eksik chunk_count kolonu kontrolü ve eklenmesi
      try {
        sqliteDb.prepare('SELECT chunk_count FROM files LIMIT 1').get();
        console.log('✅ chunk_count column exists');
      } catch (error) {
        console.log('🔧 Adding missing chunk_count column...');
        sqliteDb.exec('ALTER TABLE files ADD COLUMN chunk_count INTEGER DEFAULT 0');
        console.log('✅ chunk_count column added');
      }
      
      console.log('✅ SQLite database ready with enhanced schema');
      
    } catch (error) {
      console.error('❌ SQLite setup failed:', error);
      console.log('📝 Continuing without SQLite...');
      sqliteDb = null;
    }
    
    // 2. LanceDB'yi dinamik olarak yükle
    console.log('📦 Loading LanceDB...');
    try {
      const lancedbModule = await import('@lancedb/lancedb');
      lancedb = lancedbModule.default || lancedbModule;
      console.log('✅ LanceDB loaded');
      
      console.log('🔍 Setting up LanceDB vector database...');
      const lancedbConnection = await lancedb.connect(DB_DIR);
      
      try {
        vectorTable = await lancedbConnection.openTable('file_vectors');
        console.log("✅ Existing 'file_vectors' table opened");
      } catch (e) {
        console.log("📝 Creating new 'file_vectors' table...");
        
        const sampleData = [{
          vector: Array(768).fill(0.1),
          text: 'sample text',
          path: 'sample/path.txt',
          chunk_id: 'sample_chunk_0',
          file_type: 'text',
          language: 'unknown',
          created_at: Date.now()
        }];
        
        vectorTable = await lancedbConnection.createTable('file_vectors', sampleData);
        console.log('✅ New vector table created with enhanced schema');
      }
      
    } catch (error) {
      console.error('❌ LanceDB setup failed:', error);
      console.log('📝 Continuing without LanceDB...');
      lancedb = null;
      vectorTable = null;
    }
    
    isInitialized = true;
    
    if (sqliteDb && vectorTable) {
      console.log('🎉 Database setup completed successfully! (SQLite + LanceDB)');
      return true;
    } else if (sqliteDb) {
      console.log('🎉 Database setup completed! (SQLite only)');
      return true;
    } else if (vectorTable) {
      console.log('🎉 Database setup completed! (LanceDB only)');
      return true;
    } else {
      console.log('⚠️ Database setup completed with limitations (No databases available)');
      return false;
    }
    
  } catch (error) {
    console.error('💥 Database setup error:', error);
    throw error;
  }
}

/**
 * Güvenli SQLite bağlantısı al
 */
export const getSqliteDb = () => {
  if (!sqliteDb) {
    throw new Error('SQLite database not initialized.');
  }
  if (!checkDatabaseHealth()) {
    throw new Error('SQLite database health check failed.');
  }
  return sqliteDb;
};

/**
 * Dosya türünü belirle
 */
function detectFileType(filePath: string): { type: string; language: string } {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath).toLowerCase();
  
  const typeMap: { [key: string]: { type: string; language: string } } = {
    '.js': { type: 'code', language: 'javascript' },
    '.ts': { type: 'code', language: 'typescript' },
    '.jsx': { type: 'code', language: 'react' },
    '.tsx': { type: 'code', language: 'react-typescript' },
    '.py': { type: 'code', language: 'python' },
    '.java': { type: 'code', language: 'java' },
    '.cpp': { type: 'code', language: 'cpp' },
    '.c': { type: 'code', language: 'c' },
    '.cs': { type: 'code', language: 'csharp' },
    '.php': { type: 'code', language: 'php' },
    '.rb': { type: 'code', language: 'ruby' },
    '.go': { type: 'code', language: 'go' },
    '.rs': { type: 'code', language: 'rust' },
    '.json': { type: 'data', language: 'json' },
    '.xml': { type: 'data', language: 'xml' },
    '.yaml': { type: 'config', language: 'yaml' },
    '.yml': { type: 'config', language: 'yaml' },
    '.md': { type: 'documentation', language: 'markdown' },
    '.txt': { type: 'text', language: 'plain' },
    '.html': { type: 'markup', language: 'html' },
    '.css': { type: 'style', language: 'css' },
    '.sql': { type: 'database', language: 'sql' }
  };
  
  if (typeMap[ext]) {
    return typeMap[ext];
  }
  
  // Uzantısız dosyalar için
  if (fileName.includes('dockerfile')) return { type: 'config', language: 'docker' };
  if (fileName.includes('makefile')) return { type: 'build', language: 'makefile' };
  if (fileName.includes('readme')) return { type: 'documentation', language: 'markdown' };
  
  return { type: 'unknown', language: 'unknown' };
}

/**
 * ✅ DÜZELTME 4: Gelişmiş dosya metadata kaydetme - chunk_count parametresi eklendi
 */
export function saveFileMetadata(filePath: string, contentHash: string, fileSize: number, chunkCount: number = 0): void {
  try {
    if (!sqliteDb) {
      console.log(`⏭️ Skipping metadata save (SQLite not available): ${path.basename(filePath)}`);
      return;
    }
    
    const { type, language } = detectFileType(filePath);
    const db = getSqliteDb();
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO files 
      (file_path, content_hash, last_indexed, file_size, file_type, language, chunk_count, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(filePath, contentHash, Date.now(), fileSize, type, language, chunkCount, Date.now());
    console.log(`💾 Saved metadata for: ${path.basename(filePath)} (${type}/${language}, ${chunkCount} chunks)`);
  } catch (error) {
    console.error('❌ Error saving metadata:', error);
  }
}

/**
 * Dosya indeks kontrolü
 */
export function isFileIndexed(filePath: string, contentHash: string): boolean {
  try {
    if (!sqliteDb) {
      console.log(`⏭️ Cannot check if indexed (SQLite not available): ${path.basename(filePath)}`);
      return false;
    }
    
    const db = getSqliteDb();
    const stmt = db.prepare('SELECT content_hash, last_indexed FROM files WHERE file_path = ?');
    const result = stmt.get(filePath);
    
    if (!result) return false;
    
    // Hash eşleşmesi ve 24 saatten eski değilse
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    return result.content_hash === contentHash && result.last_indexed > dayAgo;
  } catch (error) {
    console.error('❌ Error checking if file indexed:', error);
    return false;
  }
}

/**
 * ✅ DÜZELTME 5: Metin chunk ekleme - AI service import düzeltildi
 */
export async function addTextChunk(text: string, filePath: string, chunkId: string): Promise<void> {
  try {
    console.log(`📝 Adding text chunk: ${path.basename(filePath)} - ${chunkId}`);
    
    // SQLite'a chunk bilgisini kaydet
    if (sqliteDb) {
      const db = getSqliteDb();
      const { type, language } = detectFileType(filePath);
      
      // Chunk'ı kaydet
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO chunks 
        (file_path, chunk_id, text_content, file_type, language)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(filePath, chunkId, text, type, language);
      console.log(`✅ Chunk saved to SQLite: ${chunkId}`);
    }
    
    // Vector DB'ye eklemeyi dene (opsiyonel)
    if (vectorTable) {
      try {
        const { type, language } = detectFileType(filePath);
        const aiService = await getAIService();
        
        // ✅ DÜZELTME: Doğru AI service çağrısı
        const vector = await aiService.getEmbedding(text);
        
        await vectorTable.add([{
          vector,
          text,
          path: filePath,
          chunk_id: chunkId,
          file_type: type,
          language: language,
          created_at: Date.now()
        }]);
        
        console.log(`✅ Added to vector DB: ${chunkId}`);
      } catch (vectorError) {
        console.log(`⚠️ Vector DB skip: ${vectorError}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error adding text chunk:', error);
  }
}

/**
 * Veritabanı istatistikleri al
 */
export function getDatabaseStats(): DatabaseStats {
  try {
    if (!sqliteDb) {
      return {
        total_files: 0,
        total_chunks: 0,
        last_updated: 'N/A',
        database_size: '0 MB',
        indexed_extensions: []
      };
    }
    
    const db = getSqliteDb();
    
    const fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get();
    const chunkCount = db.prepare('SELECT COUNT(*) as count FROM chunks').get();
    const lastUpdate = db.prepare('SELECT MAX(last_indexed) as last FROM files').get();
    const extensions = db.prepare('SELECT DISTINCT file_type FROM files WHERE file_type IS NOT NULL').all();
    
    const dbSize = fs.existsSync(SQLITE_PATH) ? 
      (fs.statSync(SQLITE_PATH).size / (1024 * 1024)).toFixed(2) + ' MB' : '0 MB';
    
    return {
      total_files: fileCount.count || 0,
      total_chunks: chunkCount.count || 0,
      last_updated: lastUpdate.last ? new Date(lastUpdate.last).toLocaleString() : 'Never',
      database_size: dbSize,
      indexed_extensions: extensions.map((e: any) => e.file_type)
    };
  } catch (error) {
    console.error('❌ Error getting database stats:', error);
    return {
      total_files: 0,
      total_chunks: 0,
      last_updated: 'Error',
      database_size: '0 MB',
      indexed_extensions: []
    };
  }
}

/**
 * Gelişmiş benzerlik araması
 */
export async function searchNotesBySimilarity(query: string): Promise<SearchResult[]> {
  try {
    console.log(`🔍 Enhanced searching for: "${query}"`);
    
    if (!sqliteDb) {
      console.log('❌ No SQLite database available');
      return [{ path: 'no-db.txt', text: 'SQLite database not available' }];
    }

    const db = getSqliteDb();
    const allFiles = db.prepare('SELECT COUNT(*) as count FROM files').get();
    
    console.log(`📊 Total files in database: ${allFiles.count}`);
    
    if (allFiles.count === 0) {
      return [{ 
        path: 'no-files.txt', 
        text: '❌ Veritabanında hiç dosya yok. Önce indexleme yapın.',
        type: 'error'
      }];
    }
    
    // Gelişmiş arama stratejisi
    let fileResults: FileResult[] = [];
    const lowerQuery = query.toLowerCase();
    
    // 1. Dosya adında tam eşleşme
    console.log('🎯 Phase 1: Exact filename match');
    const exactStmt = db.prepare(`
      SELECT file_path as path, file_size, file_type, language,
             datetime(last_indexed/1000, 'unixepoch') as indexed_date
      FROM files 
      WHERE LOWER(file_path) LIKE ? 
      ORDER BY last_indexed DESC 
      LIMIT 5
    `);
    
    fileResults = exactStmt.all(`%${lowerQuery}%`) as FileResult[];
    console.log(`📋 Exact matches: ${fileResults.length}`);
    
    // 2. Dosya türüne göre arama
    if (fileResults.length < 3) {
      console.log('🔍 Phase 2: File type search');
      const typeStmt = db.prepare(`
        SELECT file_path as path, file_size, file_type, language,
               datetime(last_indexed/1000, 'unixepoch') as indexed_date
        FROM files 
        WHERE file_type LIKE ? OR language LIKE ?
        ORDER BY last_indexed DESC 
        LIMIT 10
      `);
      
      const typeResults = typeStmt.all(`%${lowerQuery}%`, `%${lowerQuery}%`) as FileResult[];
      fileResults = [...fileResults, ...typeResults];
    }
    
    // 3. Genel arama
    if (fileResults.length < 5) {
      console.log('🔍 Phase 3: General search');
      const generalStmt = db.prepare(`
        SELECT file_path as path, file_size, file_type, language,
               datetime(last_indexed/1000, 'unixepoch') as indexed_date
        FROM files 
        ORDER BY 
          CASE 
            WHEN LOWER(file_path) LIKE ? THEN 1
            WHEN file_type IN ('code', 'documentation') THEN 2
            ELSE 3
          END,
          last_indexed DESC 
        LIMIT 15
      `);
      
      const generalResults = generalStmt.all(`%${lowerQuery}%`) as FileResult[];
      fileResults = [...fileResults, ...generalResults];
    }
    
    // Duplikasyonları temizle
    const uniqueResults = fileResults.filter((result, index, self) => 
      index === self.findIndex(r => r.path === result.path)
    ).slice(0, 10);
    
    // İçerik analizi ve sonuç oluşturma
    const resultsWithContent: SearchResult[] = [];
    
    for (const fileResult of uniqueResults) {
      console.log(`📄 Processing file: ${fileResult.path}`);
      
      try {
        if (fs.existsSync(fileResult.path)) {
          const content = fs.readFileSync(fileResult.path, 'utf8');
          const fileName = path.basename(fileResult.path);
          
          let preview = '';
          const lowerContent = content.toLowerCase();
          
          if (lowerContent.includes(lowerQuery) || fileName.toLowerCase().includes(lowerQuery)) {
            // Relevantlık skoru hesapla
            const titleMatch = fileName.toLowerCase().includes(lowerQuery) ? 10 : 0;
            const contentMatches = (lowerContent.match(new RegExp(lowerQuery, 'g')) || []).length;
            const relevanceScore = titleMatch + contentMatches;
            
            // İlgili satırları bul
            const lines = content.split('\n');
            const relevantLines = lines.filter(line => 
              line.toLowerCase().includes(lowerQuery) || 
              line.includes('interface') || 
              line.includes('class') || 
              line.includes('function') ||
              line.includes('export') ||
              line.includes('import')
            ).slice(0, 15);
            
            if (relevantLines.length > 0) {
              preview = relevantLines.join('\n');
            } else {
              preview = content.substring(0, 600) + '...';
            }
            
            resultsWithContent.push({
              path: fileResult.path,
              text: `📄 ${fileName} (${fileResult.file_type}/${fileResult.language})\n\n${preview}`,
              file_size: fileResult.file_size,
              indexed_date: fileResult.indexed_date,
              file_type: fileResult.file_type,
              language: fileResult.language,
              relevance_score: relevanceScore
            });
          } else {
            preview = content.substring(0, 400) + '...';
            
            resultsWithContent.push({
              path: fileResult.path,
              text: `📄 ${fileName} (${fileResult.file_type}/${fileResult.language})\n\n${preview}`,
              file_size: fileResult.file_size,
              indexed_date: fileResult.indexed_date,
              file_type: fileResult.file_type,
              language: fileResult.language,
              relevance_score: 1
            });
          }
          
          console.log(`✅ Added content for: ${fileName}`);
        } else {
          console.log(`❌ File not found: ${fileResult.path}`);
        }
      } catch (error) {
        console.error(`❌ Error reading file ${fileResult.path}:`, error);
      }
    }
    
    // Relevansa göre sırala
    resultsWithContent.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
    
    if (resultsWithContent.length > 0) {
      return resultsWithContent;
    }
    
    return [
      { 
        path: 'no-results.txt', 
        text: `🔍 "${query}" için dosya bulunamadı.\n\n📊 Veritabanında ${allFiles.count} dosya var.\n\nDeneyebileceğiniz:\n📁 Tam dosya adı (örn: "database.ts")\n📁 Dosya türü (örn: "code", "documentation")\n📁 Programlama dili (örn: "typescript", "javascript")\n📁 Kod parçası (örn: "function", "class")`,
        type: 'help'
      }
    ];
    
  } catch (error) {
    console.error('🔍 Enhanced search error:', error);
    return [
      { 
        path: 'error.txt', 
        text: `❌ Arama hatası: ${error instanceof Error ? error.message : String(error)}`,
        type: 'error'
      }
    ];
  }
}

/**
 * Hızlı klasör indexleme
 */
async function quickIndexFolder(folderPath: string): Promise<string> {
  try {
    let cleanPath = folderPath
      .replace(/"|'/g, '')
      .replace(/├Âr/g, 'ör')
      .replace(/├ğ/g, 'ğ')
      .trim();
    
    console.log(`🔍 Original path: "${folderPath}"`);
    console.log(`🧹 Cleaned path: "${cleanPath}"`);
    
    let normalizedPath = cleanPath;
    
    if (!path.isAbsolute(cleanPath)) {
      const homeDir = require('os').homedir();
      const possiblePaths = [
        path.join(homeDir, 'Desktop', cleanPath),
        path.join(homeDir, 'Documents', cleanPath),
        path.join(homeDir, 'Downloads', cleanPath),
        path.join(homeDir, 'Projects', cleanPath),
        path.join(homeDir, 'Code', cleanPath),
        path.join(homeDir, 'Development', cleanPath),
        path.join(homeDir, cleanPath)
      ];
      
      console.log(`🔍 Searching in these paths:`);
      possiblePaths.forEach(p => console.log(`  - ${p}`));
      
      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          normalizedPath = possiblePath;
          console.log(`✅ Found folder at: ${normalizedPath}`);
          break;
        }
      }
    }
    
    if (!fs.existsSync(normalizedPath)) {
      return `❌ Klasör bulunamadı: "${cleanPath}"\n\n🔍 Aranan yerler:\n${[
        path.join(require('os').homedir(), 'Desktop', cleanPath),
        path.join(require('os').homedir(), 'Documents', cleanPath),
        path.join(require('os').homedir(), 'Downloads', cleanPath)
      ].map(p => `  • ${p}`).join('\n')}`;
    }
    
    if (!fs.statSync(normalizedPath).isDirectory()) {
      return `❌ Bu bir klasör değil: ${cleanPath}`;
    }
    
    console.log(`🚀 Quick indexing folder: ${normalizedPath}`);
    
    const startTime = Date.now();
    const fileService = await import('./file-service');
    await fileService.indexFiles(normalizedPath, true);
    const endTime = Date.now();
    
    if (sqliteDb) {
      const db = getSqliteDb();
      const count = db.prepare('SELECT COUNT(*) as count FROM files WHERE file_path LIKE ?').get(`${normalizedPath}%`);
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      return `✅ Klasör indexlendi: ${normalizedPath}\n📊 ${count.count} dosya işlendi\n⏱️ Süre: ${duration} saniye`;
    }
    
    return `✅ Klasör indexlendi: ${normalizedPath}`;
    
  } catch (error) {
    console.error('Quick index error:', error);
    return `❌ İndexleme hatası: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Akıllı hibrit arama - En gelişmiş versiyon
 */
export async function smartHybridSearch(query: string): Promise<SearchResult[]> {
  try {
    console.log(`🧠 Smart hybrid search for: "${query}"`);
    
    const lowerQuery = query.toLowerCase();
    
    // Klasör indexleme komutları
    if (lowerQuery.includes('klasör:') || lowerQuery.includes('folder:') || lowerQuery.includes('index:')) {
      const folderPath = query.split(':')[1]?.trim();
      if (folderPath) {
        const indexResult = await quickIndexFolder(folderPath);
        return [{
          path: '📁 Klasör İndexleme Sonucu',
          text: indexResult,
          type: 'index_result'
        }];
      }
    }
    
    // İstatistik komutları
    if (lowerQuery.includes('istatistik') || lowerQuery.includes('stats')) {
      const stats = getDatabaseStats();
      return [{
        path: '📊 Veritabanı İstatistikleri',
        text: `📈 Singleton Database Analytics

📁 DOSYA İSTATİSTİKLERİ:
• Toplam Dosya: ${stats.total_files.toLocaleString()}
• Toplam Chunk: ${stats.total_chunks.toLocaleString()}
• Son Güncelleme: ${stats.last_updated}
• Veritabanı Boyutu: ${stats.database_size}

📂 DOSYA TİPLERİ:
${stats.indexed_extensions.length > 0 ? 
  stats.indexed_extensions.map(ext => `• ${ext.charAt(0).toUpperCase() + ext.slice(1)}`).join('\n') :
  '• Henüz dosya indexlenmemiş'
}

🔧 SİSTEM DURUMU:
• SQLite: ${sqliteDb ? '✅ Aktif' : '❌ Pasif'}
• LanceDB: ${vectorTable ? '✅ Aktif' : '❌ Pasif'}
• Database Health: ${checkDatabaseHealth() ? '✅ Sağlıklı' : '⚠️ Problem Var'}`,
        type: 'stats'
      }];
    }
    
    // Yardım komutları
    if (lowerQuery.includes('yardım') || lowerQuery.includes('help') || query === '?') {
      return [{
        path: '❓ Yardım Kılavuzu',
        text: `🚀 Singleton AI Kod Mühendisi - Kullanım Kılavuzu

📁 KLASÖR İŞLEMLERİ:
• "klasör: proje_adı" - Klasör indexle
• "folder: C:\\path\\to\\folder" - Tam yol ile indexle

🔍 ARAMA YÖNTEMLERİ:
• "database kodunu göster" - Kod dosyası ara
• "typescript interface" - Kod yapısı ara
• "error handler" - Fonksiyon ara

📊 SİSTEM KOMUTLARI:
• "istatistik" - Veritabanı bilgileri
• "yardım" - Bu mesajı göster

💡 İPUÇLARI:
• Türkçe ve İngilizce arama desteklenir
• Dosya adları tam olarak yazılmalıdır
• Büyük-küçük harf duyarlı değildir`,
        type: 'help'
      }];
    }
    
    // Normal arama
    return await searchNotesBySimilarity(query);
    
  } catch (error) {
    console.error('🧠 Smart hybrid search error:', error);
    return [
      { 
        path: 'error.txt', 
        text: `❌ Akıllı arama hatası: ${error instanceof Error ? error.message : String(error)}`,
        type: 'error'
      }
    ];
  }
}

/**
 * Veritabanını güvenli şekilde kapat
 */
export function closeDatabase(): void {
  try {
    if (sqliteDb) {
      sqliteDb.close();
      sqliteDb = null;
      console.log('✅ SQLite database closed');
    }
    
    if (vectorTable) {
      vectorTable = null;
      console.log('✅ Vector database connection closed');
    }
    
    isInitialized = false;
  } catch (error) {
    console.error('❌ Error closing database:', error);
  }
}

// Process kapanırken veritabanını temizle
process.on('beforeExit', () => {
  closeDatabase();
});

process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});
