/* Account state shown in the dock. Accounts arrive with Chat; until then
   everyone is a guest. */
import { h, colorFor, initials } from './core.js';
import { ICONS } from './icons.js';

export const Account = {
  user: null,
  available: () => false,
  avatar(u, size = '') {
    if (!u) return h('span', { class: 'avatar anon' + (size ? ' ' + size : ''), 'aria-hidden': 'true', svg: ICONS.user });
    return h('span', { class: 'avatar' + (size ? ' ' + size : ''), style: `--av:${colorFor(u.uid)}`, 'aria-hidden': 'true', text: initials(u.name) });
  },
  async signOut() {},
};
