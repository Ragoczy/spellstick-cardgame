// Card art from assets/cards/, named by card id (for example pl-001.webp).
// Vite finds the files at build time; a card with no file keeps its player figure.
// Placeholder art can be made with `npm run generate-art` (see scripts/generate-art.ts).

const files = import.meta.glob('../../assets/cards/*.{png,webp,jpg,jpeg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const artById: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const id = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  artById[id] = url;
}

/** The URL of a card's art, or undefined if it has none yet. */
export function cardArt(cardId: string): string | undefined {
  return artById[cardId];
}
