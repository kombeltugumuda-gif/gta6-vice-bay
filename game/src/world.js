// The game's rules and state, with no drawing and no browser in it: the player on foot or
// in a car, traffic and police AI, pedestrians, combat, the wanted system, missions, pickups,
// particles and the clock. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react (sound, announcements) without the world knowing about
// screens or sound. Nothing here allocates after createWorld returns.
import { CAR, CITY, MISSION_REWARDS, PLAYER, STEP, WANTED, WORLD } from './config.js';
import { generateCity, hitsSolid, inWater, isOnRoad } from './city.js';
import { MISSIONS, missionReward, stepRadius, stepTarget } from './missions.js';

export const EVENT_HIT = 1;
export const EVENT_SHOT = 2;
export const EVENT_PICKUP = 4;
export const EVENT_MISSION = 8;
export const EVENT_CRASH = 16;
export const EVENT_EXPLOSION = 32;
export const EVENT_BUSTED = 64;
export const EVENT_WASTED = 128;
export const EVENT_WANTED = 256;
export const EVENT_OVER = EVENT_BUSTED | EVENT_WASTED;

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}
function overlapsCircleRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < r * r;
}

const CAR_COLORS = ['#d94f3d', '#3d7ea6', '#e8c33a', '#7a5fa0', '#4fae5a', '#e8e8e8', '#2c2c34', '#c97b3d'];
const PED_COLORS = ['#4fc3f7', '#9b59b6', '#2ecc71', '#e67e22', '#ecf0f1', '#1abc9c'];

function makeCar(random, kind, x, y, angle) {
  return {
    kind, x, y, angle, speed: 0, health: CAR.health,
    color: kind === 'police' ? '#2f6fd0' : kind === 'van' ? '#e8e8e8' : CAR_COLORS[Math.floor(random() * CAR_COLORS.length)],
    // Traffic AI: the road it follows, its direction along it, its lane offset.
    axis: 'x', road: 0, dir: 1, lane: 0,
    siren: kind === 'police', smoke: 0, dead: false, isPlayerCar: false,
    turnCooldown: 0, stuckTimer: 0, lastX: x, lastY: y, ramCd: 0,
  };
}

export function createWorld(random) {
  const city = generateCity(random);
  const player = {
    x: city.places.playerStart.x, y: city.places.playerStart.y, angle: -Math.PI / 2,
    health: PLAYER.health, ammo: PLAYER.pistolAmmo, reserveAmmo: 24,
    inCar: null, punchCd: 0, shootCd: 0, moving: false, speed: 0, bustedTimer: 0,
  };
  const cars = [];
  const peds = [];
  const cops = [];
  const enemies = [];
  const bullets = [];
  const particles = [];
  const skids = [];
  const pickups = [];
  for (let i = 0; i < 40; i += 1) bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, from: 'player', damage: 0 });
  for (let i = 0; i < 220; i += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#fff', size: 3 });
  for (let i = 0; i < 160; i += 1) skids.push({ active: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0 });

  const state = {
    city, player, cars, peds, cops, enemies, bullets, particles, skids, pickups,
    wanted: 0, wantedTimer: 0, copTimer: 0,
    cash: 0, missionIndex: 0, missionStep: 0, missionActive: true, storyDone: false,
    message: '', messageTimer: 0, clock: 8 * 3600, elapsed: 0,
    over: null, shake: 0, van: null, escapeTimer: 0,
    stats: { kills: 0, carsStolen: 0, missionsDone: 0, distance: 0 },
  };

  function spawnParticle(x, y, vx, vy, life, color, size) {
    for (const p of particles) {
      if (p.active) continue;
      p.active = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.maxLife = life; p.color = color; p.size = size;
      return;
    }
  }
  function burst(x, y, n, color, speed, life, size) {
    for (let i = 0; i < n; i += 1) {
      const a = random() * TAU;
      const s = speed * (0.4 + random() * 0.8);
      spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + random() * 0.7), color, size);
    }
  }
  function addSkid(x1, y1, x2, y2) {
    for (const s of skids) {
      if (s.active) continue;
      s.active = true; s.x1 = x1; s.y1 = y1; s.x2 = x2; s.y2 = y2; s.life = 14;
      return;
    }
  }
  function freeBullet() {
    for (const b of bullets) if (!b.active) return b;
    return null;
  }
  function fireBullet(x, y, angle, from, damage) {
    const b = freeBullet();
    if (!b) return;
    b.active = true; b.x = x; b.y = y;
    b.vx = Math.cos(angle) * 900; b.vy = Math.sin(angle) * 900;
    b.life = 0.7; b.from = from; b.damage = damage;
    spawnParticle(x + Math.cos(angle) * 20, y + Math.sin(angle) * 20, 0, 0, 0.08, '#ffd76a', 7);
  }

  function setWanted(n) {
    const next = clamp(n, 0, WANTED.max);
    if (next !== state.wanted) {
      state.wanted = next;
      state.wantedTimer = 0;
      return true;
    }
    return false;
  }

  function spawnTrafficCar() {
    const horizontal = random() < 0.5;
    const roads = horizontal ? CITY.horizontalRoads : CITY.verticalRoads;
    const road = roads[Math.floor(random() * roads.length)];
    const along = 60 + random() * (horizontal ? WORLD.width - 120 : WORLD.height - 120);
    const lane = (random() < 0.5 ? -1 : 1) * CITY.laneWidth;
    const car = makeCar(random, 'traffic', horizontal ? along : road + lane, horizontal ? road + lane : along, horizontal ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2));
    car.axis = horizontal ? 'x' : 'y';
    car.road = road;
    car.dir = car.angle === 0 || car.angle === Math.PI / 2 ? 1 : -1;
    car.lane = lane;
    car.speed = CAR.trafficSpeed * (0.8 + random() * 0.4);
    cars.push(car);
    return car;
  }

  function spawnParkedCar() {
    const spot = city.parkedSpots[Math.floor(random() * city.parkedSpots.length)];
    if (!spot) return null;
    const car = makeCar(random, 'parked', spot.x, spot.y, spot.angle);
    cars.push(car);
    return car;
  }

  function spawnPoliceCar() {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 6; tries += 1) {
      const a = random() * TAU;
      const d = 500 + random() * 200;
      x = clamp(player.x + Math.cos(a) * d, 80, WORLD.width - 80);
      y = clamp(player.y + Math.sin(a) * d, 80, WORLD.height - 80);
      if (!inWater(city, x, y)) break;
    }
    const car = makeCar(random, 'police', x, y, Math.atan2(player.y - y, player.x - x));
    car.speed = CAR.policeSpeed * 0.7;
    cars.push(car);
    return car;
  }

  function spawnCop() {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 6; tries += 1) {
      const a = random() * TAU;
      x = clamp(player.x + Math.cos(a) * 320, 40, WORLD.width - 40);
      y = clamp(player.y + Math.sin(a) * 320, 40, WORLD.height - 40);
      if (!inWater(city, x, y) && !hitsSolid(city, x, y, 12)) break;
    }
    cops.push({ x, y, angle: 0, health: 50, speed: 200, shootCd: 1 + random() });
  }

  function spawnPed() {
    const horizontal = random() < 0.5;
    const roads = horizontal ? CITY.horizontalRoads : CITY.verticalRoads;
    const road = roads[Math.floor(random() * roads.length)];
    const along = 60 + random() * (horizontal ? WORLD.width - 120 : WORLD.height - 120);
    const off = (CITY.roadWidth / 2 + 14) * (random() < 0.5 ? -1 : 1);
    peds.push({
      x: horizontal ? along : road + off, y: horizontal ? road + off : along,
      angle: horizontal ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      speed: 55 + random() * 45, color: PED_COLORS[Math.floor(random() * PED_COLORS.length)],
      flee: 0, walkPhase: random() * TAU,
    });
  }

  function spawnGoons(n, cx, cy) {
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU;
      enemies.push({ x: cx + Math.cos(a) * 180, y: cy + Math.sin(a) * 180, angle: 0, health: 60, speed: 150, shootCd: 0.8 + random() * 1.2 });
    }
  }

  function spawnVan() {
    const van = makeCar(random, 'van', 2300, CITY.horizontalRoads[1] + CITY.laneWidth, 0);
    van.axis = 'x'; van.road = CITY.horizontalRoads[1]; van.dir = 1; van.lane = CITY.laneWidth;
    van.speed = 200; van.health = 150;
    cars.push(van);
    state.van = van;
    return van;
  }

  function dropPickup(x, y, kind, value) {
    pickups.push({ x, y, kind, value, bob: random() * TAU });
  }

  function moveBody(x, y, dx, dy, radius) {
    // Axis-separated movement against buildings, piers and water.
    let nx = x + dx;
    if (!hitsSolid(city, nx, y, radius) && !inWater(city, nx, y)) x = nx;
    let ny = y + dy;
    if (!hitsSolid(city, x, ny, radius) && !inWater(city, x, ny)) y = ny;
    x = clamp(x, 20, WORLD.width - 20);
    y = clamp(y, 20, WORLD.height - 20);
    return { x, y };
  }

  function carHitsSolid(car) {
    const fx = car.x + Math.cos(car.angle) * (CAR.length / 2);
    const fy = car.y + Math.sin(car.angle) * (CAR.length / 2);
    return hitsSolid(city, fx, fy, 6) || inWater(city, fx, fy);
  }

  function explodeCar(car) {
    car.dead = true;
    car.health = 0;
    burst(car.x, car.y, 26, '#ff8c2f', 260, 0.9, 6);
    burst(car.x, car.y, 18, '#3a3a3a', 120, 1.6, 8);
    burst(car.x, car.y, 10, '#ffd76a', 340, 0.5, 5);
    state.shake = Math.max(state.shake, 0.6);
    if (car.isPlayerCar) {
      player.inCar = null;
      player.x = car.x + 40;
      player.y = car.y;
      player.health = Math.max(10, player.health - 30);
    }
    if (car === state.van) {
      dropPickup(car.x, car.y, 'cash', 1500);
      dropPickup(car.x + 30, car.y + 20, 'cash', 500);
    }
  }

  function reset() {
    cars.length = 0;
    peds.length = 0;
    cops.length = 0;
    enemies.length = 0;
    pickups.length = 0;
    for (const b of bullets) b.active = false;
    for (const p of particles) p.active = false;
    for (const s of skids) s.active = false;
    player.x = city.places.playerStart.x;
    player.y = city.places.playerStart.y;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.health;
    player.ammo = PLAYER.pistolAmmo;
    player.reserveAmmo = 24;
    player.inCar = null;
    player.punchCd = 0;
    player.shootCd = 0;
    player.bustedTimer = 0;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.copTimer = 0;
    state.cash = 0;
    state.missionIndex = 0;
    state.missionStep = 0;
    state.missionActive = true;
    state.storyDone = false;
    state.message = MISSIONS[0].intro;
    state.messageTimer = 7;
    state.clock = 8 * 3600;
    state.elapsed = 0;
    state.over = null;
    state.shake = 0;
    state.van = null;
    state.escapeTimer = 0;
    state.stats = { kills: 0, carsStolen: 0, missionsDone: 0, distance: 0 };
    for (let i = 0; i < 10; i += 1) spawnTrafficCar();
    for (let i = 0; i < 6; i += 1) spawnParkedCar();
    for (let i = 0; i < 22; i += 1) spawnPed();
    dropPickup(1060, 940, 'health', 30);
    dropPickup(940, 1060, 'ammo', 12);
    dropPickup(1300, 700, 'cash', 100);
  }

  /** Begin mission `index`: place its actors (goons, the bank van) and announce it. */
  function startMission(index) {
    state.missionIndex = index;
    state.missionStep = 0;
    const mission = MISSIONS[index];
    if (!mission) {
      state.missionActive = false;
      state.storyDone = true;
      state.message = 'Story complete! Porto Verde is yours, Mara. Free roam — the city never sleeps.';
      state.messageTimer = 8;
      return;
    }
    state.message = mission.intro;
    state.messageTimer = 7;
    if (index === 3) spawnVan();
  }

  function completeMission() {
    const reward = missionReward(state.missionIndex);
    state.cash += reward;
    state.stats.missionsDone += 1;
    state.message = `Mission complete: ${MISSIONS[state.missionIndex].title} — +$${reward}`;
    state.messageTimer = 6;
    startMission(state.missionIndex + 1);
  }

  function advanceStep() {
    const mission = MISSIONS[state.missionIndex];
    state.missionStep += 1;
    if (state.missionStep >= mission.steps.length) {
      completeMission();
      return;
    }
    const step = mission.steps[state.missionStep];
    if (step.type === 'kill') spawnGoons(step.goons ?? 4, city.places[step.place].x, city.places[step.place].y);
    if (step.wanted) setWanted(Math.max(state.wanted, step.wanted));
    state.message = step.text;
    state.messageTimer = 5;
  }

  function missionTarget() {
    const mission = MISSIONS[state.missionIndex];
    if (!mission || !state.missionActive) return null;
    return stepTarget(mission, state.missionStep, city);
  }

  function missionObjective() {
    const mission = MISSIONS[state.missionIndex];
    if (!mission || !state.missionActive) return state.storyDone ? 'Free roam — Porto Verde is yours' : '';
    const step = mission.steps[state.missionStep];
    if (step.type === 'kill') return `${step.text} (${enemies.length} left)`;
    return step.text;
  }

  function updateMissions(dt) {
    if (!state.missionActive || state.over) return;
    const mission = MISSIONS[state.missionIndex];
    if (!mission) return;
    const step = mission.steps[state.missionStep];
    if (!step) return;
    const target = stepTarget(mission, state.missionStep, city);
    if (step.type === 'goto' || step.type === 'pickup') {
      if (target && dist(player.x, player.y, target.x, target.y) < stepRadius(step)) {
        if (step.type === 'pickup') {
          state.cash += step.place === 'uptownBank' && state.missionIndex === 4 ? 1000 : 250;
          dropPickup(player.x, player.y, 'cash', 0);
        }
        advanceStep();
      }
    } else if (step.type === 'drive') {
      if (target && player.inCar && dist(player.x, player.y, target.x, target.y) < stepRadius(step)) advanceStep();
    } else if (step.type === 'kill') {
      if (enemies.length === 0) advanceStep();
    } else if (step.type === 'chase') {
      if (state.van && state.van.dead) advanceStep();
    } else if (step.type === 'escape') {
      if (target && dist(player.x, player.y, target.x, target.y) < stepRadius(step)) {
        state.escapeTimer += dt;
        if (state.escapeTimer > 2) {
          setWanted(0);
          state.escapeTimer = 0;
          advanceStep();
        }
      } else {
        state.escapeTimer = 0;
      }
    }
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.dead) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function tryEnterCar() {
    if (player.inCar) {
      const car = player.inCar;
      player.inCar = null;
      car.isPlayerCar = false;
      const px = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      const py = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      const spot = moveBody(px, py, 0, 0, PLAYER.radius);
      player.x = spot.x;
      player.y = spot.y;
      player.angle = car.angle;
      return;
    }
    const car = nearestCar(player.x, player.y, 70);
    if (!car) return;
    player.inCar = car;
    car.isPlayerCar = true;
    if (car.kind === 'traffic' || car.kind === 'parked' || car.kind === 'police' || car.kind === 'van') {
      state.stats.carsStolen += 1;
      if (setWanted(state.wanted + 1)) return;
    }
  }

  function playerPunch() {
    if (player.punchCd > 0 || player.inCar) return;
    player.punchCd = PLAYER.punchCooldown;
    const px = player.x + Math.cos(player.angle) * 30;
    const py = player.y + Math.sin(player.angle) * 30;
    burst(px, py, 4, '#ffffff', 120, 0.2, 4);
    for (const e of enemies) {
      if (dist(px, py, e.x, e.y) < PLAYER.punchRange) {
        e.health -= PLAYER.punchDamage;
        burst(e.x, e.y, 6, '#ff5a4e', 140, 0.3, 4);
      }
    }
    for (const c of cops) {
      if (dist(px, py, c.x, c.y) < PLAYER.punchRange) {
        c.health -= PLAYER.punchDamage;
        setWanted(state.wanted + 1);
      }
    }
    for (const ped of peds) {
      if (dist(px, py, ped.x, ped.y) < PLAYER.punchRange) {
        ped.flee = 3;
        setWanted(state.wanted + 1);
      }
    }
  }

  function playerShoot(aimAngle) {
    if (player.shootCd > 0 || player.inCar || player.ammo <= 0) return false;
    player.shootCd = PLAYER.pistolCooldown;
    player.ammo -= 1;
    player.angle = aimAngle;
    const gx = player.x + Math.cos(aimAngle) * 22;
    const gy = player.y + Math.sin(aimAngle) * 22;
    fireBullet(gx, gy, aimAngle, 'player', PLAYER.pistolDamage);
    state.shake = Math.max(state.shake, 0.08);
    setWanted(state.wanted + 1);
    for (const ped of peds) if (dist(ped.x, ped.y, player.x, player.y) < 420) ped.flee = 4;
    return true;
  }

  function updatePlayer(dt, ctl) {
    const p = player;
    if (p.punchCd > 0) p.punchCd -= dt;
    if (p.shootCd > 0) p.shootCd -= dt;
    if (ctl.punch) playerPunch();
    if (ctl.firing && ctl.aimAngle !== null) playerShoot(ctl.aimAngle);

    if (p.inCar) {
      const car = p.inCar;
      let crashed = false;
      const steer = ctl.steer * (car.speed >= 0 ? 1 : -1);
      car.angle += steer * CAR.turnRate * clamp(Math.abs(car.speed) / 220, 0, 1) * dt;
      if (ctl.throttle > 0) car.speed += CAR.accel * dt;
      else if (ctl.throttle < 0) car.speed -= (car.speed > 20 ? CAR.brake : CAR.reverseAccel) * dt;
      else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 240 * dt);
      car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const before = { x: car.x, y: car.y };
      const moved = moveBody(car.x, car.y, nx - car.x, ny - car.y, CAR.width / 2 - 4);
      const hitWall = (moved.x === before.x && Math.abs(nx - before.x) > 1) || (moved.y === before.y && Math.abs(ny - before.y) > 1);
      car.x = moved.x;
      car.y = moved.y;
      if (hitWall && Math.abs(car.speed) > 120) {
        car.health -= Math.abs(car.speed) * 0.06;
        car.speed *= -0.35;
        crashed = true;
        state.shake = Math.max(state.shake, 0.35);
        burst(car.x, car.y, 8, '#c9c9c9', 160, 0.4, 4);
        if (car.health <= 0 && !car.dead) explodeCar(car);
      }
      if (Math.abs(car.speed) > 300 && Math.abs(steer) > 0.5) {
        addSkid(car.x - Math.cos(car.angle) * 26, car.y - Math.sin(car.angle) * 26, car.x - Math.cos(car.angle) * 30, car.y - Math.sin(car.angle) * 30);
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = Math.abs(car.speed);
      state.stats.distance += Math.abs(car.speed) * dt;
      if (car.health < 45) {
        car.smoke += dt;
        if (random() < 0.3) spawnParticle(car.x, car.y - 10, (random() - 0.5) * 30, -50 - random() * 40, 1.1, '#555555', 7);
      }
      if (random() < 0.2) spawnParticle(car.x - Math.cos(car.angle) * 34, car.y - Math.sin(car.angle) * 34, 0, 0, 0.4, '#9a938a', 4);
      return crashed ? EVENT_CRASH : 0;
    }

    // On foot.
    const speed = ctl.move.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const mx = ctl.move.x;
    const my = ctl.move.y;
    p.moving = mx !== 0 || my !== 0;
    if (p.moving) {
      const len = Math.hypot(mx, my) || 1;
      const dx = (mx / len) * speed * dt;
      const dy = (my / len) * speed * dt;
      const spot = moveBody(p.x, p.y, dx, dy, PLAYER.radius);
      p.x = spot.x;
      p.y = spot.y;
      p.angle = Math.atan2(dy, dx);
      p.speed = speed;
      state.stats.distance += speed * dt;
    } else {
      p.speed = 0;
      if (ctl.aimAngle !== null) p.angle = ctl.aimAngle;
    }
    return 0;
  }

  function updateTraffic(dt) {
    for (const car of cars) {
      if (car.dead || car.isPlayerCar || car.kind === 'parked') continue;
      if (car.kind === 'police') continue;
      if (car.kind === 'van') {
        // The bank van runs its route and never stops.
        car.speed = Math.min(car.speed + 60 * dt, 210);
        const nx = car.x + Math.cos(car.angle) * car.speed * dt;
        const ny = car.y + Math.sin(car.angle) * car.speed * dt;
        const moved = moveBody(car.x, car.y, nx - car.x, ny - car.y, CAR.width / 2 - 4);
        car.x = moved.x;
        car.y = moved.y;
        if (car.x > WORLD.width - 120) { car.x = 120; car.y = CITY.horizontalRoads[1] + CITY.laneWidth; }
        continue;
      }
      // Traffic: follow its road; at an intersection, sometimes turn onto the cross road.
      car.turnCooldown -= dt;
      const along = car.axis === 'x' ? car.x : car.y;
      const crossRoads = car.axis === 'x' ? CITY.verticalRoads : CITY.horizontalRoads;
      let turned = false;
      if (car.turnCooldown <= 0) {
        for (const cr of crossRoads) {
          if (Math.abs(along - cr) < 6) {
            if (random() < 0.25) {
              const roads = car.axis === 'x' ? CITY.horizontalRoads : CITY.verticalRoads;
              const newRoad = roads[Math.floor(random() * roads.length)];
              car.axis = car.axis === 'x' ? 'y' : 'x';
              car.road = newRoad;
              car.dir = random() < 0.5 ? 1 : -1;
              car.lane = (random() < 0.5 ? -1 : 1) * CITY.laneWidth;
              car.angle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
              car.turnCooldown = 2;
              turned = true;
            }
            break;
          }
        }
      }
      if (!turned) {
        // Slow for a car ahead in the same lane.
        let slow = false;
        for (const other of cars) {
          if (other === car || other.dead || other.kind === 'parked') continue;
          if (other.axis !== car.axis || other.road !== car.road || other.dir !== car.dir) continue;
          const ahead = car.axis === 'x' ? (other.x - car.x) * car.dir : (other.y - car.y) * car.dir;
          if (ahead > 0 && ahead < 90) { slow = true; break; }
        }
        const target = slow ? 0 : CAR.trafficSpeed * (0.8 + (car.speed % 40) / 200);
        car.speed += clamp(target - car.speed, -300 * dt, 200 * dt);
        const nx = car.x + Math.cos(car.angle) * car.speed * dt;
        const ny = car.y + Math.sin(car.angle) * car.speed * dt;
        const moved = moveBody(car.x, car.y, nx - car.x, ny - car.y, CAR.width / 2 - 4);
        car.x = moved.x;
        car.y = moved.y;
        // Keep the car centred on its lane.
        if (car.axis === 'x') car.y += clamp((car.road + car.lane) - car.y, -60 * dt, 60 * dt);
        else car.x += clamp((car.road + car.lane) - car.x, -60 * dt, 60 * dt);
        if (car.x < 60 || car.x > WORLD.width - 60 || car.y < 60 || car.y > WORLD.height - 60) {
          car.x = clamp(car.x, 60, WORLD.width - 60);
          car.y = clamp(car.y, 60, WORLD.height - 60);
          car.angle += Math.PI;
          car.dir *= -1;
        }
      }
    }
    // Keep traffic flowing: replace cars that left the city, keep about ten on the road.
    const traffic = cars.filter((c) => c.kind === 'traffic' && !c.dead);
    if (traffic.length < 10) spawnTrafficCar();
    if (peds.length < 20 && random() < 0.02) spawnPed();
  }

  function updatePolice(dt) {
    if (state.wanted === 0) {
      // Cops give up and drive off.
      for (const car of cars) if (car.kind === 'police' && !car.dead) car.dead = true;
      cops.length = 0;
      return;
    }
    state.copTimer -= dt;
    const policeCars = cars.filter((c) => c.kind === 'police' && !c.dead);
    if (state.copTimer <= 0) {
      state.copTimer = WANTED.copSpawnInterval;
      if (policeCars.length < Math.min(WANTED.maxPoliceCars, state.wanted + 1)) spawnPoliceCar();
      if (!player.inCar && cops.length < Math.min(WANTED.maxCops, state.wanted)) spawnCop();
    }
    for (const car of policeCars) {
      const targetAngle = Math.atan2(player.y - car.y, player.x - car.x);
      const diff = angleDiff(targetAngle, car.angle);
      car.angle += clamp(diff * 2.2, -2.4, 2.4) * dt;
      car.speed = Math.min(car.speed + 500 * dt, CAR.policeSpeed);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const moved = moveBody(car.x, car.y, nx - car.x, ny - car.y, CAR.width / 2 - 4);
      const blocked = dist(moved.x, moved.y, car.x, car.y) < 0.5;
      car.x = moved.x;
      car.y = moved.y;
      if (blocked && Math.abs(car.speed) > 100) {
        car.health -= 8;
        car.speed *= -0.3;
        if (car.health <= 0) explodeCar(car);
      }
      // Ram the player's car — but only once per short cooldown, or the touch shreds it.
      car.ramCd = Math.max(0, car.ramCd - dt);
      if (player.inCar) {
        const d = dist(car.x, car.y, player.x, player.y);
        if (d < 70 && car.ramCd <= 0) {
          car.ramCd = 0.6;
          player.inCar.health -= 8;
          state.shake = Math.max(state.shake, 0.25);
          car.speed *= 0.6;
          if (player.inCar.health <= 0) explodeCar(player.inCar);
        }
      }
    }
    // On-foot cops chase and, up close, hold the player long enough to bust them.
    let busted = false;
    for (const cop of cops) {
      const d = dist(cop.x, cop.y, player.x, player.y);
      if (d < 420) {
        cop.angle = Math.atan2(player.y - cop.y, player.x - cop.x);
        const spot = moveBody(cop.x, cop.y, Math.cos(cop.angle) * cop.speed * dt, Math.sin(cop.angle) * cop.speed * dt, 12);
        cop.x = spot.x;
        cop.y = spot.y;
      }
      cop.shootCd -= dt;
      if (d < 300 && cop.shootCd <= 0 && !player.inCar) {
        cop.shootCd = 1.6;
        fireBullet(cop.x, cop.y, cop.angle + (random() - 0.5) * 0.3, 'cop', 8);
      }
      if (!player.inCar && d < 30) {
        player.bustedTimer += dt;
        if (player.bustedTimer > 1.2) busted = true;
      }
    }
    if (!player.inCar && cops.length === 0) player.bustedTimer = 0;
    if (busted) state.over = 'busted';
    // Wanted decay: no police near the player for a while, one star drops off.
    let nearest = Infinity;
    for (const car of policeCars) nearest = Math.min(nearest, dist(car.x, car.y, player.x, player.y));
    for (const cop of cops) nearest = Math.min(nearest, dist(cop.x, cop.y, player.x, player.y));
    if (nearest > WANTED.evadeDistance) {
      state.wantedTimer += dt;
      if (state.wantedTimer > WANTED.decaySeconds) {
        setWanted(state.wanted - 1);
        state.wantedTimer = 0;
      }
    } else {
      state.wantedTimer = 0;
    }
  }

  function updatePeds(dt) {
    for (const ped of peds) {
      if (ped.flee > 0) {
        ped.flee -= dt;
        const a = Math.atan2(ped.y - player.y, ped.x - player.x);
        const spot = moveBody(ped.x, ped.y, Math.cos(a) * 260 * dt, Math.sin(a) * 260 * dt, 10);
        ped.x = spot.x;
        ped.y = spot.y;
        ped.angle = a;
      } else {
        ped.walkPhase += dt;
        if (random() < 0.002) ped.angle += (random() < 0.5 ? -1 : 1) * Math.PI / 2;
        const spot = moveBody(ped.x, ped.y, Math.cos(ped.angle) * ped.speed * dt, Math.sin(ped.angle) * ped.speed * dt, 10);
        if (spot.x === ped.x && spot.y === ped.y) ped.angle += Math.PI / 2;
        ped.x = spot.x;
        ped.y = spot.y;
      }
    }
  }

  function updateEnemies(dt) {
    for (const e of enemies) {
      const d = dist(e.x, e.y, player.x, player.y);
      if (d < 520) {
        e.angle = Math.atan2(player.y - e.y, player.x - e.x);
        if (d > 160) {
          const spot = moveBody(e.x, e.y, Math.cos(e.angle) * e.speed * dt, Math.sin(e.angle) * e.speed * dt, 12);
          e.x = spot.x;
          e.y = spot.y;
        }
        e.shootCd -= dt;
        if (e.shootCd <= 0 && d < 420) {
          e.shootCd = 1.1 + random() * 0.8;
          fireBullet(e.x, e.y, e.angle + (random() - 0.5) * 0.35, 'enemy', 9);
        }
      }
    }
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || hitsSolid(city, b.x, b.y, 2) || inWater(city, b.x, b.y)) {
        if (b.life > 0) burst(b.x, b.y, 3, '#ffd76a', 90, 0.2, 3);
        b.active = false;
        continue;
      }
      if (b.from === 'player') {
        let hit = false;
        for (const e of enemies) {
          if (dist(b.x, b.y, e.x, e.y) < 16) {
            e.health -= b.damage;
            burst(e.x, e.y, 6, '#ff5a4e', 140, 0.3, 4);
            hit = true;
            break;
          }
        }
        if (!hit) {
          for (const c of cops) {
            if (dist(b.x, b.y, c.x, c.y) < 16) {
              c.health -= b.damage;
              setWanted(state.wanted + 1);
              hit = true;
              break;
            }
          }
        }
        if (!hit) {
          for (const car of cars) {
            if (car.dead || car.isPlayerCar) continue;
            if (overlapsCircleRect(b.x, b.y, 4, { x: car.x - CAR.length / 2, y: car.y - CAR.width / 2, w: CAR.length, h: CAR.width })) {
              car.health -= b.damage;
              burst(b.x, b.y, 5, '#ff8c2f', 120, 0.3, 4);
              if (car.health <= 0) explodeCar(car);
              hit = true;
              break;
            }
          }
        }
        if (!hit) {
          for (const ped of peds) {
            if (dist(b.x, b.y, ped.x, ped.y) < 14) {
              peds.splice(peds.indexOf(ped), 1);
              state.stats.kills += 1;
              setWanted(state.wanted + 1);
              burst(ped.x, ped.y, 8, '#ff5a4e', 150, 0.4, 4);
              hit = true;
              break;
            }
          }
        }
        if (hit) b.active = false;
      } else if (dist(b.x, b.y, player.x, player.y) < (player.inCar ? 26 : 14)) {
        b.active = false;
        if (player.inCar) {
          player.inCar.health -= b.damage;
          if (player.inCar.health <= 0) explodeCar(player.inCar);
        } else {
          player.health -= b.damage;
          burst(player.x, player.y, 5, '#ff5a4e', 130, 0.3, 4);
        }
      }
    }
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      if (enemies[i].health <= 0) {
        const e = enemies[i];
        enemies.splice(i, 1);
        state.stats.kills += 1;
        burst(e.x, e.y, 10, '#ff5a4e', 170, 0.5, 5);
        dropPickup(e.x, e.y, 'cash', 50 + Math.floor(random() * 100));
      }
    }
    for (let i = cops.length - 1; i >= 0; i -= 1) {
      if (cops[i].health <= 0) {
        const c = cops[i];
        cops.splice(i, 1);
        state.stats.kills += 1;
        setWanted(state.wanted + 2);
        burst(c.x, c.y, 10, '#2f6fd0', 170, 0.5, 5);
      }
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
    for (const s of skids) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) s.active = false;
    }
  }

  function updatePickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const pk = pickups[i];
      pk.bob += dt * 3;
      if (dist(pk.x, pk.y, player.x, player.y) < 34) {
        if (pk.kind === 'cash' && pk.value > 0) state.cash += pk.value;
        if (pk.kind === 'health') player.health = Math.min(PLAYER.health, player.health + pk.value);
        if (pk.kind === 'ammo') player.reserveAmmo = Math.min(PLAYER.maxAmmo, player.reserveAmmo + pk.value);
        pickups.splice(i, 1);
        burst(pk.x, pk.y, 8, '#f2c94c', 120, 0.4, 4);
      }
    }
  }

  /**
   * One fixed step. `ctl` carries the frame's input: move {x,y,run}, steer, throttle,
   * aimAngle (world-space mouse aim, null when none), firing, punch, enterCar, reload.
   * With `harmless` set (the title screen's backdrop) the world idles: no wanted, no damage.
   */
  function step(dt, ctl, harmless) {
    let events = 0;
    state.elapsed += dt;
    state.clock = (8 * 3600 + state.elapsed * 60) % 86400;
    if (state.messageTimer > 0) state.messageTimer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.8);

    if (harmless) {
      updateTraffic(dt);
      updateParticles(dt);
      return 0;
    }
    if (state.over) return 0;

    const wantedBefore = state.wanted;
    const missionsBefore = state.stats.missionsDone;
    const pickupsBefore = pickups.length;
    const bulletsBefore = bullets.filter((b) => b.active).length;
    const deadCarsBefore = cars.filter((c) => c.dead).length;
    if (ctl.enterCar) tryEnterCar();
    if (ctl.reload && player.ammo < PLAYER.pistolAmmo && player.reserveAmmo > 0) {
      const need = PLAYER.pistolAmmo - player.ammo;
      const take = Math.min(need, player.reserveAmmo);
      player.ammo += take;
      player.reserveAmmo -= take;
    }
    const crash = updatePlayer(dt, ctl);
    if (crash) events |= EVENT_CRASH;
    updateTraffic(dt);
    updatePolice(dt);
    updatePeds(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updateParticles(dt);
    updatePickups(dt);
    updateMissions(dt);

    if (state.wanted !== wantedBefore) events |= EVENT_WANTED;
    if (state.stats.missionsDone > missionsBefore) events |= EVENT_MISSION;
    if (pickups.length < pickupsBefore) events |= EVENT_PICKUP;
    if (bullets.filter((b) => b.active).length > bulletsBefore) events |= EVENT_SHOT;
    if (cars.filter((c) => c.dead).length > deadCarsBefore) events |= EVENT_EXPLOSION;
    if (state.over === 'busted') events |= EVENT_BUSTED;
    if (player.health <= 0 && !state.over) {
      state.over = 'wasted';
      events |= EVENT_WASTED;
    }
    return events;
  }

  function getSave() {
    return {
      cash: state.cash,
      missionIndex: state.missionIndex,
      missionStep: state.missionStep,
      stats: { ...state.stats },
      storyDone: state.storyDone,
    };
  }

  function loadSave(save) {
    reset();
    state.cash = save.cash ?? 0;
    state.stats = { ...state.stats, ...(save.stats ?? {}) };
    state.storyDone = !!save.storyDone;
    if (state.storyDone) {
      state.missionActive = false;
      state.missionIndex = MISSIONS.length;
      state.message = 'Welcome back — Porto Verde is yours. Free roam.';
      state.messageTimer = 6;
    } else {
      startMission(Math.min(save.missionIndex ?? 0, MISSIONS.length - 1));
      state.missionStep = save.missionStep ?? 0;
    }
  }

  reset();
  return {
    state, reset, step, startMission, missionTarget, missionObjective, setWanted,
    getSave, loadSave, spawnPoliceCar, spawnGoons, isOnRoad: (x, y) => isOnRoad(x, y),
  };
}
