import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { tauriBridge } from './bridge/tauri';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App bridge={tauriBridge} />
  </StrictMode>,
);
