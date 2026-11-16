// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. Wires input to the game (buy menu, grenades, weapon slots, pause) and the
// camera to the player's body. ?shot=start|play|end with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and sets
// window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createGame } from './game.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { unlockAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 62);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const combat = createCombat(scene, world, effects);
const hud = createHud();
const game = createGame({ scene, camera, world, combat, effects, hud, random });
const input = createInput(renderer.domElement, onLockChange);
const player = game.player;
const playerBody = player.body;

let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let lastWeaponId = '';

hud.setMoney(800);
hud.setScore(0, 0);
hud.setHealth(100, 0);
hud.setAmmo(12, 48);
hud.setWeaponName('P9 SIDEARM');
hud.setGrenades(0);

function syncCamera() {
  camera.position.set(playerBody.state.position.x, playerBody.state.position.y + playerBody.state.eye, playerBody.state.position.z);
  camera.rotation.set(playerBody.state.pitch, playerBody.state.yaw, 0, 'YXZ');
}

function onLockChange(locked) {
  if (shot) return;
  unlockAudio();
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (game.state.buyOpen) {
    // Buy menu owns the unlocked pointer; no pause overlay.
  } else if (game.state.phase === 'buy' || game.state.phase === 'live') {
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  unlockAudio();
  if (game.state.phase === 'menu' || game.state.phase === 'matchEnd') {
    hud.hideMatchEnd();
    game.startMatch();
    hud.hideOverlay();
  } else {
    hud.hideOverlay();
  }
  input.requestLock();
});

document.getElementById('match-end').addEventListener('click', () => {
  if (shot) return;
  hud.hideMatchEnd();
  game.startMatch();
  input.requestLock();
});

document.getElementById('buy-close').addEventListener('click', () => {
  closeBuyMenu();
});

function openBuyMenu() {
  game.state.buyOpen = true;
  hud.showBuyMenu((item) => game.buy(item));
  document.exitPointerLock();
}

function closeBuyMenu() {
  if (!game.state.buyOpen) return;
  game.state.buyOpen = false;
  hud.hideBuyMenu();
  input.requestLock();
}

function handlePressed(codes) {
  for (const code of codes) {
    if (code === 'KeyB' && game.state.phase === 'buy') {
      if (game.state.buyOpen) closeBuyMenu();
      else openBuyMenu();
    } else if (code === 'KeyG') {
      input.consumeGrenade = true;
    } else if (game.state.buyOpen && code.startsWith('Digit')) {
      const item = ['smg', 'rifle', 'sniper', 'grenade', 'armor'][Number(code.slice(5)) - 1];
      if (item) game.buy(item);
    } else if (!game.state.buyOpen && code === 'Digit1' && player.primary) {
      game.switchWeapon(player.primary);
    } else if (!game.state.buyOpen && code === 'Digit2') {
      game.switchWeapon('pistol');
    }
  }
}

function step(dt) {
  handlePressed(input.takePressed());
  game.step(dt, input);
  input.consumeGrenade = false;
  effects.step(dt);
  const spreadPx = Math.round(game.playerWeapon.spread(playerBody.groundSpeed()) * 900);
  hud.setCrosshairSpread(2 + Math.min(26, spreadPx));
  if (game.playerWeapon.state.id !== lastWeaponId) {
    lastWeaponId = game.playerWeapon.state.id;
    hud.setWeaponName(game.playerWeapon.def.name.toUpperCase());
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (input.state.locked) playerBody.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    // The match-end card needs a free pointer.
    if (game.state.phase === 'matchEnd' && document.pointerLockElement) document.exitPointerLock();
    // If the buy menu closed itself when the buy phase ended, the player is left
    // without pointer lock: offer the pause card so one click resumes.
    if (!shot && started && !input.state.locked && !game.state.buyOpen
      && (game.state.phase === 'buy' || game.state.phase === 'live')) {
      hud.showOverlay('paused');
    }
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const p = playerBody.state.position;
  const dx = point.x - p.x;
  const dy = point.y - (p.y + playerBody.state.eye);
  const dz = point.z - p.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  playerBody.state.yaw = Math.atan2(-dx, -dz);
  playerBody.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      document.title = 'shot-ready';
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuyMenu();
  if (name === 'start') {
    playerBody.teleport(0, 16.5, -0.12);
    settle(10);
    aimAt(new THREE.Vector3(-6, 1.6, -8));
    hud.showOverlay('start');
  } else if (name === 'play') {
    game.startMatch();
    game.state.phase = 'live';
    game.state.roundTime = 87;
    game.state.money = 2650;
    hud.setMoney(2650);
    hud.setScore(1, 1);
    game.state.score = { atk: 1, def: 1 };
    playerBody.teleport(0, 6, 0.1);
    // Stage two enemies in the open mid lane so the frame reads as a fight.
    const foes = game.bots.filter((b) => b.team === 'def');
    foes[0].body.teleport(-1.5, -6.5, Math.PI);
    foes[1].body.teleport(4.5, -2, Math.PI * 0.75);
    const ally = game.bots.find((b) => b.team === 'atk');
    ally.body.teleport(-4, 9, -0.4);
    settle(40);
    aimAt(new THREE.Vector3(-1.5, 1.45, -6.5));
    // One live shot: tracer, muzzle flash and hit marker in the frame.
    game.playerWeapon.state.mag = 24;
    input.state.firing = true;
    step(FIXED_STEP);
    input.state.firing = false;
    settle(2);
    hud.hideBanner();
  } else {
    game.startMatch();
    game.state.score = { atk: 2, def: 1 };
    hud.setScore(2, 1);
    game.state.phase = 'roundEnd';
    game.state.roundTime = 64;
    hud.setTimer(64, 'live', false);
    playerBody.teleport(0, 10, -0.1);
    const foes = game.bots.filter((b) => b.team === 'def');
    foes[0].body.teleport(-3, -4, Math.PI);
    foes[1].body.teleport(5, 0, Math.PI * 0.8);
    settle(30);
    aimAt(new THREE.Vector3(0, 1.5, -8));
    hud.hideBanner();
    hud.showRoundEnd(true, 'Squad eliminated', 2, 1);
  }
  hud.setHealth(player.hp, player.armor);
  hud.setAmmo(game.playerWeapon.state.mag, game.playerWeapon.state.reserve);
  paintTwiceThenReady();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
// Static world matrices, computed once here: the simulation raycasts before the
// first render (screenshot mode steps the sim synchronously), and agent meshes
// keep their own matrices fresh in their step functions.
scene.updateMatrixWorld(true);
// Debug handle for headless play-testing (drives the match from a console).
window.__game = game;
if (shot) runShot(shot);
else requestAnimationFrame(frame);
