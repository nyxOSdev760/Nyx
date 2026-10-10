# Bundled games

Free, open-source games played in Kanni's Games app. Each folder is an
unmodified copy of the game's published files, except for the changes listed
below, and keeps the game's own license file. Kanni's own code (including
`kanni-shim.js`) is separate and not covered by these licenses.

| Folder | Game | Source (commit) | License |
|---|---|---|---|
| `2048/` | 2048 by Gabriele Cirulli | [gabrielecirulli/2048](https://github.com/gabrielecirulli/2048) `master` | MIT (`LICENSE.txt`) |
| `hextris/` | Hextris by Logan Engstrom and contributors | [Hextris/hextris](https://github.com/Hextris/hextris) `gh-pages` @ 3f4847d | GPL-3.0 (`LICENSE.md`) |
| `clumsy/` | Clumsy Bird by Ellison Leão | [ellisonleao/clumsy-bird](https://github.com/ellisonleao/clumsy-bird) `master` @ fae3d48 | GPL-3.0 (`LICENSE.md`) |
| `tower/` | Tower Building by iamkun | [iamkun/tower_game](https://github.com/iamkun/tower_game) `master` @ c6fa84a | MIT (`LICENSE`) |
| `astray/` | Astray by Rye Terrell | [wwwtyro/Astray](https://github.com/wwwtyro/Astray) `gh-pages` @ 0a48529 | Unlicense (`LICENSE.md`) |
| `darkroom/` | A Dark Room by Doublespeak Games | [doublespeakgames/adarkroom](https://github.com/doublespeakgames/adarkroom) `gh-pages` @ ea38d22 | MPL-2.0 (`LICENSE.md`) |

The full source of each game, including the GPL ones, is at the linked repository.

## Changes made for Kanni

- Every `index.html`: added `<script src="../kanni-shim.js"></script>` first in `<head>`.
- Removed Google Analytics / Google Tag Manager from `hextris/index.html`,
  `hextris/js/initialization.js`, `tower/index.html`, `astray/index.html` and
  `darkroom/index.html`, and the AdSense script from `hextris/index.html`.
- `2048/index.html`: dropped the obsolete `target-densitydpi` viewport key (browsers warn about it).
- `astray/index.html`: removed the "Fork me on GitHub" ribbon image (hot-linked).
- `darkroom/index.html`: load jQuery from the bundled `lib/` copy instead of a
  CDN, and removed the optional Dropbox save sync (its script and
  `script/dropbox.js`); the game checks for it and runs without it.
- Left out build and editor files (Gruntfile, package files, Procfile and similar).

## How they run

The Games app loads them in a sandboxed iframe without `allow-same-origin`,
so a game can't read Kanni's storage, notes or account. `kanni-shim.js` gives
each game a working localStorage whose contents Kanni saves under that game's
name. Fonts, sounds and textures load through CORS, which needs the host to
send `Access-Control-Allow-Origin: *` (GitHub Pages does).
