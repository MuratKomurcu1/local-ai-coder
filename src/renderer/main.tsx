import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '../App'  // App.tsx src/ içinde
import '../App.css'

console.log('main.tsx loaded')

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

postMessage({ payload: 'removeLoading' }, '*')