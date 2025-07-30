import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main/index.ts'),
        formats: ['cjs'],
        fileName: 'index'
      },
      rollupOptions: {
        external: [
          'electron', 
          'lancedb', 
          '@lancedb/lancedb', 
          'better-sqlite3',
          'chokidar',
          'crypto',
          'fs',
          'path'
        ]
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'electron')
      }
    }
  },
  preload: {
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload/index.ts'),
        formats: ['cjs'],
        fileName: 'index'
      },
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  }
})