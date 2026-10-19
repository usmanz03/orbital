// 24×24 line icons drawn in the spirit of SF Symbols (regular weight, round caps).
window.ICONS = {
  convert: '<path d="M4.5 9h14.5l-3.5-3.5M19.5 15H5l3.5 3.5"/>',
  audio: '<path d="M9 17.5V6.2l10-2.2v11.3"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.3" r="2.5"/>',
  compress: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  resize: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M9 15l6-6M11 9h4v4"/>',
  crop: '<path d="M7 3v12.5A1.5 1.5 0 0 0 8.5 17H21M3 7h12.5A1.5 1.5 0 0 1 17 8.5V21"/>',
  trim: '<circle cx="6" cy="6.5" r="2.6"/><circle cx="6" cy="17.5" r="2.6"/><path d="M8.2 8 20 17.8M8.2 16 20 6.2"/>',
  edit: '<path d="M14.5 5.5l4 4M5 19l1-4.5L16 4.5a1.8 1.8 0 0 1 2.5 0l1 1a1.8 1.8 0 0 1 0 2.5L9.5 18z"/>',
  pages: '<rect x="7" y="3" width="13" height="16" rx="2.5"/><path d="M4 7v11.5A2.5 2.5 0 0 0 6.5 21H16"/>',
  export: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12"/>',
  merge: '<path d="M6 4v3.5a5 5 0 0 0 5 5h2a5 5 0 0 1 5 5V20M18 4v3.5a5 5 0 0 1-3 4.6"/><path d="M15 17.5 18 20.5l3-3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  drop: '<path d="M12 3.5V14M7.5 9.5 12 14l4.5-4.5"/><path d="M4 14.5v3A3.5 3.5 0 0 0 7.5 21h9a3.5 3.5 0 0 0 3.5-3.5v-3"/>',
  file: '<path d="M13.5 3H8a2.5 2.5 0 0 0-2.5 2.5v13A2.5 2.5 0 0 0 8 21h8a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M13.5 3v3.5A1.5 1.5 0 0 0 15 8h3.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};
window.icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${window.ICONS[name] || ''}</svg>`;
