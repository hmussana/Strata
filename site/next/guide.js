// Tok, the D1 guide: an original, simple character (a friendly token tile). No likeness of any real character.
import { esc } from './ui.js';

export function guide(line, name = 'Tok') {
  return `<figure class="guide" aria-label="${esc(name)} says: ${esc(line)}">
    <svg class="guide-art" viewBox="0 0 96 96" aria-hidden="true">
      <rect x="14" y="20" width="68" height="64" rx="18" class="g-body"/>
      <rect x="22" y="28" width="52" height="34" rx="10" class="g-face"/>
      <circle cx="38" cy="44" r="5" class="g-eye"/><circle cx="58" cy="44" r="5" class="g-eye"/>
      <circle cx="40" cy="42.5" r="1.6" class="g-shine"/><circle cx="60" cy="42.5" r="1.6" class="g-shine"/>
      <path d="M40 53 q8 7 16 0" class="g-smile"/>
      <path d="M48 20 v-9" class="g-stem"/><circle cx="48" cy="9" r="4.5" class="g-dot"/>
      <text x="48" y="77" text-anchor="middle" class="g-label">T</text>
    </svg>
    <blockquote class="guide-says"><strong>${esc(name)}:</strong> ${esc(line)}</blockquote>
  </figure>`;
}
