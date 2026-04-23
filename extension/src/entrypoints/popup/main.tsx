import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/lib/i18n';
import { App } from './App';
import '@/assets/main.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
