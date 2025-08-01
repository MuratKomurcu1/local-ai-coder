import React, { useState, useEffect } from 'react';

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Hazır');

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    
    try {
      const result = await (window as any).electronAPI.searchFiles(query);
      setResults(result.ok ? result.data : []);
      setStatus(`${result.data?.length || 0} sonuç bulundu`);
    } catch (error) {
      setResults([]);
      setStatus('Arama hatası');
    }
    
    setLoading(false);
  };

  const indexFolder = async () => {
    setStatus('Klasör seçiliyor...');
    
    try {
      const result = await (window as any).electronAPI.openFolderDialog();
      if (result.ok && result.data) {
        setStatus(`İndeksleniyor: ${result.data.path}`);
      } else {
        setStatus('İptal edildi');
      }
    } catch (error) {
      setStatus('Klasör seçim hatası');
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>🚀 Singleton AI</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Arama yap..."
          style={{ 
            width: '300px', 
            padding: '10px', 
            marginRight: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px'
          }}
          onKeyPress={(e) => e.key === 'Enter' && search()}
        />
        
        <button 
          onClick={search} 
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '10px'
          }}
        >
          {loading ? 'Arıyor...' : 'Ara'}
        </button>
        
        <button 
          onClick={indexFolder}
          style={{
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Klasör İndeksle
        </button>
      </div>

      <div style={{ 
        padding: '10px', 
        backgroundColor: '#f8f9fa', 
        borderRadius: '4px',
        marginBottom: '20px'
      }}>
        Durum: {status}
      </div>

      {results.length > 0 && (
        <div>
          <h3>Sonuçlar ({results.length})</h3>
          {results.map((result, index) => (
            <div key={index} style={{
              border: '1px solid #ddd',
              padding: '15px',
              marginBottom: '10px',
              borderRadius: '4px',
              backgroundColor: 'white'
            }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>
                {result.path}
              </h4>
              <pre style={{
                background: '#f8f9fa',
                padding: '10px',
                borderRadius: '4px',
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                maxHeight: '200px',
                overflow: 'auto'
              }}>
                {result.text}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
