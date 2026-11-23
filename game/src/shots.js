// The screenshot scenes behind ?shot=cover|drive|foot|title. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot, so
// the frame is what a short game really looks like and the same seed always gives the same
// frame. The autopilot drives toward the mission marker, aims at the nearest goon on foot,
// and keeps the player alive — it never edits the world directly.
import { CITY, STEP, WORLD } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Drive toward (tx, ty): steer at the heading, throttle, reverse briefly when stuck. */
function driveCtl(state, tx, ty, stuck) {
  const p = state.player;
  const car = p.inCar;
  if (!car) return { move: { x: 0, y: 0, run: false }, steer: 0, throttle: 0, aimAngle: null, firing: false, punch: false, enterCar: false, reload: false };
  const want = Math.atan2(ty - p.y, tx - p.x);
  const diff = angleDiff(want, car.angle);
  const speed = Math.abs(car.speed);
  const d = Math.hypot(tx - p.x, ty - p.y);
  if (stuck.time > 0.8 && speed < 30) {
    stuck.time = 0;
    return { move: { x: 0, y: 0, run: false }, steer: -Math.sign(diff || 1), throttle: -1, aimAngle: null, firing: false, punch: false, enterCar: false, reload: false };
  }
  // Brake into the waypoint instead of overshooting it and wrecking the car.
  const throttle = d < 320 ? (speed > 120 ? -1 : 0.25) : (Math.abs(diff) < 1.4 ? 1 : 0.4);
  return {
    move: { x: 0, y: 0, run: false },
    steer: clamp(diff * 2.2, -1, 1),
    throttle,
    aimAngle: null, firing: false, punch: false, enterCar: false, reload: false,
  };
}

/**
 * A Manhattan route through the road grid: stay on roads, turn at intersections, then
 * cut to the target. Driving straight at a marker crosses building blocks and wrecks the car.
 */
function nearestRoad(roads, v) {
  let best = roads[0];
  for (const r of roads) if (Math.abs(r - v) < Math.abs(best - v)) best = r;
  return best;
}
function roadRoute(fromX, fromY, toX, toY) {
  const vx = nearestRoad(CITY.verticalRoads, fromX);
  const hy = nearestRoad(CITY.horizontalRoads, toY);
  const tx = nearestRoad(CITY.verticalRoads, toX);
  const points = [{ x: vx, y: fromY }, { x: vx, y: hy }, { x: tx, y: hy }, { x: toX, y: toY }];
  return points;
}

/** On foot: walk toward the nearest goon and shoot it; with no goon yet, walk to the marker. */
function footCtl(state, fallback) {
  const p = state.player;
  let target = null;
  let best = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < best) { best = d; target = e; }
  }
  if (!target && fallback) {
    const want = Math.atan2(fallback.y - p.y, fallback.x - p.x);
    return {
      move: { x: Math.cos(want), y: Math.sin(want), run: false },
      steer: 0, throttle: 0, aimAngle: want, firing: false, punch: false, enterCar: false, reload: false,
    };
  }
  if (!target) return { move: { x: 0, y: 0, run: false }, steer: 0, throttle: 0, aimAngle: null, firing: false, punch: false, enterCar: false, reload: false };
  const want = Math.atan2(target.y - p.y, target.x - p.x);
  const mx = Math.cos(want);
  const my = Math.sin(want);
  const firing = best < 420 && p.ammo > 0;
  return {
    move: { x: best > 200 ? mx : 0, y: best > 200 ? my : 0, run: false },
    steer: 0, throttle: 0, aimAngle: want, firing, punch: false, enterCar: false,
    reload: p.ammo === 0 && p.reserveAmmo > 0,
  };
}

/** Steer along a road route, advancing to the next waypoint when close to the current one. */
function routeCtl(state, route, stuck) {
  const p = state.player;
  while (route.index < route.points.length - 1 && Math.hypot(p.x - route.points[route.index].x, p.y - route.points[route.index].y) < 70) {
    route.index += 1;
  }
  const wp = route.points[route.index];
  // At the final waypoint, stop and stay — don't keep circling it.
  if (route.index === route.points.length - 1 && Math.hypot(p.x - wp.x, p.y - wp.y) < 110) {
    const speed = p.inCar ? Math.abs(p.inCar.speed) : 0;
    return { move: { x: 0, y: 0, run: false }, steer: 0, throttle: speed > 40 ? -1 : 0, aimAngle: null, firing: false, punch: false, enterCar: false, reload: false };
  }
  return driveCtl(state, wp.x, wp.y, stuck);
}

const IDLE = { move: { x: 0, y: 0, run: false }, steer: 0, throttle: 0, aimAngle: null, firing: false, punch: false, enterCar: false, reload: false };

/**
 * Set `world` to the named scene (cover, drive, foot or title; any other name is title)
 * and return the screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'cover' && name !== 'drive' && name !== 'foot') {
    for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, IDLE, true);
    return { screen: SCREEN_TITLE };
  }

  if (name === 'cover') {
    // Mission 2 getaway in progress: the player in a stolen car, 3 wanted stars,
    // police cars closing in, driving for the hideout.
    world.startMission(1);
    state.player.x = 1200;
    state.player.y = 1200;
    const car = state.cars.find((c) => c.kind === 'parked') || state.cars[0];
    car.x = 1200;
    car.y = 1200;
    car.angle = Math.PI / 2;
    car.kind = 'traffic';
    car.color = '#e8c33a';
    state.player.inCar = car;
    car.isPlayerCar = true;
    car.speed = 320;
    world.setWanted(3);
    for (let i = 0; i < 3; i += 1) world.spawnPoliceCar();
    const target = world.missionTarget();
    const route = { points: roadRoute(state.player.x, state.player.y, target.x, target.y).slice(0, -1), index: 0 };
    const stuck = { time: 0 };
    let lastX = state.player.x;
    let lastY = state.player.y;
    for (let i = 0; i < 3 / STEP; i += 1) {
      const speed = Math.hypot(state.player.x - lastX, state.player.y - lastY);
      if (speed < 0.4) stuck.time += STEP;
      else stuck.time = 0;
      lastX = state.player.x;
      lastY = state.player.y;
      world.step(STEP, routeCtl(state, route, stuck), false);
      if (state.over) break;
    }
    return { screen: SCREEN_PLAY };
  }

  if (name === 'drive') {
    // Golden-hour cruise through downtown: traffic all around, no heat yet.
    state.player.x = 1600;
    state.player.y = 800;
    const car = state.cars.find((c) => c.kind === 'parked') || state.cars[0];
    car.x = 1600;
    car.y = 800;
    car.angle = 0;
    car.kind = 'traffic';
    car.color = '#d94f3d';
    state.player.inCar = car;
    car.isPlayerCar = true;
    car.speed = 200;
    const route = { points: roadRoute(state.player.x, state.player.y, 2800, 800).slice(0, -1), index: 0 };
    const stuck = { time: 0 };
    let lastX = state.player.x;
    let lastY = state.player.y;
    for (let i = 0; i < 2 / STEP; i += 1) {
      const speed = Math.hypot(state.player.x - lastX, state.player.y - lastY);
      if (speed < 0.4) stuck.time += STEP;
      else stuck.time = 0;
      lastX = state.player.x;
      lastY = state.player.y;
      world.step(STEP, routeCtl(state, route, stuck), false);
      if (state.over) break;
    }
    return { screen: SCREEN_PLAY };
  }

  // foot: the dock shootout — mission 3, goons in view, pistol out.
  world.startMission(2);
  state.player.x = 2300;
  state.player.y = 1900;
  state.player.ammo = 12;
  for (let i = 0; i < 3.5 / STEP; i += 1) {
    world.step(STEP, footCtl(state, world.missionTarget()), false);
    if (state.over) break;
  }
  return { screen: SCREEN_PLAY };
}
