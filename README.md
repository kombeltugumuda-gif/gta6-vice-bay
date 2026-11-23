[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/kombeltugumuda-gif/gta6-vice-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/kombeltugumuda-gif/gta6-vice-bay/reward.svg)](https://make.fun/bounty/gta6-01)

# Vice Bay

[![make.fun bounty](https://img.shields.io/badge/make.fun-bounty-gta6--01-blue)](https://make.fun)
[![make.fun owner](https://img.shields.io/badge/owner-kombeltugumuda--gif-green)](https://github.com/kombeltugumuda-gif)
[![make.fun repo](https://img.shields.io/badge/repo-gta6--vice--bay-orange)](https://github.com/kombeltugumuda-gif/gta6-vice-bay)

**Vice Bay** is an original top-down 2D open-world crime game set in the sun-soaked
coastal city of **Porto Verde**, built for the [make.fun](https://make.fun) bounty
**gta6-01 — "Make GTA 6"**. Everything in it is original: the city, the characters,
the story, the art and the sound. No Rockstar / GTA names, characters, maps, art or
music are used anywhere.

You are a wheelman fresh off the boat. **Mara**, the fixer who runs Porto Verde's
night trade, has five jobs for you — a package run, a getaway, a dock shootout, a
bank-van heist, and one last big score at the Uptown Bank. Steal cars, lose the
cops, get paid. The four staged screenshots in `screenshots/` were captured
from the game itself at 1280×720, and a live play test completed with zero
console errors.

## Play

Open `game/index.html` in a desktop browser (or serve the `game/` folder with any
static server, e.g. `node serve.ts` then http://localhost:8080). No network, no
build step, no accounts.

| Key | Action |
| --- | --- |
| WASD / Arrows | Walk (Shift to run) / drive |
| E | Steal / enter / exit a car |
| F | Punch |
| Mouse click | Shoot pistol (aim with the mouse) |
| R | Reload |
| P / Esc | Pause |
| M | Mute |
| Enter | Start / continue / retry |

## What's in the game

- **A city to explore** — a procedural street grid with named districts (Marina,
  Old Town, Docks, Uptown), a beach and sea, a park, docks with piers, and a canal
  crossed by one bridge road.
- **Traffic** — cars drive the roads with lane AI and turn at intersections;
  parked cars wait to be stolen with **E**. Driving has speed, damage, smoke and
  explosions.
- **Wanted system** — 1–5 stars. Police cars and on-foot cops chase you; break
  line of sight and distance to make stars decay. Get caught on foot and you're
  **Busted**; run out of health and you're **Wasted**.
- **Missions + story** — a five-mission chain from Mara with markers, objective
  text and cash rewards, plus mission complete / fail flows.
- **Combat** — punch (F) and a pistol (mouse aim, ammo, muzzle flash); enemies
  have health bars and shoot back.
- **HUD** — health bar, cash, wanted stars, weapon/ammo, mission objective,
  clock and district, plus a minimap with a player arrow, mission marker,
  police dots and a north indicator.
- **Start, pause and game over screens; progress saves** (cash, mission, stats)
  in localStorage — continue where you left off.
- **Sound, synthesized only** — WebAudio engine hum, two-tone siren, gunshots,
  pickup chimes, mission jingles and a bass music loop. No audio files.
- **Polish** — golden-hour lighting and long shadows, skid marks, exhaust and
  smoke particles, muzzle flashes, explosions and screen shake on crashes.

## Files

- `game/index.html` — canvas 1280×720, loads `src/main.js`
- `game/src/config.js` — tuning, palette, city constants
- `game/src/random.js` — seeded RNG (mulberry32)
- `game/src/city.js` — procedural city generation
- `game/src/world.js` — state + simulation (player, cars, peds, police, wanted, combat, particles)
- `game/src/missions.js` — story mission data + logic
- `game/src/audio.js` — WebAudio synth SFX + music
- `game/src/render.js` — canvas renderer (city, entities, HUD, minimap, screens)
- `game/src/input.js` — keyboard + mouse
- `game/src/shots.js` — deterministic staged screenshot scenes (`?shot=cover|drive|foot|title`)
- `game/src/main.js` — boot, fixed-step loop, screens, save/load
- `screenshots/` — the four staged shots (cover first)

## License

MIT — see [LICENSE](LICENSE).
