import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { startDiscord } from './ui/discord';
import './ui/styles.css';

// Only does something when Discord launched the page.
startDiscord();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
