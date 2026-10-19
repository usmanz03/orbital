// 24×24 stroke icons shared by the overlay and home window.
window.ICONS = {
  convert: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  audio: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  compress: '<path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5"/>',
  resize: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>',
  trim: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.6 7.6 20 18M8.6 16.4 20 6"/>',
  edit: '<path d="m15 5 4 4M4 20l1-5L16 4l4 4L9 19z"/>',
  pages: '<path d="M8 3h9l4 4v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 7v13a2 2 0 0 0 2 2h11"/>',
  export: '<path d="M12 3v12M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  merge: '<path d="M7 4v5a5 5 0 0 0 5 5h0a5 5 0 0 1 5 5v1M17 4v5a5 5 0 0 1-5 5"/><path d="m9 18 3 3 3-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  drop: '<path d="M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
};
window.icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${window.ICONS[name] || ''}</svg>`;
