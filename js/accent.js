/* Derive an accent color from a wallpaper by sampling a downscaled copy,
   picking a vivid dominant hue and lifting it for contrast on black. */
function toHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; const l = (mx + mn) / 2, s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, s, l];
}

/* Returns a hex accent, or null if the image can't be read (e.g. a tainted
   canvas). Buckets pixels by hue, weights by saturation, picks the strongest. */
export function accentFromCanvas(srcCanvas) {
  try {
    const w = 48, hgt = 48;
    const c = document.createElement('canvas'); c.width = w; c.height = hgt;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(srcCanvas, 0, 0, w, hgt);
    const data = g.getImageData(0, 0, w, hgt).data;
    const buckets = new Array(24).fill(0).map(() => ({ wt: 0, s: 0, l: 0 }));
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], gg = data[i + 1], b = data[i + 2];
      const [h, s, l] = rgbToHsl(r, gg, b);
      if (s < 0.15 || l < 0.08 || l > 0.96) continue;         // skip gray and near-black/white
      const bi = Math.floor(h / 15) % 24, wt = s * (1 - Math.abs(l - 0.55));
      buckets[bi].wt += wt; buckets[bi].s += s * wt; buckets[bi].l += l * wt;
    }
    let best = -1, bestWt = 0;
    for (let i = 0; i < 24; i++) if (buckets[i].wt > bestWt) { bestWt = buckets[i].wt; best = i; }
    if (best < 0) return null;
    const bk = buckets[best];
    const hue = best * 15 + 7.5;
    const sat = Math.min(0.72, Math.max(0.45, bk.s / bk.wt));
    const light = Math.min(0.78, Math.max(0.62, bk.l / bk.wt + 0.12)); // lift for contrast on black
    const [r, gg, b] = hslToRgb(hue, sat, light);
    return toHex(r, gg, b);
  } catch { return null; }
}
