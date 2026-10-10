/* A small, safe arithmetic evaluator for Spotlight and the Calculator.
   Supports + - * / % (as "percent of"), ^, parentheses, unary minus, and the
   symbols × ÷ − . Never uses eval. Throws on anything else. */
export function evaluate(src) {
  const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '').replace(/\s+/g, '');
  if (!s) throw new Error('empty');
  let i = 0;
  const peek = () => s[i];
  const num = () => {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (!m) throw new Error('number expected');
    i += m[0].length;
    return parseFloat(m[0]);
  };
  let unary;
  const atom = () => {
    if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error(') expected'); i++; return v; }
    let v = num();
    while (peek() === '%') { i++; v /= 100; }
    return v;
  };
  const power = () => { const b = atom(); if (peek() === '^') { i++; return Math.pow(b, unary()); } return b; };
  unary = () => { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return power(); };
  const term = () => {
    let v = unary();
    while (peek() === '*' || peek() === '/' || peek() === '(') {
      if (peek() === '(') { v *= power(); continue; }
      const op = s[i++], r = unary();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  };
  function expr() {
    let v = term();
    while (peek() === '+' || peek() === '-') { const op = s[i++], r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  const v = expr();
  if (i !== s.length) throw new Error('unexpected input');
  if (!Number.isFinite(v)) throw new Error('not a finite number');
  return v;
}
/* Looks like arithmetic (digits plus at least one operator), not a bare number or a word. */
export const looksLikeMath = (q) => /^[\d\s.,+\-*/×÷−%^()]+$/.test(q) && /\d/.test(q) && /[+\-*/×÷−%^]/.test(q.replace(/^\s*-/, ''));
export const fmtNum = (v) => {
  if (Object.is(v, -0)) v = 0;
  const r = Math.round(v * 1e10) / 1e10;
  return Math.abs(r) >= 1e15 || (r !== 0 && Math.abs(r) < 1e-9) ? r.toExponential(6) : r.toLocaleString(undefined, { maximumFractionDigits: 10 });
};
