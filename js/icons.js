/* One icon set: 24px grid, 1.5px stroke, round caps. Static markup only. */

const svg = (paths) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

/* The Kanni mark: a pixel invader, 11×8 pixels drawn 2 units each. */
export const INVADER = 'M5 4h2v2h-2zM17 4h2v2h-2zM7 6h2v2h-2zM15 6h2v2h-2zM5 8h14v2h-14zM3 10h4v2h-4zM9 10h6v2h-6zM17 10h4v2h-4zM1 12h22v2h-22zM1 14h2v2h-2zM5 14h14v2h-14zM21 14h2v2h-2zM1 16h2v2h-2zM5 16h2v2h-2zM17 16h2v2h-2zM21 16h2v2h-2zM7 18h4v2h-4zM13 18h4v2h-4z';
export const MARK = `<svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" shape-rendering="crispEdges" d="${INVADER}"/></svg>`;
const CRESCENT = 'M11.39 3.02A9 9 0 1 0 20.63 14.57A7.5 7.5 0 0 1 11.39 3.02Z';

export const ICONS = {
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.75 5.6 3.75 9S14.5 18.4 12 21M12 3C9.5 5.6 8.25 8.6 8.25 12S9.5 18.4 12 21"/>'),
  sliders: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  min: svg('<path d="M6.5 12h11"/>'),
  max: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  restore: svg('<rect x="5.5" y="8.5" width="10" height="10" rx="2"/><path d="M8.5 5.5h8a2 2 0 0 1 2 2v8"/>'),
  close: svg('<path d="M7 7l10 10M17 7 7 17"/>'),
  back: svg('<path d="m14.5 18-6-6 6-6"/>'),
  fwd: svg('<path d="m9.5 18 6-6-6-6"/>'),
  reload: svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>'),
  stop: svg('<path d="M7 7l10 10M17 7 7 17"/>'),
  home: svg('<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9v10.5h12V9"/>'),
  plus: svg('<path d="M12 5.5v13M5.5 12h13"/>'),
  external: svg('<path d="M14 4.5h5.5V10M19.5 4.5 11 13"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>'),
  expand: svg('<path d="M4.5 9V4.5H9M19.5 9V4.5H15M4.5 15v4.5H9M19.5 15v4.5H15"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  paint: svg('<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-1.9l-.4-.9c-.5-1.1.3-2.2 1.5-2.2H17a3.5 3.5 0 0 0 3.5-3.5c0-4.7-3.8-8.5-8.5-8.5Z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/>'),
  monitor: svg('<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M8.5 20h7M12 16.5V20"/>'),
  bell: svg('<path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 5.5 2.5 7.5 2.5 7.5H4s2.5-2 2.5-7.5"/><path d="M10.3 20.5a2 2 0 0 0 3.4 0"/>'),
  db: svg('<ellipse cx="12" cy="6" rx="7.5" ry="2.75"/><path d="M4.5 6v12c0 1.5 3.4 2.75 7.5 2.75s7.5-1.25 7.5-2.75V6M4.5 12c0 1.5 3.4 2.75 7.5 2.75s7.5-1.25 7.5-2.75"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.75v.01"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  calendar: svg('<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 9.5h16M8 3.5v4M16 3.5v4"/>'),
  cloud: svg('<path d="M7 18.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 9a4 4 0 0 1 .3 9.5Z"/>'),
  widgets: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v6M13.5 16.5h6"/>'),
  lockPlus: svg('<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
  key: svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16.5 6.5 19 9M14 9l2.5 2.5"/>'),
  move: svg('<path d="M12 3.5v17M3.5 12h17M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  star: svg('<path d="M12 4.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.95l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76Z"/>'),
  starFill: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" stroke="none" d="M12 4.5l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.95l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76Z"/></svg>',
  history: svg('<path d="M4 12a8 8 0 1 1 2.5 5.8"/><path d="M4 12H2m2 0 .2-3"/><path d="M12 8v4l3 2"/>'),
  grid: svg('<rect x="4.5" y="4.5" width="6" height="6" rx="1.5"/><rect x="13.5" y="4.5" width="6" height="6" rx="1.5"/><rect x="4.5" y="13.5" width="6" height="6" rx="1.5"/><rect x="13.5" y="13.5" width="6" height="6" rx="1.5"/>'),
  chat: svg('<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3.5v-3.5h0a2 2 0 0 1-2-2Z"/>'),
  mic: svg('<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3"/>'),
  micOff: svg('<path d="M15 9.5V6.5a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.8 2.4M5.5 11a6.5 6.5 0 0 0 10.4 5.2M18.5 11a6.4 6.4 0 0 1-.6 2.7M12 17.5v3M4 4l16 16"/>'),
  phoneOff: svg('<path d="M3.5 14.2c4.7-4.3 12.3-4.3 17 0l-1.6 2.3a1 1 0 0 1-1.2.4l-2.6-1a1 1 0 0 1-.6-.9v-1.8a10.5 10.5 0 0 0-5 0V15a1 1 0 0 1-.6.9l-2.6 1a1 1 0 0 1-1.2-.4Z"/>'),
  headphones: svg('<path d="M4.5 15v-3a7.5 7.5 0 0 1 15 0v3"/><rect x="3.5" y="14" width="4" height="6" rx="1.5"/><rect x="16.5" y="14" width="4" height="6" rx="1.5"/>'),
  user: svg('<circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 20a7.25 7.25 0 0 1 14.5 0"/>'),
  login: svg('<path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10M14 8l4 4-4 4M18 12H9"/>'),
  logout: svg('<path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14M10 8l-4 4 4 4M6 12h9"/>'),
  flag: svg('<path d="M5.5 20.5v-16M5.5 4.5h11l-2 4 2 4h-11"/>'),
  ban: svg('<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>'),
  trash: svg('<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.9 12.5h9.2L17.5 7"/>'),
  send: svg('<path d="M20.5 3.5 3.5 10.5l6.8 3.2 3.2 6.8Z"/><path d="m20.5 3.5-10.2 10.2"/>'),
  window: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17"/>'),
  wand: svg('<path d="M4.5 19.5 14 10"/><path d="M15.5 3.5v3M14 5h3M19 8.5v2.5M17.75 9.75h2.5M10 3.5v2M9 4.5h2"/>'),
  check: svg('<path d="m5.5 12.5 4 4 9-9"/>'),
  chevDown: svg('<path d="m6.5 9.5 5.5 5.5 5.5-5.5"/>'),
  chevRight: svg('<path d="m9.5 6.5 5.5 5.5-5.5 5.5"/>'),
  more: svg('<circle cx="6" cy="12" r=".9"/><circle cx="12" cy="12" r=".9"/><circle cx="18" cy="12" r=".9"/>'),
  shield: svg('<path d="M12 3.5 5.5 6v5.5c0 4.1 2.8 7.4 6.5 8.9 3.7-1.5 6.5-4.8 6.5-8.9V6Z"/>'),
  arrowDown: svg('<path d="M12 5v14M6.5 13.5 12 19l5.5-5.5"/>'),
  alert: svg('<path d="M12 4.5 3 19.5h18Z"/><path d="M12 10v4.5M12 17v.01"/>'),
  moon: svg(`<path d="${CRESCENT}"/>`),
  sparkle: svg('<path d="M12 4c.6 3.9 2.1 5.4 6 6-3.9.6-5.4 2.1-6 6-.6-3.9-2.1-5.4-6-6 3.9-.6 5.4-2.1 6-6Z"/>'),
};

/* Wordmark: "Kanni" in the display face. */
export const WORDMARK = '<span class="wordmark" aria-label="Kanni"><span class="wm-name" aria-hidden="true">Kanni</span></span>';
