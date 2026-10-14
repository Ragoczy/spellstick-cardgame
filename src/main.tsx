import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { CardPreview } from './ui/CardPreview';
import { FigurePreview } from './ui/FigurePreview';
import { startDiscord } from './ui/discord';
import './ui/styles.css';

// Only does something when Discord launched the page.
startDiscord();

const params = new URLSearchParams(window.location.search);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* ?figures and ?cards show dev previews (player figures, the full card design) instead of the game. */}
    {params.has('figures') ? <FigurePreview /> : params.has('cards') ? <CardPreview /> : <App />}
  </StrictMode>,
);
