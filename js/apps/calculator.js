/* Calculator: type or tap an expression; the answer previews live. */
import { h } from '../core.js';
import { ICONS } from '../icons.js';
import { registerApp } from '../apps.js';
import { evaluate, fmtNum } from '../calc.js';

const KEYS = [
  ['AC', 'clear', 'fn'], ['(', '(', 'fn'], [')', ')', 'fn'], ['÷', '÷', 'op'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['×', '×', 'op'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['−', '−', 'op'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op'],
  ['%', '%', 'fn'], ['0', '0'], ['.', '.'], ['=', 'eq', 'eq'],
];

registerApp({
  id: 'calculator', name: 'Calculator', description: 'Quick math with live answers', icon: ICONS.calc, tint: '#ff7a1a', size: [340, 580], pinned: false,
  mount(root) {
    let expr = '', last = '';
    const exprEl = h('div', { class: 'calc-expr', 'aria-live': 'polite' });
    const outEl = h('div', { class: 'calc-out' });
    const back = h('button', { class: 'btn ghost sm calc-del', type: 'button', 'aria-label': 'Delete last', onclick: () => press('del') }, h('span', { svg: ICONS.back }), 'Delete');
    const pad = h('div', { class: 'calc-pad' }, KEYS.map(([label, k, kind]) => h('button', { class: 'calc-k' + (kind ? ' ' + kind : ''), type: 'button', 'data-k': k, text: label, onclick: () => press(k) })));
    const el = h('div', { class: 'calc', tabindex: '0', 'aria-label': 'Calculator. Type numbers and operators.' },
      h('div', { class: 'calc-screen' }, h('div', { class: 'calc-top' }, h('small', { class: 'calc-last', text: '' }), back), exprEl, outEl), pad);
    root.append(el);
    const lastEl = el.querySelector('.calc-last');
    const preview = () => { try { return expr ? fmtNum(evaluate(expr)) : ''; } catch { return ''; } };
    function draw(err) {
      exprEl.replaceChildren(h('span', { text: expr || '0' }));
      const p = preview();
      outEl.textContent = err ? 'Can’t calculate that' : (p && p !== expr ? `= ${p}` : '');
      outEl.classList.toggle('err', !!err);
      lastEl.textContent = last;
      exprEl.classList.toggle('long', expr.length > 12);
    }
    function press(k) {
      if (k === 'clear') { expr = ''; last = ''; }
      else if (k === 'del') expr = expr.slice(0, -1);
      else if (k === 'eq') {
        if (!expr) return;
        try { const v = fmtNum(evaluate(expr)); last = `${expr} =`; expr = v.replace(/,/g, ''); }
        catch { draw(true); return; }
      } else {
        const ops = '+−×÷';
        if (ops.includes(k) && ops.includes(expr.slice(-1))) expr = expr.slice(0, -1);
        if (!expr && '×÷+'.includes(k)) return;
        expr += k;
      }
      draw();
    }
    el.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const map = { '*': '×', 'x': '×', '/': '÷', '-': '−', '+': '+', Enter: 'eq', '=': 'eq', Backspace: 'del', Escape: 'clear', Delete: 'clear' };
      const k = map[e.key] || (/^[\d.()%]$/.test(e.key) ? e.key : null);
      if (!k) return;
      e.preventDefault();
      press(k);
      const b = pad.querySelector(`[data-k="${CSS.escape(k)}"]`);
      if (b) { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 120); }
    });
    draw();
    setTimeout(() => el.focus({ preventScroll: true }), 50);
    return {};
  },
});
