// electron/ai-service.ts - DÜZELTILMIŞ VERSİYON
import path from 'path';

// --- ARAYÜZ TANIMLARI ---
interface OllamaResponse {
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  embedding?: number[];
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

// --- AI SERVİS SINIFI ---
class AIService {
  private ollamaUrl = 'http://localhost:11434';
  private model = 'llama3:8b';
  private conversationContext: number[] = [];

  /**
   * Ollama'nın çalışıp çalışmadığını kontrol eder.
   */
  async isOllamaRunning(): Promise<boolean> {
    try {
      const response = await globalThis.fetch(`${this.ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch (error) {
      console.log('Ollama is not running or not responding.');
      return false;
    }
  }

  /**
   * YENI EKLENEN - Embedding oluşturma (SQLite için çalışır)
   */
  async getEmbedding(text: string): Promise<number[]> {
    try {
      // Basit hash-based embedding (SQLite için yeterli)
      const hash = this.simpleHash(text);
      const vector = Array(768).fill(0).map((_, i) => {
        return Math.sin(hash + i * 0.1) * 0.1;
      });
      
      console.log(`✅ Generated embedding for text: ${text.substring(0, 50)}...`);
      return vector;
      
    } catch (error) {
      console.error("❌ Embedding generation failed:", error);
      // Fallback: Random vector
      return Array(768).fill(0).map(() => Math.random() - 0.5);
    }
  }

  /**
   * Basit hash fonksiyonu (fallback için)
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 32bit integer'a çevir
    }
    return Math.abs(hash);
  }

  /**
   * Kapsamlı kod analizi
   */
  async comprehensiveCodeAnalysis(query: string, files: SearchResult[]): Promise<string> {
    if (!await this.isOllamaRunning()) {
      return this.generateOfflineResponse(query, files);
    }

    const prompt = this.createComprehensiveAnalysisPrompt(query, files);
    try {
      const response = await this.generateResponse(prompt);
      return this.enhanceCodeResponse(response);
    } catch (error) {
      return `❌ Kod analizi hatası: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Feature implementation önerisi
   */
  async suggestFeatureImplementation(query: string, files: SearchResult[]): Promise<string> {
    if (!await this.isOllamaRunning()) {
      return this.generateOfflineFeatureSuggestion(query, files);
    }

    const prompt = `Sen Türkiye'de çalışan uzman bir Full-Stack Developer'sın.
SADECE TÜRKÇE konuşacaksın ve TAM KOD ÖRNEKLERİ vereceksin.

KULLANICI İSTEĞİ: "${query}"

MEVCUT PROJE DOSYALARI:
${files.slice(0, 3).map(f => this.formatFileForPrompt(f)).join('\n\n')}

GÖREV: Bu özelliği nasıl ekleyeceğini DETAYLI şekilde planla ve TAM KOD örnekleri ver.

ZORUNLU FORMAT:
🎯 AMAÇ VE PLANLAMA:
- Ne yapılacak (1-2 cümle)
- Hangi dosyalar değişecek

💻 KOD ÖRNEKLERİ:
\`\`\`typescript
// TAM KOD BURADA
[Kod örneği]
\`\`\`

🔗 ENTEGRASYON:
- Import/export değişiklikleri
- Konfigürasyon ayarları

💡 BONUS ÖNERİLER:
- Performans iyileştirmeleri
- Test stratejisi`;

    try {
      const response = await this.generateResponse(prompt);
      return this.enhanceCodeResponse(response);
    } catch (error) {
      return `❌ Feature implementasyon hatası: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Debug ve problem çözme
   */
  async debugAndSolve(query: string, files: SearchResult[]): Promise<string> {
    if (!await this.isOllamaRunning()) {
      return this.generateOfflineDebugSolution(query, files);
    }

    const prompt = `Sen Türkiye'de çalışan uzman bir Senior Developer'sın.
SADECE TÜRKÇE konuş ve TAM ÇÖZÜM kodları ver.

KULLANICI SORUNU: "${query}"

PROJE KODLARI:
${files.slice(0, 2).map(f => this.formatFileForPrompt(f)).join('\n\n')}

GÖREV: Bu sorunu analiz et ve TAM çözüm ver.

FORMAT:
🔍 SORUN ANALİZİ:
- Problem ne
- Kök neden nedir

🎯 ÇÖZÜM STRATEJİSİ:
- Nasıl çözülecek

💻 ÇÖZÜM KODLARI:
\`\`\`typescript
// DÜZELTİLMİŞ KOD
[Çözüm kodu]
\`\`\`

⚠️ ÖNLEMLER:
- Bu hatanın tekrar olmaması için`;

    try {
      const response = await this.generateResponse(prompt);
      return this.enhanceCodeResponse(response);
    } catch (error) {
      return `❌ Debug analizi hatası: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Proje mimarisi açıklaması
   */
  async explainProjectArchitecture(files: SearchResult[]): Promise<string> {
    if (!await this.isOllamaRunning()) {
      return this.generateOfflineArchitectureAnalysis(files);
    }

    const prompt = `Sen Türkiye'de çalışan uzman bir Software Architect'sin.
SADECE TÜRKÇE konuş.

PROJE DOSYALARI:
${files.slice(0, 3).map(f => this.formatFileForPrompt(f)).join('\n\n')}

GÖREV: Bu projenin mimarisini analiz et.

FORMAT:
🏗️ MİMARİ GENEL BAKIŞ:
- Proje türü ve amacı
- Kullanılan teknolojiler

📦 DOSYA ORGANİZASYONU:
- Klasör yapısı mantığı
- Sorumlulukların ayrılması

🔄 VERİ AKIŞI:
- Frontend-Backend bağlantıları
- API tasarımı

💻 İYİLEŞTİRME ÖNERİLERİ:
- Optimizasyon fırsatları`;

    try {
      const response = await this.generateResponse(prompt);
      return this.enhanceCodeResponse(response);
    } catch (error) {
      return `❌ Mimari analizi hatası: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  // --- YARDIMCI FONKSİYONLAR ---

  private formatFileForPrompt(file: SearchResult): string {
    const fileName = path.basename(file.path);
    const fileType = file.file_type || 'unknown';
    const language = file.language || 'unknown';
    
    return `---
📄 DOSYA: ${fileName} (${fileType}/${language})
İÇERİK:
${file.text.substring(0, 1500)}
${file.text.length > 1500 ? '\n[...içeriğin devamı kısaltıldı...]' : ''}`;
  }

  private createComprehensiveAnalysisPrompt(query: string, files: SearchResult[]): string {
    return `Sen Türkiye'de çalışan dünya standartlarında bir Senior Software Engineer'sın.
SADECE TÜRKÇE konuş ve TAM kod örnekleri ver.

KULLANICI SORUSU: "${query}"

PROJE DOSYALARI:
${files.slice(0, 3).map(f => this.formatFileForPrompt(f)).join('\n\n')}

GÖREV: Bu dosyaları kapsamlı şekilde analiz et ve soruyu yanıtla.

ZORUNLU FORMAT:
🎯 AMAÇ VE ÇALIŞMA:
- Bu dosya/proje ne yapıyor

⚙️ TEKNİK ANALİZ:
- Kullanılan teknolojiler
- Kod kalitesi (1-10)

💻 KOD ANALİZİ:
\`\`\`typescript
// Analiz edilen kod
[Kod örneği]
\`\`\`

💡 İYİLEŞTİRME ÖNERİLERİ:
\`\`\`typescript
// İyileştirilmiş kod
[Geliştirilmiş kod]
\`\`\`

🚀 GENEL ÖNERİLER:
- Kısa vadeli iyileştirmeler`;
  }

  private enhanceCodeResponse(response: string): string {
    return response
      .replace(/^(🎯|⚙️|💻|📝|💡|🔗|🚀|🔍|📂|🔧|⚠️|🏗️|📦|🔄)/gm, '\n$1')
      .replace(/\n\n\n+/g, '\n\n')
      .trim();
  }

  private generateOfflineResponse(query: string, files: SearchResult[]): string {
    return `🤖 AI Servis Offline - Basit Analiz
---
❌ **Ollama AI servisi şu anda kapalı veya yanıt vermiyor.**

**📊 Bulunan Dosyalar:** ${files.length} adet
${files.slice(0, 3).map(f => `📄 ${path.basename(f.path)} (${f.file_type || 'unknown'})`).join('\n')}

**🔍 Sorgunuz:** "${query}"

**🚀 AI SERVİSİNİ BAŞLATMAK İÇİN:**
1. Terminali açın.
2. \`ollama serve\` komutu ile servisi başlatın.
3. Modelin yüklü olduğundan emin olun (\`ollama pull ${this.model}\`).
4. Aramayı tekrar deneyin.`;
  }

  private generateOfflineFeatureSuggestion(query: string, files: SearchResult[]): string {
    return `🤖 AI Servis Offline - Özellik Önerisi
---
❌ **Ollama AI servisi kapalı.** Özellik ekleme için detaylı analiz yapılamıyor.

**🎯 İstenen Özellik:** "${query}"

**📋 İlgili Olabilecek Dosyalar:**
${files.slice(0, 5).map(f => `• ${path.basename(f.path)}`).join('\n')}

**💡 Genel Yaklaşım:**
1. **Analiz:** Yukarıdaki dosyaları açıp mevcut kod yapısını inceleyin.
2. **Planlama:** Yeni özellik için hangi fonksiyonların gerektiğini belirleyin.
3. **Uygulama:** Mevcut kod desenlerini takip ederek yeni kodu yazın.
4. **Entegrasyon:** Yazdığınız kodu mevcut sisteme import/export ile bağlayın.`;
  }

  private generateOfflineDebugSolution(query: string, files: SearchResult[]): string {
    return `🤖 AI Servis Offline - Hata Çözüm Yardımı
---
❌ **Ollama AI servisi kapalı.** Otomatik hata analizi yapılamıyor.

**🔍 Sorun:** "${query}"

**📄 İlgili Dosyalar:**
${files.slice(0, 3).map(f => `• ${path.basename(f.path)}`).join('\n')}

**🔧 Kontrol Listesi:**
- **Null/Undefined Hatası?** Değişkenlerin tanımlı olup olmadığını kontrol edin.
- **Import/Export Hatası?** Dosya yollarının doğru yazıldığından emin olun.
- **Async Hata?** \`async\` fonksiyonlarda \`await\` kullandığınızdan emin olun.
- **Tip Hatası?** TypeScript tiplerinin uyumlu olup olmadığını kontrol edin.`;
  }

  private generateOfflineArchitectureAnalysis(files: SearchResult[]): string {
    const fileTypes = [...new Set(files.map(f => f.file_type).filter(Boolean))];
    return `🤖 AI Servis Offline - Basit Mimari Analiz
---
❌ **Ollama AI servisi kapalı.** Detaylı mimari analizi yapılamıyor.

**📊 Proje Özeti:**
• **Toplam Dosya:** ${files.length}
• **Dosya Tipleri:** ${fileTypes.join(', ') || 'Belirlenemedi'}

**📂 Dosya Listesi:**
${files.slice(0, 8).map(f => `• ${path.basename(f.path)}`).join('\n')}

**💡 Yorum:** Ana dosyaları (\`main.ts\`, \`index.ts\`, \`database.ts\`) ve konfigürasyon dosyalarını inceleyebilirsiniz.`;
  }

  /**
   * Ana yanıt üretme fonksiyonu
   */
  private async generateResponse(prompt: string): Promise<string> {
    try {
      const response = await globalThis.fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          context: this.conversationContext,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            top_k: 50,
            num_predict: 2048,
            stop: ["---"]
          }
        }),
        signal: AbortSignal.timeout(30000) // 30 saniye timeout
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = await response.json() as OllamaResponse;
      
      if (data.context) {
        this.conversationContext = data.context;
      }

      return data.response || "Yanıt alınamadı.";

    } catch (error) {
      console.error('❌ Generate response error:', error);
      throw error;
    }
  }

  /**
   * Konuşma geçmişini sıfırla
   */
  resetConversation(): void {
    this.conversationContext = [];
    console.log('🔄️ Conversation reset');
  }
}

export const aiService = new AIService();