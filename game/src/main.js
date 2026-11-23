// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between four screens: title, play, paused and game over. Progress (cash, mission,
// stats) saves to localStorage whenever it changes and on pause.
//
// ?seed=N fixes the city and traffic. ?shot=cover|drive|foot|title (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_EXPLOSION, EVENT_MISSION, EVENT_PICKUP, EVENT_SHOT, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_PAUSE, ACTION_PUNCH, ACTION_RELOAD, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const ACTION_MUTE = 32;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(world.getSave()));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function viewState() {
  return Object.assign({}, world.state, {
    missionTarget: world.missionTarget(),
    missionObjective: world.missionObjective(),
  });
}

function runShot(name) {
  const scene = stageShot(name, world);
  const save = readSave();
  // Exposed for headless verification: the staged player's position and vehicle.
  window.__shotInfo = () => {
    const p = world.state.player;
    return {
      x: Math.round(p.x), y: Math.round(p.y), inCar: !!p.inCar,
      carX: p.inCar ? Math.round(p.inCar.x) : null,
      carY: p.inCar ? Math.round(p.inCar.y) : null,
      carHealth: p.inCar ? Math.round(p.inCar.health) : null,
      wanted: world.state.wanted, over: world.state.over,
      policeCars: world.state.cars.filter((c) => c.kind === 'police' && !c.dead).length,
      enemies: world.state.enemies.length,
    };
  };
  let painted = 0;
  function paint() {
    renderer.draw(viewState(), scene.screen, save);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();
  let savedCash = -1;
  let savedMission = -1;

  function announce(message) {
    status.textContent = message;
  }

  function startNewGame() {
    world.reset();
    screen = SCREEN_PLAY;
    save = null;
    writeSave();
    announce('New game. Mara has a job for you at the Marina.');
  }

  function continueGame() {
    world.reset();
    if (save) world.loadSave(save);
    screen = SCREEN_PLAY;
    announce('Continuing your story in Porto Verde.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    writeSave();
    announce(world.state.over === 'busted' ? 'Busted. The police caught you.' : 'Wasted. Porto Verde got you.');
  }

  function maybeSave() {
    if (world.state.cash !== savedCash || world.state.missionIndex !== savedMission) {
      savedCash = world.state.cash;
      savedMission = world.state.missionIndex;
      writeSave();
    }
  }

  function controlState() {
    const move = input.move();
    const mouse = input.mouse();
    // Mouse position in world space: the canvas is scaled to the window, the view to 1280x720.
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 720 / rect.height;
    const wx = mouse.x * scaleX;
    const wy = mouse.y * scaleY;
    const camX = Math.max(0, Math.min(3200 - 1280, world.state.player.x - 640));
    const camY = Math.max(0, Math.min(2400 - 720, world.state.player.y - 360));
    const aimAngle = Math.atan2(wy + camY - world.state.player.y, wx + camX - world.state.player.x);
    return {
      move,
      steer: input.steer(),
      throttle: input.throttle(),
      aimAngle,
      firing: mouse.down,
      punch: false,
      enterCar: false,
      reload: false,
    };
  }

  function handleActions(ctl) {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) audio.toggleMute();
    if (actions & ACTION_CONFIRM) audio.unlock();
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        if (save) continueGame();
        else startNewGame();
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        // Retry the current mission from the hideout, cash kept.
        const keep = world.getSave();
        world.reset();
        world.loadSave({ ...keep, missionIndex: keep.missionIndex, missionStep: 0 });
        screen = SCREEN_PLAY;
        announce('Back on the street. The mission restarts.');
      }
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused. Progress saved.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_ENTER_CAR) ctl.enterCar = true;
      if (actions & ACTION_PUNCH) ctl.punch = true;
      if (actions & ACTION_RELOAD) ctl.reload = true;
      if (input.mouse().clicked) {
        ctl.firing = true;
        input.clearClick();
      }
    }
  }

  function step(ctl) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, ctl, true);
      return;
    }
    const events = world.step(STEP, ctl, false);
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISSION) audio.missionJingle();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_EXPLOSION) audio.explosion();
    if (events & EVENT_BUSTED) audio.busted();
    if (events & EVENT_WASTED) audio.fail();
    if (events & (EVENT_BUSTED | EVENT_WASTED)) endGame();
    maybeSave();
    const speed = world.state.player.inCar ? Math.abs(world.state.player.inCar.speed) : 0;
    audio.update(STEP, speed, world.state.wanted);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const ctl = controlState();
    handleActions(ctl);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(ctl);
        accumulator -= STEP;
        // One-shot presses fire once per frame, not once per fixed step.
        if (first) {
          ctl.enterCar = false;
          ctl.punch = false;
          ctl.reload = false;
          ctl.firing = ctl.firing && input.mouse().down;
          first = false;
        }
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(viewState(), screen, save);
  }

  // Leaving the tab pauses a running game rather than letting the cops catch you unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused. Progress saved.');
    }
  });

  // N starts a new game from the title screen.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && screen === SCREEN_TITLE && save) startNewGame();
  });

  announce('Vice Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
