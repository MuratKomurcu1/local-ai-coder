// Dosya: src/components/SearchBar.tsx

import { useState } from 'react';

// Bu bileşenin dışarıdan bir onSearch fonksiyonu alacağını tanımlıyoruz
interface SearchBarProps {
  onSearch: (query: string) => void;
}

function SearchBar({ onSearch }: SearchBarProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    // Formun sayfayı yeniden yüklemesini engelle
    event.preventDefault(); 
    onSearch(query);
  };

  return (
    <form onSubmit={handleSubmit} className="search-bar">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Bilgi kalenizde arayın..."
      />
      <button type="submit">Ara</button>
    </form>
  );
}

export default SearchBar;