/* Custom wallpaper: validate an uploaded image, downscale it to about screen
   size on a canvas, and keep it in IndexedDB (too big for localStorage). */
import { Bus } from './core.js';
import { IDB } from './idb.js';
import { Settings } from './settings.js';

const MAX_BYTES = 10 * 1024 * 1024;

export function setCustomWallpaper(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('Choose an image file (JPEG, PNG or WebP).')); return; }
    if (file.size > MAX_BYTES) { reject(new Error('That image is over 10 MB. Pick a smaller one.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, (window.screen && screen.width ? screen.width : 1920) * (window.devicePixelRatio || 1) / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const out = c.toDataURL('image/webp', 0.85) || c.toDataURL('image/jpeg', 0.85);
        IDB.set('wallpaper', out).then(ok => {
          if (ok === null) { reject(new Error('This browser is blocking storage, so the wallpaper can’t be saved.')); return; }
          Settings.set('wallpaper', 'custom');
          Bus.emit('wallpaper-image');
          resolve(out);
        });
      } catch (e) { URL.revokeObjectURL(url); reject(new Error('That image couldn’t be processed.')); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image couldn’t be read.')); };
    img.src = url;
  });
}

export function removeCustomWallpaper() {
  return IDB.del('wallpaper').then(() => {
    Bus.emit('wallpaper-image');
    if (Settings.get('wallpaper') === 'custom') Settings.set('wallpaper', 'oled');
  });
}

export const hasCustomWallpaper = () => IDB.get('wallpaper').then(v => !!v);
