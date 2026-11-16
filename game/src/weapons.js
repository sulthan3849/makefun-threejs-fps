// Weapons: one table owns every number, one state machine owns every gun.
// The view model is boxes on the camera; the flash and kick are driven by step().
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// damage: body hit. headMult: headshot multiplier. gap: seconds between shots.
// spread: radians at rest; moveSpread: added at full sprint. recoil: pitch kick.
export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', kind: 'pistol', price: 300, damage: 26, headMult: 3.0,
    gap: 0.16, mag: 12, reserve: 48, reload: 1.4, spread: 0.004, moveSpread: 0.02,
    recoil: 0.008, auto: false, range: 60,
  },
  smg: {
    name: 'VK-9 Ripper', kind: 'smg', price: 900, damage: 21, headMult: 2.5,
    gap: 0.075, mag: 32, reserve: 96, reload: 1.7, spread: 0.009, moveSpread: 0.03,
    recoil: 0.006, auto: true, range: 55,
  },
  rifle: {
    name: 'AR-77 Foundry', kind: 'rifle', price: 2700, damage: 34, headMult: 2.6,
    gap: 0.105, mag: 30, reserve: 90, reload: 2.0, spread: 0.0028, moveSpread: 0.028,
    recoil: 0.011, auto: true, range: 90,
  },
  sniper: {
    name: 'LR-90 Longshot', kind: 'sniper', price: 4000, damage: 92, headMult: 2.2,
    gap: 1.15, mag: 5, reserve: 15, reload: 2.8, spread: 0.0012, moveSpread: 0.055,
    recoil: 0.045, auto: false, range: 120,
  },
};

const MUZZLE_TIME = 0.055;

function buildViewModel(def) {
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22262c'), roughness: 0.65, metalness: 0.25 });
  const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a4149'), roughness: 0.45, metalness: 0.55 });
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4a3421'), roughness: 0.85, metalness: 0.05 });
  const model = new THREE.Group();
  const long = def.kind === 'rifle' || def.kind === 'sniper';
  const barrelLen = def.kind === 'sniper' ? 0.62 : long ? 0.42 : def.kind === 'smg' ? 0.3 : 0.16;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.1, long ? 0.44 : 0.26), metal);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, barrelLen), dark);
  barrel.position.set(0, 0.028, -(long ? 0.22 : 0.13) - barrelLen / 2 + 0.05);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 0.16), grip);
  stock.position.set(0, -0.018, long ? 0.26 : 0.18);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.06), dark);
  sight.position.set(0, 0.075, -0.05);
  model.add(receiver, barrel, stock, sight);
  if (def.kind === 'sniper') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 10), dark);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, 0.02);
    model.add(scope);
  }
  model.position.set(0.28, -0.26, -0.55);
  model.scale.setScalar(0.8);
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.12, 0.12),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.hazard), transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.28, -0.22, -1.0);
  flash.visible = false;
  return { model, flash };
}

export function createWeapon(camera, defId) {
  let def = WEAPONS[defId];
  let view = buildViewModel(def);
  camera.add(view.model, view.flash);
  const state = {
    id: defId, mag: def.mag, reserve: def.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, emptyClick: 0,
  };

  function swap(id) {
    camera.remove(view.model, view.flash);
    def = WEAPONS[id];
    view = buildViewModel(def);
    camera.add(view.model, view.flash);
    state.id = id;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
  }

  function step(dt, moving) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.emptyClick = Math.max(0, state.emptyClick - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 13);
    const bob = moving ? Math.sin(performance.now() * 0.011) * 0.006 : 0;
    view.model.position.set(0.28, -0.26 + bob, -0.55 + state.kick);
    view.model.rotation.x = state.kick * 2.4;
    view.flash.visible = state.flash > 0;
    view.flash.rotation.z = state.flash * 28;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      const t = 1 - state.reloadLeft / def.reload;
      view.model.rotation.x = -0.6 * Math.sin(t * Math.PI);
      view.model.position.y = -0.26 - 0.07 * Math.sin(t * Math.PI);
      if (state.reloadLeft === 0) {
        const take = Math.min(def.mag - state.mag, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    get def() { return def; },
    step,
    swap,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.gap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    clickEmpty() {
      if (state.emptyClick > 0) return false;
      state.emptyClick = 0.3;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false;
      state.reloadLeft = def.reload;
      return true;
    },
    spread(speed) {
      const moving = Math.min(1, speed / 5.2);
      return def.spread + moving * def.moveSpread;
    },
    refillAmmo() {
      state.mag = def.mag;
      state.reserve = def.reserve;
    },
  };
}
