// Small rendering helpers shared by all views. All content is escaped before any markup is added.
import { icon } from './icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const safeHref = (u) => (/^(https?:\/\/|#\/)/.test(u) ? u : '#');

// Minimal inline markup for content text: **bold**, *italic*, `code`, [label](https://… or #/…)
export function rich(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_, label, url) => {
      const h = safeHref(url.replace(/&amp;/g, '&'));
      const ext = h.startsWith('http');
      return `<a href="${esc(h)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
    });
}

export const paras = (list) => (list || []).map((p) => `<p>${rich(p)}</p>`).join('');

export const isPlaceholder = (v) => typeof v === 'string' && v.includes('PLACEHOLDER');

// Render a value, flagging placeholders visibly so they're never mistaken for data
export const val = (v) => (isPlaceholder(v) ? '<span class="ph" title="Placeholder: needs real data">PLACEHOLDER</span>' : esc(v));

export const lclass = (layer) => `c-${layer.color}`;

export const lnum = (layer) => `<span class="lnum" aria-label="Layer ${layer.order}">L${layer.order}</span>`;

export function freshness(item, model) {
  const out = [];
  if (item.status === 'draft') out.push('<span class="badge badge-draft" title="Written as a draft, awaiting expert review">Draft</span>');
  if (item.lastReviewed) {
    const days = (Date.now() - Date.parse(item.lastReviewed)) / 86400000;
    out.push(`<span class="badge">${icon('clock', 'ico-s')}Reviewed ${esc(item.lastReviewed)}</span>`);
    if (days > (model.staleAfterDays || 90)) out.push(`<span class="badge badge-stale" title="Not reviewed for over ${model.staleAfterDays} days">May be out of date</span>`);
  }
  return `<div class="meta">${out.join('')}</div>`;
}

export const zoomLabel = (z) => `<span class="zlabel">${esc(z)}</span>`;
