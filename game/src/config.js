// VICE BAY — every tuning number and colour in one place.
// The world is a fixed 3200x2400 logical city; the renderer shows a 1280x720 camera window
// over it, so no rule below depends on the screen size.
import { createRandom } from './random.js';

export const WORLD = { width: 3200, height: 2400 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The camera window the renderer paints. */
export const VIEW = { width: 1280, height: 720 };

/** City layout: roads on a grid, blocks of buildings between them. */
export const CITY = {
  roadWidth: 96,
  laneWidth: 24,
  verticalRoads: [400, 800, 1200, 1600, 2000, 2400, 2800],
  horizontalRoads: [400, 800, 1200, 1600, 2000],
  beachX: 260,
  waterX: 120,
  canalY: 2120,
  canalHeight: 110,
  bridgeRoadX: 1600,
  park: { x: 1248, y: 848, w: 304, h: 304 },
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  runSpeed: 330,
  health: 100,
  punchDamage: 25,
  punchRange: 46,
  punchCooldown: 0.35,
  pistolDamage: 34,
  pistolCooldown: 0.22,
  pistolRange: 520,
  pistolAmmo: 12,
  maxAmmo: 60,
};

export const CAR = {
  length: 64,
  width: 30,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 620,
  maxReverse: 180,
  turnRate: 2.6,
  grip: 6.5,
  health: 100,
  trafficSpeed: 150,
  policeSpeed: 560,
};

export const WANTED = {
  max: 5,
  decaySeconds: 14,
  evadeDistance: 620,
  copSpawnInterval: 4,
  maxPoliceCars: 6,
  maxCops: 5,
};

export const MISSION_REWARDS = [500, 800, 1200, 2000, 5000];

/** Golden-hour palette: warm sun-soaked coastal city. */
export const PALETTE = {
  backdrop: '#1a120c',
  grass: '#7fae5a',
  grassDark: '#6f9c4e',
  sand: '#e8cf9a',
  water: '#2e7f9e',
  waterDeep: '#1f5f7d',
  road: '#3d3a38',
  roadEdge: '#2c2a29',
  lane: '#e8d44f',
  sidewalk: '#9a938a',
  park: '#5d9440',
  buildingRoof: ['#c96f4a', '#b85c3e', '#d98a5f', '#8a6f5c', '#a8543f', '#c77b52'],
  buildingWall: '#e6d9c3',
  window: '#2c3e50',
  windowLit: '#ffd76a',
  tree: '#3f7a34',
  treeDark: '#2f5e28',
  player: '#f2c94c',
  playerShirt: '#e84c3d',
  ped: ['#4fc3f7', '#9b59b6', '#2ecc71', '#e67e22', '#ecf0f1', '#1abc9c'],
  police: '#2f6fd0',
  policeLight: '#ff3b30',
  enemy: '#8e2f2f',
  text: '#fff6e5',
  muted: '#d8c9a8',
  panel: 'rgba(20, 14, 10, 0.88)',
  gold: '#f2c94c',
  red: '#e5534b',
  green: '#7ed957',
  minimapBg: 'rgba(12, 18, 24, 0.82)',
  sun: 'rgba(255, 190, 90, 0.10)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'vice-bay.save.v1';

/** Deterministic seed for the shipped city layout. */
export const CITY_SEED = 1337;

export function cityRandom() {
  return createRandom(CITY_SEED);
}
