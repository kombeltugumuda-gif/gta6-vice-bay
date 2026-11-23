// Vice Bay — a make.fun gta6-01 entry (Node 22, standard library only): the game is this
// directory's game/ folder, plain static files a desktop browser loads offline (game/index.html
// and its ES modules, no library and no network request), and the program hands it in. It copies
// game/ and screenshots/ from beside this file to /output and writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library. The game itself is an original
// top-down 2D open-world crime game: the coastal city Porto Verde, traffic and pedestrians,
// car theft and driving, a 1–5 star wanted system with police, a five-mission story from the
// fixer Mara, on-foot combat, a HUD with a minimap, a save, and WebAudio-synthesized sound.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others
// refuse an entry the scorer would refuse (more than 4 screenshots or one over 256 KiB; more than
// 993 files in game/ or 48 MiB of game files, in all, or a path under game/ over 1000 bytes:
// game/ counts beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Count the regular files under a directory, recursively, for the handover log. */
function countFiles(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += countFiles(path);
    else if (entry.isFile()) total += 1;
  }
  return total;
}

/** Refuse a broken handover early: the game must open at game/index.html. */
function checkGame() {
  const index = join(here, 'game', 'index.html');
  if (!existsSync(index) || !statSync(index).isFile()) {
    throw new Error(`Vice Bay entry is missing its entry point: ${index}`);
  }
}

function handIn() {
  checkGame();
  mkdirSync(out, { recursive: true });
  cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(join(here, 'screenshots'))) {
    cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
  }
  const dossier = buildDossier(out, DOSSIER_LIMITS);
  writeFileSync(join(out, 'dossier.json'), dossier);
  const gameFiles = countFiles(join(out, 'game'));
  const shotFiles = countFiles(join(out, 'screenshots'));
  console.log(
    `Vice Bay handed in: ${gameFiles} game files, ${shotFiles} screenshots, ` +
      `dossier ${dossier.length} bytes -> ${out}`,
  );
}

handIn();
