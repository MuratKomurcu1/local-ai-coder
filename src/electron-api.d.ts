// Bu dosya, TypeScript'e preload betiğimizin window nesnesine
// hangi fonksiyonları eklediğini "öğretir".

// Bu satır, bu dosyanın global (genel) tanımlamalar içerdiğini belirtir.
declare global {
  // Mevcut 'Window' arayüzünü genişletiyoruz
  interface Window {
    // electronAPI adında bir özelliğimiz olduğunu söylüyoruz
    electronAPI: {
      // Bu özelliğin 'searchFiles' adında bir fonksiyonu var.
      // Bu fonksiyon bir string alır ve bir Promise döndürür.
      searchFiles: (query: string) => Promise<any[]>;
    };
  }
}

// Bu boş export, dosyanın bir modül olarak doğru şekilde
// işlenmesini sağlamak için gereklidir.
export {};