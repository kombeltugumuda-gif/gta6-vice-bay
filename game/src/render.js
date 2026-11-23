// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// camera window follows the player over the city; golden-hour light is a warm overlay plus
// long shadows cast to the north-east. Flat vector shapes and canvas text only — no images.
import { CAR, CITY, PALETTE, PLAYER, VIEW, WORLD } from './config.js';
import { districtNameAt } from './city.js';
import { MISSIONS } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const TAU = Math.PI * 2;
const MINIMAP = { x: VIEW.width - 224, y: 16, w: 208, h: 156 };

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, camX: 0, camY: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, bold) {
    const key = `${size}${bold ? 'b' : ''}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px system-ui, -apple-system, "Segoe UI", sans-serif`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function rect(x, y, w, h, color) {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, TAU);
    context.fill();
  }

  function drawCity(state) {
    const city = state.city;
    const camX = view.camX;
    const camY = view.camY;
    const x0 = Math.max(0, camX - 40);
    const y0 = Math.max(0, camY - 40);
    const x1 = Math.min(WORLD.width, camX + VIEW.width + 40);
    const y1 = Math.min(WORLD.height, camY + VIEW.height + 40);

    // Ground: grass, then sand and sea on the west.
    rect(x0, y0, x1 - x0, y1 - y0, PALETTE.grass);
    rect(0, y0, CITY.beachX, y1 - y0, PALETTE.sand);
    rect(0, y0, CITY.waterX, y1 - y0, PALETTE.water);
    // Canal water on the south.
    rect(x0, CITY.canalY, x1 - x0, CITY.canalHeight, PALETTE.waterDeep);
    // Sea shimmer lines.
    context.strokeStyle = 'rgba(255,255,255,0.18)';
    context.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      const wy = y0 + ((i * 173 + state.elapsed * 24) % (y1 - y0));
      context.beginPath();
      context.moveTo(8, wy);
      context.lineTo(CITY.waterX - 12, wy);
      context.stroke();
    }
    // Park.
    rect(CITY.park.x, CITY.park.y, CITY.park.w, CITY.park.h, PALETTE.park);
    context.strokeStyle = 'rgba(0,0,0,0.15)';
    context.lineWidth = 3;
    context.strokeRect(CITY.park.x, CITY.park.y, CITY.park.w, CITY.park.h);

    // Roads.
    const half = CITY.roadWidth / 2;
    for (const rx of CITY.verticalRoads) rect(rx - half, 0, CITY.roadWidth, WORLD.height, PALETTE.road);
    for (const ry of CITY.horizontalRoads) rect(0, ry - half, WORLD.width, CITY.roadWidth, PALETTE.road);
    // Bridge over the canal: the road continues across the water.
    rect(CITY.bridgeRoadX - half, CITY.canalY, CITY.roadWidth, CITY.canalHeight, PALETTE.road);
    // Lane dashes.
    context.strokeStyle = PALETTE.lane;
    context.lineWidth = 3;
    context.setLineDash([26, 30]);
    for (const rx of CITY.verticalRoads) {
      context.beginPath();
      context.moveTo(rx, 0);
      context.lineTo(rx, WORLD.height);
      context.stroke();
    }
    for (const ry of CITY.horizontalRoads) {
      context.beginPath();
      context.moveTo(0, ry);
      context.lineTo(WORLD.width, ry);
      context.stroke();
    }
    context.setLineDash([]);
    // Sidewalk edges.
    context.strokeStyle = PALETTE.sidewalk;
    context.lineWidth = 6;
    for (const rx of CITY.verticalRoads) {
      context.beginPath(); context.moveTo(rx - half - 3, 0); context.lineTo(rx - half - 3, WORLD.height); context.stroke();
      context.beginPath(); context.moveTo(rx + half + 3, 0); context.lineTo(rx + half + 3, WORLD.height); context.stroke();
    }

    // Skid marks.
    context.strokeStyle = 'rgba(20,20,20,0.45)';
    context.lineWidth = 5;
    for (const s of state.skids) {
      if (!s.active) continue;
      context.globalAlpha = Math.min(1, s.life / 6);
      context.beginPath();
      context.moveTo(s.x1, s.y1);
      context.lineTo(s.x2, s.y2);
      context.stroke();
    }
    context.globalAlpha = 1;

    // Buildings: wall, roof, lit windows, long golden-hour shadow.
    for (const b of city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      context.fillStyle = 'rgba(40, 20, 8, 0.28)';
      context.fillRect(b.x + 14, b.y + 18, b.w, b.h);
      rect(b.x, b.y, b.w, b.h, PALETTE.buildingWall);
      rect(b.x + 4, b.y + 4, b.w - 8, b.h - 8, b.color);
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          const lit = ((cx * 7 + cy * 3 + b.floors) % 4) === 0;
          rect(b.x + 9 + cx * 26, b.y + 9 + cy * 26, 13, 15, lit ? PALETTE.windowLit : PALETTE.window);
        }
      }
      if (b.floors > 3) {
        text(`${b.floors}F`, b.x + b.w / 2, b.y + b.h / 2, 13, 'rgba(255,255,255,0.55)', 'center');
      }
    }

    // Docks piers and crates.
    for (const p of city.piers) {
      rect(p.x, p.y, p.w, p.h, '#8a6f4d');
      context.strokeStyle = '#6b543a';
      context.lineWidth = 2;
      for (let i = 0; i < p.h; i += 18) {
        context.beginPath(); context.moveTo(p.x, p.y + i); context.lineTo(p.x + p.w, p.y + i); context.stroke();
      }
      rect(p.x + 12, p.y + 10, 22, 22, '#c9a86a');
      rect(p.x + p.w - 38, p.y + p.h - 40, 26, 26, '#a8543f');
    }

    // Trees.
    for (const t of city.trees) {
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      circle(t.x + 5, t.y + 6, t.r, 'rgba(40,20,8,0.25)');
      circle(t.x, t.y, t.r, PALETTE.tree);
      circle(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.55, PALETTE.treeDark);
    }

    // District labels on the ground.
    text('MARINA', 380, 220, 30, 'rgba(255,255,255,0.35)', 'center', true);
    text('OLD TOWN', 1180, 980, 30, 'rgba(255,255,255,0.35)', 'center', true);
    text('UPTOWN', 2200, 260, 30, 'rgba(255,255,255,0.35)', 'center', true);
    text('DOCKS', 2200, 1980, 30, 'rgba(255,255,255,0.35)', 'center', true);
  }

  function drawCar(car) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(40,20,8,0.30)';
    context.fillRect(-CAR.length / 2 + 5, -CAR.width / 2 + 7, CAR.length, CAR.width);
    const body = car.dead ? '#3a3a3a' : car.color;
    context.fillStyle = body;
    context.beginPath();
    context.roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    context.fill();
    // Cabin and windshield.
    context.fillStyle = car.kind === 'van' ? '#d8d8d8' : '#20242c';
    context.beginPath();
    context.roundRect(-8, -CAR.width / 2 + 4, 20, CAR.width - 8, 4);
    context.fill();
    // Headlights.
    context.fillStyle = '#ffe9a8';
    context.fillRect(CAR.length / 2 - 4, -CAR.width / 2 + 3, 4, 6);
    context.fillRect(CAR.length / 2 - 4, CAR.width / 2 - 9, 4, 6);
    if (car.kind === 'police') {
      const flash = Math.floor(performance.now() / 260) % 2 === 0;
      context.fillStyle = flash ? '#ff3b30' : '#2f6fd0';
      context.fillRect(-4, -CAR.width / 2 - 3, 10, 5);
      context.fillStyle = flash ? '#2f6fd0' : '#ff3b30';
      context.fillRect(-4, CAR.width / 2 - 2, 10, 5);
    }
    if (car.kind === 'van') {
      text('BANK', -2, 5, 11, '#333', 'center', true);
    }
    if (car.health < 45 && !car.dead) {
      context.fillStyle = 'rgba(60,60,60,0.7)';
      context.beginPath();
      context.arc(-CAR.length / 2 + 8, 0, 8 + Math.random() * 4, 0, TAU);
      context.fill();
    }
    context.restore();
  }

  function drawPerson(x, y, angle, color, radius, isPlayer) {
    circle(x + 4, y + 5, radius, 'rgba(40,20,8,0.30)');
    circle(x, y, radius, color);
    context.fillStyle = '#2c2c34';
    context.beginPath();
    context.arc(x + Math.cos(angle) * radius * 0.55, y + Math.sin(angle) * radius * 0.55, radius * 0.45, 0, TAU);
    context.fill();
    if (isPlayer) {
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, radius + 3, 0, TAU);
      context.stroke();
    }
  }

  function drawEntities(state) {
    // Pickups.
    for (const pk of state.pickups) {
      const bob = Math.sin(pk.bob) * 3;
      if (pk.kind === 'cash') {
        rect(pk.x - 10, pk.y - 7 + bob, 20, 14, PALETTE.gold);
        text('$', pk.x, pk.y + 4 + bob, 12, '#7a5c00', 'center', true);
      } else if (pk.kind === 'health') {
        rect(pk.x - 9, pk.y - 9 + bob, 18, 18, '#e5534b');
        rect(pk.x - 2, pk.y - 6 + bob, 4, 12, '#fff');
        rect(pk.x - 6, pk.y - 2 + bob, 12, 4, '#fff');
      } else {
        rect(pk.x - 9, pk.y - 9 + bob, 18, 18, '#3d7ea6');
        text('A', pk.x, pk.y + 5 + bob, 13, '#fff', 'center', true);
      }
    }
    // Mission marker: pulsing beacon.
    const target = state.missionTarget;
    if (target) {
      const pulse = 1 + Math.sin(state.elapsed * 4) * 0.15;
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(target.x, target.y, 34 * pulse, 0, TAU);
      context.stroke();
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.moveTo(target.x, target.y - 52);
      context.lineTo(target.x + 10, target.y - 34);
      context.lineTo(target.x - 10, target.y - 34);
      context.closePath();
      context.fill();
      text(target.name, target.x, target.y - 60, 15, PALETTE.gold, 'center', true);
    }
    for (const car of state.cars) if (!car.dead) drawCar(car);
    for (const ped of state.peds) drawPerson(ped.x, ped.y, ped.angle, ped.color, 10, false);
    for (const cop of state.cops) {
      drawPerson(cop.x, cop.y, cop.angle, '#2f6fd0', 11, false);
      context.fillStyle = '#1b3f7a';
      context.fillRect(cop.x - 7, cop.y - 16, 14, 5);
    }
    for (const e of state.enemies) {
      drawPerson(e.x, e.y, e.angle, '#8e2f2f', 12, false);
      rect(e.x - 16, e.y - 24, 32, 5, 'rgba(0,0,0,0.5)');
      rect(e.x - 16, e.y - 24, 32 * clamp(e.health / 60, 0, 1), 5, '#e5534b');
    }
    const p = state.player;
    if (!p.inCar) drawPerson(p.x, p.y, p.angle, PALETTE.playerShirt, PLAYER.radius, true);
    // Bullets.
    context.fillStyle = '#ffe9a8';
    for (const b of state.bullets) {
      if (!b.active) continue;
      context.beginPath();
      context.arc(b.x, b.y, 3, 0, TAU);
      context.fill();
    }
    // Particles.
    for (const pt of state.particles) {
      if (!pt.active) continue;
      context.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      circle(pt.x, pt.y, pt.size, pt.color);
    }
    context.globalAlpha = 1;
  }

  function drawHud(state) {
    const p = state.player;
    // Top-left: health, cash, weapon.
    rect(16, 14, 240, 86, 'rgba(10,10,12,0.55)');
    text('HEALTH', 28, 36, 13, PALETTE.muted, 'left', true);
    rect(28, 44, 180, 12, 'rgba(0,0,0,0.6)');
    rect(28, 44, 180 * clamp(p.health / PLAYER.health, 0, 1), 12, p.health > 40 ? PALETTE.green : PALETTE.red);
    text(`$${state.cash.toLocaleString('en-US')}`, 28, 82, 22, PALETTE.gold, 'left', true);
    const weapon = p.inCar ? 'DRIVING' : (p.ammo > 0 ? `PISTOL ${p.ammo}/${p.reserveAmmo}` : 'FISTS — press R to reload');
    text(weapon, 28, 96, 13, PALETTE.text, 'left');
    if (p.inCar) {
      const speed = Math.round(Math.abs(p.inCar.speed) * 0.16);
      text(`${speed} km/h`, 218, 82, 22, PALETTE.text, 'right', true);
      const hp = clamp(p.inCar.health / 100, 0, 1);
      rect(28, 100, 180, 6, 'rgba(0,0,0,0.6)');
      rect(28, 100, 180 * hp, 6, hp > 0.4 ? '#7fb3e8' : PALETTE.red);
    }
    // Wanted stars, top centre.
    const stars = state.wanted;
    const starW = 34;
    const sx = VIEW.width / 2 - (5 * starW) / 2;
    for (let i = 0; i < 5; i += 1) {
      text('★', sx + i * starW + 17, 44, 30, i < stars ? PALETTE.gold : 'rgba(255,255,255,0.25)', 'center', true);
    }
    if (stars > 0) text('WANTED', VIEW.width / 2, 66, 12, PALETTE.red, 'center', true);
    // Clock + district, top centre below stars.
    const hours = Math.floor(state.clock / 3600);
    const minutes = Math.floor((state.clock % 3600) / 60);
    const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    text(`${clock}  •  ${districtNameAt(p.x, p.y)}`, VIEW.width / 2, 88, 15, PALETTE.text, 'center');
    // Mission objective, bottom centre.
    const objective = state.missionObjective;
    if (objective) {
      const w = Math.min(760, context.measureText(objective).width + 60);
      rect((VIEW.width - w) / 2, VIEW.height - 64, w, 44, 'rgba(10,10,12,0.6)');
      context.strokeStyle = PALETTE.gold;
      context.lineWidth = 2;
      context.strokeRect((VIEW.width - w) / 2, VIEW.height - 64, w, 44);
      text(objective, VIEW.width / 2, VIEW.height - 35, 17, PALETTE.text, 'center');
    }
    // Story message banner.
    if (state.messageTimer > 0 && state.message) {
      const alpha = clamp(state.messageTimer, 0, 1);
      context.globalAlpha = alpha;
      rect(180, 120, VIEW.width - 360, 52, 'rgba(10,10,12,0.7)');
      context.strokeStyle = PALETTE.gold;
      context.strokeRect(180, 120, VIEW.width - 360, 52);
      text(state.message, VIEW.width / 2, 153, 17, PALETTE.text, 'center');
      context.globalAlpha = 1;
    }
    // Controls hint, bottom-left.
    text('WASD move/drive • E steal car • F punch • Click shoot • R reload • P pause • M mute', 16, VIEW.height - 16, 13, 'rgba(255,246,229,0.75)', 'left');
    // Busted warning.
    if (p.bustedTimer > 0 && !p.inCar && state.wanted > 0) {
      text('THE COPS ARE GRABBING YOU — RUN!', VIEW.width / 2, 200, 24, PALETTE.red, 'center', true);
    }
  }

  function drawMinimap(state) {
    const { x, y, w, h } = MINIMAP;
    const sx = w / WORLD.width;
    const sy = h / WORLD.height;
    rect(x, y, w, h, PALETTE.minimapBg);
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 2;
    context.strokeRect(x, y, w, h);
    // Water + roads, simplified.
    rect(x, y, CITY.waterX * sx, h, 'rgba(46,127,158,0.8)');
    rect(x, CITY.canalY * sy + y, w, CITY.canalHeight * sy, 'rgba(31,95,125,0.8)');
    context.fillStyle = 'rgba(255,255,255,0.35)';
    for (const rx of CITY.verticalRoads) context.fillRect(x + rx * sx - 1, y, 2, h);
    for (const ry of CITY.horizontalRoads) context.fillRect(x, y + ry * sy - 1, w, 2);
    // Mission marker.
    const target = state.missionTarget;
    if (target) {
      const pulse = 3 + Math.sin(state.elapsed * 5) * 1.5;
      circle(x + target.x * sx, y + target.y * sy, pulse, PALETTE.gold);
    }
    // Police dots.
    for (const car of state.cars) {
      if (car.kind !== 'police' || car.dead) continue;
      circle(x + car.x * sx, y + car.y * sy, 3, '#5aa2ff');
    }
    for (const cop of state.cops) circle(x + cop.x * sx, y + cop.y * sy, 2.5, '#5aa2ff');
    // Player arrow.
    const p = state.player;
    context.save();
    context.translate(x + p.x * sx, y + p.y * sy);
    context.rotate(p.angle);
    context.fillStyle = '#fff';
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    text('N', x + w / 2, y - 6, 13, PALETTE.text, 'center', true);
    text('PORTO VERDE', x + w / 2, y + h + 16, 11, PALETTE.muted, 'center', true);
  }

  function drawGoldenHour() {
    const grad = context.createLinearGradient(0, 0, VIEW.width, VIEW.height);
    grad.addColorStop(0, 'rgba(255, 170, 60, 0.10)');
    grad.addColorStop(0.6, 'rgba(255, 140, 60, 0.05)');
    grad.addColorStop(1, 'rgba(120, 40, 120, 0.08)');
    context.fillStyle = grad;
    context.fillRect(0, 0, VIEW.width, VIEW.height);
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 32 + 70;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    rect(x, y, width, height, PALETTE.panel);
    context.strokeStyle = accent || PALETTE.gold;
    context.lineWidth = 3;
    context.strokeRect(x, y, width, height);
    text(title, VIEW.width / 2, y + 74, 52, PALETTE.gold, 'center', true);
    lines.forEach((line, i) => {
      text(line, VIEW.width / 2, y + 122 + i * 32, 19, PALETTE.muted, 'center');
    });
    text(prompt, VIEW.width / 2, y + height - 30, 21, PALETTE.text, 'center');
  }

  /** Paint one frame: the city through the camera, then the HUD or a panel for the screen. */
  function draw(state, screen, save) {
    const p = state.player;
    view.camX = clamp(p.x - VIEW.width / 2, 0, WORLD.width - VIEW.width);
    view.camY = clamp(p.y - VIEW.height / 2, 0, WORLD.height - VIEW.height);
    if (state.shake > 0) {
      view.camX += (Math.random() - 0.5) * state.shake * 18;
      view.camY += (Math.random() - 0.5) * state.shake * 18;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    rect(0, 0, canvas.width, canvas.height, PALETTE.backdrop);
    context.setTransform(view.scale, 0, 0, view.scale, view.x - view.camX * view.scale, view.y - view.camY * view.scale);
    drawCity(state);
    drawEntities(state);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawGoldenHour();
    if (screen === SCREEN_TITLE) {
      rect(0, 0, VIEW.width, VIEW.height, 'rgba(10,8,6,0.45)');
      drawPanel('VICE BAY', [
        'Porto Verde. Sun, sea, and one last score.',
        'Mara has five jobs for you — car chases, dock shootouts,',
        'and the biggest bank in Uptown. Steal cars, lose the cops, get paid.',
        '',
        'WASD move / drive   •   E steal a car   •   F punch   •   Click to shoot',
        'R reload   •   P pause   •   M mute',
        save ? `Saved game: $${(save.cash ?? 0).toLocaleString('en-US')} — Mission ${(save.missionIndex ?? 0) + 1} of ${MISSIONS.length}` : 'No saved game yet — a fresh start in Old Town.',
      ], save ? 'Press Enter to Continue, or N for a New Game' : 'Press Enter or click to start', PALETTE.gold);
      return;
    }
    drawHud(state);
    drawMinimap(state);
    if (screen === SCREEN_PAUSED) {
      rect(0, 0, VIEW.width, VIEW.height, 'rgba(10,8,6,0.55)');
      drawPanel('PAUSED', [`Cash $${state.cash.toLocaleString('en-US')}  •  Mission ${state.missionIndex + 1} of ${MISSIONS.length}`, 'Progress saves automatically.'], 'Press P to resume', PALETTE.gold);
    } else if (screen === SCREEN_OVER) {
      rect(0, 0, VIEW.width, VIEW.height, 'rgba(10,8,6,0.6)');
      const busted = state.over === 'busted';
      drawPanel(busted ? 'BUSTED' : 'WASTED', [
        busted ? 'The Porto Verde police finally caught up with you.' : 'Porto Verde is a hard city. You did not make it.',
        `Cash kept: $${state.cash.toLocaleString('en-US')}  •  Missions done: ${state.stats.missionsDone}`,
        `Kills: ${state.stats.kills}  •  Cars stolen: ${state.stats.carsStolen}`,
      ], 'Press Enter to try again — the mission restarts', PALETTE.red);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}
