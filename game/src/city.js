// Procedural Porto Verde: a street grid, named districts, beach and sea on the west,
// a canal with one bridge road on the south, a park, docks and piers, and blocks of
// varied buildings. Deterministic for a given seed, so every screenshot is repeatable.
import { CITY, WORLD, PALETTE } from './config.js';

export const DISTRICTS = [
  { name: 'Marina', x: 120, y: 100, w: 640, h: 700, color: '#3d7ea6' },
  { name: 'Old Town', x: 760, y: 760, w: 840, h: 840, color: '#b08a4f' },
  { name: 'Uptown', x: 1640, y: 100, w: 1120, h: 700, color: '#7a5fa0' },
  { name: 'Docks', x: 1640, y: 1640, w: 1120, h: 560, color: '#5a6b7a' },
  { name: 'Parkside', x: 760, y: 1640, w: 840, h: 560, color: '#5d9440' },
];

const ROOF_COLORS = PALETTE.buildingRoof;

function districtAt(x, y) {
  for (const d of DISTRICTS) if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d.name;
  return 'Porto Verde';
}

function onRoad(x, y) {
  const half = CITY.roadWidth / 2;
  for (const rx of CITY.verticalRoads) if (Math.abs(x - rx) < half) return true;
  for (const ry of CITY.horizontalRoads) if (Math.abs(y - ry) < half) return true;
  return false;
}

export function generateCity(random) {
  const buildings = [];
  const trees = [];
  const parkedSpots = [];
  const half = CITY.roadWidth / 2;

  // Blocks are the rectangles between neighbouring roads.
  const xs = [CITY.beachX + half, ...CITY.verticalRoads, WORLD.width - 40];
  const ys = [40, ...CITY.horizontalRoads, WORLD.height - 40];
  for (let bx = 0; bx < xs.length - 1; bx += 1) {
    for (let by = 0; by < ys.length - 1; by += 1) {
      const x0 = xs[bx] + half + 14;
      const y0 = ys[by] + half + 14;
      const x1 = xs[bx + 1] - half - 14;
      const y1 = ys[by + 1] - half - 14;
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 70 || bh < 70) continue;
      // The park block stays green.
      if (x0 < CITY.park.x + CITY.park.w && x1 > CITY.park.x && y0 < CITY.park.y + CITY.park.h && y1 > CITY.park.y) {
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: CITY.park.x + 20 + random() * (CITY.park.w - 40), y: CITY.park.y + 20 + random() * (CITY.park.h - 40), r: 12 + random() * 10 });
        }
        continue;
      }
      // The canal strip stays water; the docks block gets piers, not buildings.
      if (y0 > CITY.canalY - 60) continue;
      const count = 1 + Math.floor(random() * 3);
      for (let i = 0; i < count; i += 1) {
        const w = 60 + random() * Math.min(140, bw - 70);
        const h = 60 + random() * Math.min(140, bh - 70);
        const x = x0 + random() * Math.max(1, bw - w);
        const y = y0 + random() * Math.max(1, bh - h);
        const tall = random() < 0.22;
        buildings.push({
          x, y, w, h,
          color: ROOF_COLORS[Math.floor(random() * ROOF_COLORS.length)],
          floors: tall ? 6 + Math.floor(random() * 5) : 1 + Math.floor(random() * 3),
          district: districtAt(x + w / 2, y + h / 2),
        });
      }
      // A few street trees and parked cars along the block edge.
      if (random() < 0.7) trees.push({ x: x0 + random() * bw, y: y0 + random() * bh, r: 10 + random() * 8 });
      if (random() < 0.6) {
        const road = CITY.verticalRoads[bx] ?? CITY.verticalRoads[CITY.verticalRoads.length - 1];
        parkedSpots.push({ x: road + half - 18, y: y0 + 30 + random() * (bh - 60), angle: Math.PI / 2 });
      }
    }
  }

  // Docks: piers jutting into the canal water, with crates.
  const piers = [];
  for (let i = 0; i < 3; i += 1) {
    piers.push({ x: 1900 + i * 320, y: CITY.canalY + 6, w: 90, h: CITY.canalHeight - 6 });
  }

  // Named places the missions and the minimap use.
  const places = {
    marinaPickup: { x: 560, y: 300, name: 'Marina Kiosk' },
    oldTownDrop: { x: 1000, y: 1000, name: 'Old Town Plaza' },
    docks: { x: 2300, y: 2060, name: 'Docks' },
    uptownBank: { x: 2300, y: 500, name: 'Uptown Bank' },
    hideout: { x: 500, y: 1900, name: 'Hideout' },
    playerStart: { x: 1000, y: 1000, name: 'Old Town Plaza' },
  };

  return { buildings, trees, parkedSpots, piers, places, districts: DISTRICTS };
}

/** True when the point is in water (sea or canal) — the bridge road is the only crossing. */
export function inWater(city, x, y) {
  if (x < CITY.waterX) return true;
  if (y > CITY.canalY && y < CITY.canalY + CITY.canalHeight) {
    const half = CITY.roadWidth / 2;
    if (Math.abs(x - CITY.bridgeRoadX) < half) return false;
    return true;
  }
  return false;
}

/** True when the point is inside a building or a pier. */
export function hitsSolid(city, x, y, pad) {
  for (const b of city.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  }
  for (const p of city.piers) {
    if (x > p.x - pad && x < p.x + p.w + pad && y > p.y - pad && y < p.y + p.h + pad) return true;
  }
  return false;
}

export function isOnRoad(x, y) {
  return onRoad(x, y);
}

export function districtNameAt(x, y) {
  return districtAt(x, y);
}
