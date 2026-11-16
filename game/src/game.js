// FOUNDRY YARD, the match itself: one state object, one fixed-step update.
// Phases: buy -> live -> roundEnd -> (next round) -> matchEnd. Attackers (the
// player's team, VANGUARD) plant the spike at A or B; defenders (EMBER) stop them.
// Money is earned per round and per kill and spent in the buy menu.
import * as THREE from 'three';
import { createBody } from './player.js';
import { createWeapon, WEAPONS } from './weapons.js';
import { createBot, stepBot } from './bot.js';
import { SITES, SPAWNS } from './world.js';
import { sfx } from './audio.js';

export const BUY_ITEMS = [
  { id: 'smg', key: 'Digit1', label: 'VK-9 Ripper — SMG', price: 900 },
  { id: 'rifle', key: 'Digit2', label: 'AR-77 Foundry — Rifle', price: 2700 },
  { id: 'sniper', key: 'Digit3', label: 'LR-90 Longshot — Sniper', price: 4000 },
  { id: 'grenade', key: 'Digit4', label: 'Frag grenade', price: 300 },
  { id: 'armor', key: 'Digit5', label: 'Kevlar vest (+50 armour)', price: 650 },
];

const ROUND_TIME = 100;
const BUY_TIME = 12;
const PLANT_TIME = 3.5;
const DEFUSE_TIME = 5;
const SPIKE_TIME = 35;
const WIN_ROUNDS = 5;

export function createGame(deps) {
  const { scene, camera, world, combat, effects, hud, random } = deps;

  const state = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    phaseTime: 0,
    round: 1,
    score: { atk: 0, def: 0 },
    roundTime: ROUND_TIME,
    money: 800,
    lossStreak: 0,
    spike: { planted: false, x: 0, z: 0, site: null, carrier: null, timer: SPIKE_TIME, beepAt: 0 },
    killfeed: [],
    matchWinner: null,
    buyOpen: false,
    grenades: 0,
    plantProgress: 0,
    defuseProgress: 0,
  };

  // The player: same agent shape as a bot, plus a view-model weapon and a wallet.
  const playerBody = createBody(world.colliders, SPAWNS.attackers[0], { yaw: 0 });
  const playerWeapon = createWeapon(camera, 'pistol');
  const player = {
    id: 'atk-you', name: 'You', team: 'atk', isPlayer: true, alive: true,
    hp: 100, armor: 0, body: playerBody, mesh: null,
    weapon: playerWeapon, primary: null, kills: 0, deaths: 0,
    grenadeCooldown: 0,
  };

  const agents = [player];
  const bots = [];
  for (let i = 0; i < 4; i += 1) {
    const bot = createBot(scene, world, 'atk', i, SPAWNS.attackers[i + 1], random);
    bots.push(bot);
    agents.push(bot);
  }
  for (let i = 0; i < 5; i += 1) {
    const bot = createBot(scene, world, 'def', i, SPAWNS.defenders[i], random);
    bots.push(bot);
    agents.push(bot);
  }

  const shootables = [...world.shootables];
  for (const bot of bots) shootables.push(bot.mesh.bodyMesh, bot.mesh.headMesh);

  // The player has no visible body, but bots still need something honest to hit:
  // invisible hit meshes that ride the player's body (raycast ignores visibility).
  const playerHit = new THREE.Group();
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const playerBodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 1, 10), hitMat);
  const playerHeadMesh = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), hitMat);
  playerBodyMesh.userData = { agent: player, part: 'body' };
  playerHeadMesh.userData = { agent: player, part: 'head' };
  playerHit.add(playerBodyMesh, playerHeadMesh);
  scene.add(playerHit);
  shootables.push(playerBodyMesh, playerHeadMesh);

  function syncPlayerHit() {
    const st = player.body.state;
    playerHit.position.set(st.position.x, st.position.y, st.position.z);
    playerBodyMesh.position.y = st.height / 2;
    playerBodyMesh.scale.y = st.height;
    playerHeadMesh.position.y = st.height - 0.14;
    // The simulation raycasts against these meshes, so their matrices are kept
    // fresh here instead of depending on the render loop's update.
    playerHit.updateMatrixWorld(true);
  }

  const recentShots = [];
  let elapsed = 0;
  let lastPlantBeep = 0;

  const eye = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const muzzle = new THREE.Vector3();

  function announce(text, sub, hold = 2.6) {
    hud.announce(text, sub);
  }

  function feed(killer, victim, headshot, weaponName) {
    state.killfeed.unshift({ killer, victim, headshot, weaponName, at: elapsed });
    if (state.killfeed.length > 6) state.killfeed.pop();
    hud.setKillfeed(state.killfeed);
  }

  function aliveOf(team) {
    return agents.filter((a) => a.alive && a.team === team);
  }

  function onDamage(target, amount, part, attacker) {
    const died = combat.applyDamage(target, amount, () => onDeath(target, attacker, part));
    if (target.isPlayer) {
      hud.flashDamage(part === 'head');
      hud.damageFrom(attacker);
      sfx.hurt();
    } else if (attacker && attacker.isPlayer) {
      hud.hitMarker(died, 120);
      if (died) sfx.kill();
      else sfx.hit();
    }
    return died;
  }

  function onDeath(victim, attacker, part) {
    victim.deaths += 1;
    if (victim.isPlayer) announce('You are down', 'Your squad fights on — next round in a moment', 3);
    if (victim.mesh) {
      victim.mesh.group.rotation.x = -Math.PI / 2;
      victim.mesh.group.position.y = 0.35;
    }
    if (attacker && attacker !== victim) {
      attacker.kills += 1;
      if (attacker.isPlayer) {
        state.money += 300;
        hud.setMoney(state.money);
      }
      feed(attacker.name, victim.name, part === 'head', attacker.weapon.def ? attacker.weapon.def.name : attacker.weapon.defId);
    } else {
      feed('—', victim.name, false, 'world');
    }
    if (victim === state.spike.carrier) {
      // The spike drops to the nearest living attacker.
      const carriers = aliveOf('atk').filter((a) => a !== victim);
      state.spike.carrier = carriers[0] ?? null;
      for (const b of bots) b.ai.isCarrier = b === state.spike.carrier;
      if (state.spike.carrier && state.spike.carrier.isPlayer) {
        announce('You carry the spike', 'Plant it at Site A or Site B — hold E');
        sfx.spikePickup();
      }
    }
    checkRoundEnd();
  }

  function checkRoundEnd() {
    if (state.phase !== 'live') return;
    const atkAlive = aliveOf('atk').length;
    const defAlive = aliveOf('def').length;
    if (defAlive === 0) endRound('atk', 'Squad eliminated');
    else if (atkAlive === 0 && !state.spike.planted) endRound('def', 'Squad eliminated');
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'roundEnd';
    state.phaseTime = 0;
    state.score[winner] += 1;
    const playerWon = winner === 'atk';
    if (playerWon) {
      state.money += 3250;
      state.lossStreak = 0;
      sfx.roundWin();
    } else {
      state.money += 1900 + Math.min(2, state.lossStreak) * 500;
      state.lossStreak += 1;
      sfx.roundLose();
    }
    if (state.spike.planted) {
      world.spike.visible = false;
      world.spikeLight.intensity = 0;
    }
    state.spike.planted = false;
    hud.setMoney(state.money);
    hud.setScore(state.score.atk, state.score.def);
    announce(playerWon ? 'ROUND WON' : 'ROUND LOST', reason, 4);
    hud.showRoundEnd(playerWon, reason, state.score.atk, state.score.def);
  }

  function startRound() {
    state.roundTime = ROUND_TIME;
    state.phase = 'buy';
    state.phaseTime = 0;
    state.spike = { planted: false, x: 0, z: 0, site: null, carrier: player, timer: SPIKE_TIME, beepAt: 0 };
    state.plantProgress = 0;
    state.defuseProgress = 0;
    // Reset every fighter to its spawn.
    const atkSpawns = [...SPAWNS.attackers];
    const defSpawns = [...SPAWNS.defenders];
    player.body.teleport(atkSpawns[0].x, atkSpawns[0].z, 0);
    player.hp = 100;
    player.alive = true;
    playerWeapon.refillAmmo();
    player.grenadeCooldown = 0;
    bots.forEach((bot, i) => {
      const spawn = bot.team === 'atk' ? atkSpawns[i + 1] : defSpawns[i % 5];
      bot.body.teleport(spawn.x, spawn.z, spawn.yaw);
      bot.hp = 100;
      bot.alive = true;
      bot.armor = state.round > 2 ? 50 : 0;
      bot.weapon.mag = bot.weapon.def.mag;
      bot.weapon.reloadLeft = 0;
      bot.ai.state = 'route';
      bot.ai.path = [];
      bot.ai.pathIdx = 0;
      bot.ai.goalNode = -1;
      bot.ai.target = null;
      bot.ai.channel = 0;
      bot.ai.investigate = null;
      bot.ai.isCarrier = false;
      bot.mesh.group.rotation.x = 0;
      bot.mesh.group.position.y = 0;
    });
    player.aiCarrierSync();
    hud.setMoney(state.money);
    hud.setScore(state.score.atk, state.score.def);
    hud.setHealth(player.hp, player.armor);
    hud.setAmmo(playerWeapon.state.mag, playerWeapon.state.reserve);
    announce(`ROUND ${state.round}`, 'Buy phase — press B for the buy menu', 3);
  }

  player.aiCarrierSync = () => {
    for (const b of bots) b.ai.isCarrier = b === state.spike.carrier;
  };

  function startMatch() {
    state.round = 1;
    state.score = { atk: 0, def: 0 };
    state.money = 800;
    state.lossStreak = 0;
    state.matchWinner = null;
    state.grenades = 0;
    player.primary = null;
    for (const k of Object.keys(ammoStore)) delete ammoStore[k];
    playerWeapon.swap('pistol');
    startRound();
  }

  // Ammo is remembered per weapon, so switching slots never refills a magazine.
  const ammoStore = {};
  function switchWeapon(id) {
    if (id !== 'pistol' && id !== player.primary) return;
    if (playerWeapon.state.id === id) return;
    ammoStore[playerWeapon.state.id] = { mag: playerWeapon.state.mag, reserve: playerWeapon.state.reserve };
    playerWeapon.swap(id);
    const saved = ammoStore[id];
    if (saved) {
      playerWeapon.state.mag = saved.mag;
      playerWeapon.state.reserve = saved.reserve;
    }
    hud.setAmmo(playerWeapon.state.mag, playerWeapon.state.reserve);
  }

  function buy(itemId) {
    const item = BUY_ITEMS.find((i) => i.id === itemId);
    if (!item || state.phase !== 'buy') return false;
    if (state.money < item.price) { sfx.denied(); return false; }
    if (itemId === 'grenade') {
      if (state.grenades >= 2) { sfx.denied(); return false; }
      state.grenades += 1;
    } else if (itemId === 'armor') {
      if (player.armor >= 100) { sfx.denied(); return false; }
      player.armor = 100;
    } else {
      player.primary = itemId;
      delete ammoStore[itemId];
      playerWeapon.swap(itemId);
    }
    state.money -= item.price;
    hud.setMoney(state.money);
    hud.setAmmo(playerWeapon.state.mag, playerWeapon.state.reserve);
    hud.setHealth(player.hp, player.armor);
    sfx.buy();
    return true;
  }

  function inSite(x, z) {
    for (const [name, site] of Object.entries(SITES)) {
      if (Math.hypot(x - site.x, z - site.z) <= site.r) return name;
    }
    return null;
  }

  function plantSpike() {
    const siteName = inSite(player.body.state.position.x, player.body.state.position.z);
    if (!siteName) return;
    const site = SITES[siteName];
    state.spike.planted = true;
    state.spike.x = player.body.state.position.x;
    state.spike.z = player.body.state.position.z;
    state.spike.site = siteName;
    state.spike.timer = SPIKE_TIME;
    state.spike.carrier = null;
    world.spike.position.set(state.spike.x, 0.15, state.spike.z);
    world.spike.visible = true;
    state.plantProgress = 0;
    announce('SPIKE PLANTED', `Site ${siteName} — defend it for ${SPIKE_TIME} seconds`, 3);
    sfx.plantBeep(true);
    for (const b of bots) {
      b.ai.isCarrier = false;
      if (b.team === 'def') { b.ai.state = 'route'; b.ai.goalNode = -1; }
    }
  }

  function detonate() {
    effects.explode(new THREE.Vector3(state.spike.x, 0.6, state.spike.z));
    world.spike.visible = false;
    world.spikeLight.intensity = 0;
    // Everyone near the blast takes heavy damage; the round is already decided.
    for (const a of agents) {
      if (!a.alive) continue;
      const d = Math.hypot(a.body.state.position.x - state.spike.x, a.body.state.position.z - state.spike.z);
      if (d < 9) combat.applyDamage(a, 200, () => onDeath(a, null, 'blast'));
    }
    endRound('atk', 'Spike detonated');
  }

  function onPlantBot(agent) {
    if (state.phase !== 'live' || state.spike.planted) return;
    const siteName = inSite(agent.body.state.position.x, agent.body.state.position.z);
    if (!siteName) return;
    const site = SITES[siteName];
    state.spike.planted = true;
    state.spike.x = agent.body.state.position.x;
    state.spike.z = agent.body.state.position.z;
    state.spike.site = siteName;
    state.spike.timer = SPIKE_TIME;
    state.spike.carrier = null;
    world.spike.position.set(state.spike.x, 0.15, state.spike.z);
    world.spike.visible = true;
    announce('SPIKE PLANTED', `${agent.name} planted at Site ${siteName} — retake it`, 3);
    sfx.plantBeep(true);
    for (const b of bots) b.ai.isCarrier = false;
  }

  function onDefuseBot(agent) {
    if (state.phase !== 'live' || !state.spike.planted) return;
    state.spike.planted = false;
    world.spike.visible = false;
    world.spikeLight.intensity = 0;
    announce('SPIKE DEFUSED', `${agent.name} defused the spike`, 3);
    endRound('def', 'Spike defused');
  }

  function playerShoot(spread) {
    if (!playerWeapon.takeRound()) return false;
    camera.getWorldDirection(dir);
    dir.x += (random() * 2 - 1) * spread;
    dir.y += (random() * 2 - 1) * spread;
    dir.z += (random() * 2 - 1) * spread;
    dir.normalize();
    eye.copy(camera.position);
    muzzle.copy(eye).addScaledVector(dir, 0.7);
    const hit = combat.fireShot(player, eye, dir, playerWeapon.def, shootables, agents, onDamage);
    const end = hit ? hit.point : new THREE.Vector3().copy(eye).addScaledVector(dir, playerWeapon.def.range);
    effects.fireTracer(muzzle, end);
    if (hit && hit.blocked) effects.impact(hit.point, new THREE.Vector3(0, 1, 0));
    playerWeapon.pullTrigger();
    playerBody.recoil(playerWeapon.def.recoil * (0.85 + random() * 0.3), (random() * 2 - 1) * 0.004);
    sfx.shot(playerWeapon.def.kind, 0);
    recentShots.push({ x: eye.x, z: eye.z, team: 'atk', at: elapsed });
    hud.setAmmo(playerWeapon.state.mag, playerWeapon.state.reserve);
    return true;
  }

  function step(dt, input) {
    elapsed += dt;
    state.phaseTime += dt;
    // Prune stale gunshot reports.
    while (recentShots.length && elapsed - recentShots[0].at > 2) recentShots.shift();

    if (state.phase === 'buy') {
      if (state.phaseTime >= BUY_TIME) {
        state.phase = 'live';
        state.phaseTime = 0;
        state.buyOpen = false;
        hud.hideBuyMenu();
        announce('GO', 'Plant the spike at A or B', 2);
      }
    } else if (state.phase === 'live') {
      state.roundTime -= dt;
      if (state.spike.planted) {
        state.spike.timer -= dt;
        // Blink the planted spike and beep faster as it nears detonation.
        const blink = Math.sin(elapsed * 8) > 0;
        world.spikeLight.intensity = blink ? 14 : 2;
        if (elapsed - lastPlantBeep > Math.max(0.35, state.spike.timer / SPIKE_TIME)) {
          lastPlantBeep = elapsed;
          sfx.plantBeep();
        }
        if (state.spike.timer <= 0) detonate();
      }
      if (state.roundTime <= 0 && state.phase === 'live' && !state.spike.planted) {
        endRound('def', 'Time expired');
      }
    } else if (state.phase === 'roundEnd') {
      if (state.phaseTime >= 4.5) {
        hud.hideRoundEnd();
        if (state.score.atk >= WIN_ROUNDS || state.score.def >= WIN_ROUNDS || state.round >= 9) {
          state.phase = 'matchEnd';
          state.matchWinner = state.score.atk > state.score.def ? 'atk' : 'def';
          hud.showMatchEnd(state.matchWinner === 'atk', state.score.atk, state.score.def);
        } else {
          state.round += 1;
          startRound();
        }
      }
    }

    const simActive = state.phase === 'buy' || state.phase === 'live';
    if (!simActive) return;

    // --- Player ---
    const keys = input.state.keys;
    const move = {
      forward: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
      strafe: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      crouch: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'),
      jump: keys.has('Space'),
    };
    if (player.alive) {
      playerBody.step(dt, move);
      player.grenadeCooldown = Math.max(0, player.grenadeCooldown - dt);
      playerWeapon.step(dt, playerBody.groundSpeed() > 0.5);
      if (input.state.firing && state.phase === 'live') {
        if (playerWeapon.ready()) playerShoot(playerWeapon.spread(playerBody.groundSpeed()));
        else if (playerWeapon.state.mag === 0 && playerWeapon.clickEmpty()) sfx.dryFire();
      }
      if (keys.has('KeyR') && playerWeapon.reload()) sfx.reload();
      // Plant channel: hold E inside a site while carrying the spike.
      const carrying = state.spike.carrier === player && !state.spike.planted;
      if (carrying && state.phase === 'live' && keys.has('KeyE') && inSite(player.body.state.position.x, player.body.state.position.z)) {
        state.plantProgress += dt / PLANT_TIME;
        if (Math.floor(state.plantProgress * 10) !== Math.floor((state.plantProgress - dt / PLANT_TIME) * 10)) sfx.plantBeep();
        if (state.plantProgress >= 1) plantSpike();
      } else {
        state.plantProgress = 0;
      }
      hud.setPlantProgress(state.plantProgress);
      // Grenade throw.
      if (input.consumeGrenade && state.grenades > 0 && player.grenadeCooldown <= 0 && state.phase === 'live') {
        state.grenades -= 1;
        player.grenadeCooldown = 0.8;
        camera.getWorldDirection(dir);
        combat.throwGrenade(player, camera.position, dir);
        hud.setGrenades(state.grenades);
      }
      hud.setHealth(player.hp, player.armor);
    }

    // --- Bots ---
    syncPlayerHit();
    const ctx = {
      world, combat, effects, agents, game: state, random, shootables, recentShots,
      now: elapsed, sfxShot: (kind, d) => sfx.shot(kind, d),
      playerPos: player.body.state.position,
      onDamage,
      onPlant: onPlantBot,
      onDefuse: onDefuseBot,
    };
    for (const bot of bots) {
      if (bot.alive) stepBot(bot, dt, elapsed, ctx);
    }

    combat.stepGrenades(dt, agents, onDamage);

    // --- HUD ---
    hud.setTimer(state.phase === 'live' ? Math.max(0, state.spike.planted ? state.spike.timer : state.roundTime) : state.phase === 'buy' ? BUY_TIME - state.phaseTime : state.roundTime, state.phase, state.spike.planted);
    hud.setAlive(aliveOf('atk').length, aliveOf('def').length);
    hud.setAmmo(playerWeapon.state.mag, playerWeapon.state.reserve);
    hud.setGrenades(state.grenades);
    hud.setSpike(state.spike.carrier === player, state.spike.planted, state.spike.site);
  }

  return {
    state, player, agents, bots, playerWeapon, shootables,
    startMatch, startRound, buy, step, switchWeapon,
    setPhaseMenu() {
      state.phase = 'menu';
      hud.showOverlay('start');
    },
  };
}
