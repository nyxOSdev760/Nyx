/* Games: free, open-source HTML games, played in a sandboxed frame from the
   authors' own sites. Each card credits the author and license. To add one,
   append to GAMES (only games whose license allows it). */
import { h, Store } from '../core.js';
import { ICONS } from '../icons.js';
import { registerApp } from '../apps.js';

export const GAMES = [
  { id: '2048', name: '2048', emoji: '🔢', color: '#edc22e', kind: 'Puzzle', blurb: 'Slide tiles, merge numbers, reach 2048.', url: 'https://gabrielecirulli.github.io/2048/', by: 'Gabriele Cirulli', license: 'MIT', src: 'https://github.com/gabrielecirulli/2048' },
  { id: 'hextris', name: 'Hextris', emoji: '⬢', color: '#e74c3c', kind: 'Arcade', blurb: 'Spin the hexagon to match falling blocks.', url: 'https://hextris.github.io/hextris/', by: 'Logan Engstrom and contributors', license: 'GPL-3.0', src: 'https://github.com/Hextris/hextris' },
  { id: 'clumsy', name: 'Clumsy Bird', emoji: '🐦', color: '#3fb6e8', kind: 'Arcade', blurb: 'Flap through the pipes. One more try…', url: 'https://ellisonleao.github.io/clumsy-bird/', by: 'Ellison Leão', license: 'GPL-3.0', src: 'https://github.com/ellisonleao/clumsy-bird' },
  { id: 'tower', name: 'Tower Building', emoji: '🏗️', color: '#f39c3c', kind: 'Arcade', blurb: 'Drop floors and stack the tallest tower.', url: 'https://iamkun.github.io/tower_game/', by: 'iamkun', license: 'MIT', src: 'https://github.com/iamkun/tower_game' },
  { id: 'astray', name: 'Astray', emoji: '🌀', color: '#7b61ff', kind: 'Maze', blurb: 'Roll a ball out of a 3D maze.', url: 'https://wwwtyro.github.io/Astray/', by: 'Rye Terrell', license: 'Unlicense', src: 'https://github.com/wwwtyro/Astray' },
  { id: 'cube', name: 'Cube Composer', emoji: '🧊', color: '#2ec4b6', kind: 'Puzzle', blurb: 'Chain functions to transform cube stacks.', url: 'https://david-peter.de/cube-composer/', by: 'David Peter', license: 'MIT', src: 'https://github.com/sharkdp/cube-composer' },
  { id: 'darkroom', name: 'A Dark Room', emoji: '🔥', color: '#b35c2e', kind: 'Adventure', blurb: 'A minimalist text adventure. Light the fire.', url: 'https://doublespeakgames.github.io/adarkroom/', by: 'Doublespeak Games', license: 'MPL-2.0', src: 'https://github.com/doublespeakgames/adarkroom' },
  { id: 'untrusted', name: 'Untrusted', emoji: '💻', color: '#27ae60', kind: 'Coding', blurb: 'Hack the game’s own code to escape.', url: 'https://alex.nisnevich.com/untrusted/', by: 'Alex Nisnevich and Greg Shuflin', license: 'CC BY-NC-SA 3.0', src: 'https://github.com/AlexNisnevich/untrusted' },
];

const recent = () => { const v = Store.get('gamesRecent', []); return Array.isArray(v) ? v.filter(id => GAMES.some(g => g.id === id)) : []; };

registerApp({
  id: 'games', name: 'Games', description: 'Free, open-source games to play', icon: ICONS.game, tint: '#8b5cf6', size: [980, 680],
  mount(root, ctx) {
    let kind = 'All', loadT = 0;
    const filters = h('div', { class: 'seg gm-filter', role: 'radiogroup', 'aria-label': 'Game type' });
    const grid = h('div', { class: 'gm-grid' });
    const library = h('div', { class: 'gm-lib scroll' },
      h('header', { class: 'gm-head' }, h('div', null, h('h2', { text: 'Games' }), h('p', { class: 'lede', text: 'Free, open-source games, played straight from their authors’ sites.' })), filters),
      grid,
      h('p', { class: 'gm-foot', text: 'Every game here is free to play and open source. Licenses and credits are on each card.' }));
    const player = h('div', { class: 'gm-player', hidden: true });
    root.append(h('div', { class: 'gm' }, library, player));

    const kinds = ['All', ...new Set(GAMES.map(g => g.kind))];
    function drawFilters() {
      filters.replaceChildren(...kinds.map(k => h('button', { type: 'button', role: 'radio', 'aria-checked': String(k === kind), text: k, onclick: () => { kind = k; drawFilters(); drawGrid(); } })));
    }
    function drawGrid() {
      const r = recent();
      const list = GAMES.filter(g => kind === 'All' || g.kind === kind).sort((a, b) => ((r.indexOf(a.id) + 1 || 99) - (r.indexOf(b.id) + 1 || 99)));
      grid.replaceChildren(...list.map(g => h('article', { class: 'gm-card', style: `--gc:${g.color}` },
        h('button', { class: 'gm-play', type: 'button', 'aria-label': `Play ${g.name}`, 'data-game': g.id, onclick: () => play(g) },
          h('span', { class: 'gm-art', 'aria-hidden': 'true' }, h('span', { class: 'gm-emoji', text: g.emoji })),
          h('span', { class: 'gm-info' }, h('b', { text: g.name }), h('small', { text: g.blurb }))),
        h('div', { class: 'gm-meta' }, h('span', { class: 'gm-kind', text: g.kind }),
          r[0] === g.id ? h('span', { class: 'gm-kind last', text: 'Recent' }) : null,
          h('a', { class: 'gm-lic', href: g.src, target: '_blank', rel: 'noopener noreferrer', title: `By ${g.by}. View the source.`, text: g.license })))));
    }
    function play(g) {
      Store.set('gamesRecent', [g.id, ...recent().filter(x => x !== g.id)].slice(0, 8));
      const frame = h('iframe', { class: 'gm-frame', title: g.name, src: g.url, referrerpolicy: 'no-referrer',
        sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-pointer-lock',
        allow: 'fullscreen; autoplay; gamepad; gyroscope; accelerometer' });
      const hint = h('div', { class: 'gm-hint', hidden: true }, h('span', { text: 'Taking a while? Some sites block being shown inside another page.' }),
        h('a', { class: 'btn sm', href: g.url, target: '_blank', rel: 'noopener noreferrer' }, h('span', { svg: ICONS.external }), 'Open in a new tab'));
      const loading = h('div', { class: 'gm-loading' }, h('span', { class: 'gm-emoji', text: g.emoji }), h('span', { class: 'spinner' }));
      frame.addEventListener('load', () => { clearTimeout(loadT); loading.remove(); hint.hidden = true; });
      clearTimeout(loadT); loadT = setTimeout(() => { hint.hidden = false; }, 12000);
      player.replaceChildren(
        h('div', { class: 'gm-bar' },
          h('button', { class: 'btn ghost sm gm-back', type: 'button', onclick: back }, h('span', { svg: ICONS.back }), 'Games'),
          h('b', { class: 'gm-title', text: g.name }), h('small', { class: 'gm-credit', text: `by ${g.by} · ${g.license}` }),
          h('div', { class: 'row nowrap' },
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Restart', title: 'Restart', svg: ICONS.reload, onclick: () => { frame.src = g.url; } }),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Full screen', title: 'Full screen', svg: ICONS.expand, onclick: () => { try { frame.requestFullscreen(); } catch {} } }),
            h('a', { class: 'icon-btn sm', href: g.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open in a new tab', title: 'Open in a new tab', svg: ICONS.external }))),
        h('div', { class: 'gm-stage' }, frame, loading, hint));
      library.hidden = true; player.hidden = false;
      ctx.setTitle(`${g.name} – Games`);
      setTimeout(() => frame.focus(), 300);
    }
    function back() {
      clearTimeout(loadT);
      player.replaceChildren(); player.hidden = true; library.hidden = false;
      ctx.setTitle(''); drawGrid();
    }
    drawFilters(); drawGrid();
    if (ctx.args && ctx.args.game) { const g = GAMES.find(x => x.id === ctx.args.game); if (g) play(g); }
    return {
      handleArgs: (a) => { const g = a && GAMES.find(x => x.id === a.game); if (g) play(g); },
      destroy: () => clearTimeout(loadT),
    };
  },
});
