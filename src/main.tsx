import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { FigurePreview } from './ui/FigurePreview';
import { startDiscord } from './ui/discord';
import './ui/styles.css';

// Only does something when Discord launched the page.
startDiscord();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ?figures shows the player figures dev preview instead of the game. */}
    {new URLSearchParams(window.location.search).has('figures') ? <FigurePreview /> : <App />}
  </StrictMode>,
);
