// FOUNDRY YARD — a three.js tactical FPS for make.fun's threejs-fps-02 bounty.
// Node 22, standard library only. The entry program: it copies this repository's
// game/ and screenshots/ beside it into /output (or MAKEFUN_OUTPUT_DIR outside the
// grader) and writes /output/dossier.json with the vendored make.fun library, the
// summary the judge reads. Run it locally:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Serve the game itself with `node serve.ts`, then open http://localhost:8080.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's caps (reference/gate.json): only text_max_bytes shapes the bytes;
// the others refuse an entry the scorer would refuse — more than 4 screenshots or
// one over 256 KiB, more than 993 files in game/ or 48 MiB of game files in all,
// which game/ counts beside /output's own 1000-entry cap, its screenshots/ and
// dossier.json. This entry stays well inside all of them.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
