// Bot squadmates and opponents. One agent shape for every fighter; the player is
// the same shape with isPlayer set and no mesh. A bot thinks in states — route,
// hold, engage, plant, defuse, investigate — and sees, hears and shoots with the
// same raycast the player does, so its kills are honest.
import * as THREE from 'three';
import { createBody } from './player.js';
import { WEAPONS } from './weapons.js';
import { PALETTE } from './palette.js';

const ALLY_NAMES = ['Vex', 'Mara', 'Juno', 'Kip'];
const ENEMY_NAMES = ['Rook', 'Sable', 'Fang', 'Holt', 'Nyx'];

function buildMesh(scene, team) {
  const color = team === 'atk' ? PALETTE.ally : PALETTE.enemy;
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.8, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#22262c'), roughness: 0.7, metalness: 0.2 });
  const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.95, 10), cloth);
  bodyMesh.position.y = 0.95;
  bodyMesh.castShadow = true;
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), dark);
  headMesh.position.y = 1.58;
  headMesh.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: 0.8 }));
  visor.position.set(0, 1.6, -0.19);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.18, 1.2, -0.3);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.24), dark);
  legs.position.y = 0.25;
  group.add(bodyMesh, headMesh, visor, gun, legs);
  scene.add(group);
  return { group, bodyMesh, headMesh, gun };
}

export function createBot(scene, world, team, index, spawn, random) {
  const names = team === 'atk' ? ALLY_NAMES : ENEMY_NAMES;
  const mesh = buildMesh(scene, team);
  const body = createBody(world.colliders, spawn, { walkSpeed: 4.1 + random() * 0.5, yaw: spawn.yaw });
  const defId = index % 3 === 0 ? 'smg' : 'rifle';
  const agent = {
    id: `${team}-${index}`,
    name: names[index % names.length],
    team,
    isPlayer: false,
    alive: true,
    hp: 100,
    armor: 0,
    body,
    mesh,
    weapon: { defId, def: WEAPONS[defId], mag: WEAPONS[defId].mag, cooldown: 0, reloadLeft: 0 },
    kills: 0,
    deaths: 0,
    ai: {
      state: 'route',
      path: [],
      pathIdx: 0,
      goalNode: -1,
      assignedSite: team === 'atk' ? (index < 2 ? 'A' : 'B') : (index < 2 ? 'A' : index < 4 ? 'B' : null),
      holdNode: -1,
      isCarrier: false,
      target: null,
      lastSeen: null,
      lastSeenAt: -99,
      reactAt: 0,
      burstLeft: 0,
      burstTimer: 0,
      pauseTimer: 0,
      strafeDir: 1,
      strafeTimer: 0,
      scanPhase: random() * 6,
      channel: 0,
      channelKind: null,
      investigate: null,
      skill: 0.75 + random() * 0.5, // higher = faster reactions, tighter aim
    },
  };
  mesh.bodyMesh.userData = { agent, part: 'body' };
  mesh.headMesh.userData = { agent, part: 'head' };
  return agent;
}

const eye = new THREE.Vector3();
const targetEye = new THREE.Vector3();
const dir = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const toPoint = new THREE.Vector3();

function eyeOf(agent, out) {
  const p = agent.body.state.position;
  out.set(p.x, p.y + agent.body.state.eye, p.z);
  return out;
}

function angleTo(agent, x, z) {
  const p = agent.body.state.position;
  return Math.atan2(-(x - p.x), -(z - p.z));
}

function turnToward(agent, targetYaw, dt, rate = 5) {
  let diff = targetYaw - agent.body.state.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  agent.body.state.yaw += step;
  return Math.abs(diff) < 0.12;
}

// Visible enemy check: range, a wide front cone (or very close), and a clear ray.
function findTarget(agent, agents, combat, now) {
  let best = null;
  let bestD = Infinity;
  eyeOf(agent, eye);
  for (const other of agents) {
    if (!other.alive || other.team === agent.team || other === agent) continue;
    const p = other.body.state.position;
    const dx = p.x - eye.x;
    const dz = p.z - eye.z;
    const d = Math.hypot(dx, dz);
    if (d > 55 || d >= bestD) continue;
    const facing = Math.atan2(-dx, -dz);
    let diff = facing - agent.body.state.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 1.15 && d > 7) continue;
    targetEye.set(p.x, p.y + 1.25, p.z);
    if (combat.losBlocked(eye, targetEye)) continue;
    best = other;
    bestD = d;
  }
  return best;
}

export function stepBot(agent, dt, now, ctx) {
  const { world, combat, agents, game, random, shootables } = ctx;
  const ai = agent.ai;
  const st = agent.body.state;
  const w = agent.weapon;
  w.cooldown = Math.max(0, w.cooldown - dt);
  if (w.reloadLeft > 0) {
    w.reloadLeft -= dt;
    if (w.reloadLeft <= 0) w.mag = w.def.mag;
  }

  // Vision, refreshed every step while alive.
  const seen = findTarget(agent, agents, combat, now);
  if (seen) {
    ai.target = seen;
    const p = seen.body.state.position;
    ai.lastSeen = { x: p.x, z: p.z };
    ai.lastSeenAt = now;
    if (ai.state !== 'engage') {
      ai.state = 'engage';
      ai.reactAt = now + (0.85 - ai.skill * 0.45) + random() * 0.25;
      ai.burstLeft = 0;
      ai.pauseTimer = 0;
    }
  }

  // Hearing: a recent enemy shot nearby pulls the bot to investigate.
  if (!seen && ctx.recentShots) {
    for (const shot of ctx.recentShots) {
      if (shot.team === agent.team || now - shot.at > 1.6) continue;
      const d = Math.hypot(shot.x - st.position.x, shot.z - st.position.z);
      if (d < 26 && (!ai.investigate || now - ai.investigate.at > 2)) {
        ai.investigate = { x: shot.x, z: shot.z, at: now };
        if (ai.state === 'hold' || ai.state === 'route') ai.state = 'investigate';
      }
    }
  }

  const move = { forward: 0, strafe: 0, crouch: false, jump: false };

  if (ai.state === 'engage') {
    const target = ai.target;
    const lost = !target || !target.alive || now - ai.lastSeenAt > 2.5;
    if (lost) {
      ai.target = null;
      ai.state = ai.lastSeen ? 'investigate' : 'route';
      ai.investigate = ai.lastSeen ? { x: ai.lastSeen.x, z: ai.lastSeen.z, at: now } : null;
    } else {
      const tp = target.body.state.position;
      const aimYaw = angleTo(agent, tp.x, tp.z);
      turnToward(agent, aimYaw, dt, 6);
      ai.strafeTimer -= dt;
      if (ai.strafeTimer <= 0) {
        ai.strafeDir = random() < 0.5 ? -1 : 1;
        ai.strafeTimer = 0.7 + random() * 0.8;
      }
      move.strafe = ai.strafeDir * 0.7;
      const dist = Math.hypot(tp.x - st.position.x, tp.z - st.position.z);
      if (dist < 4) move.forward = -0.5;
      else if (dist > 22) move.forward = 0.4;
      // Burst fire once the reaction time has passed.
      if (now >= ai.reactAt && w.reloadLeft <= 0) {
        if (ai.burstLeft > 0) {
          ai.burstTimer -= dt;
          if (ai.burstTimer <= 0 && w.cooldown <= 0 && w.mag > 0) {
            ai.burstLeft -= 1;
            ai.burstTimer = w.def.gap;
            w.mag -= 1;
            w.cooldown = w.def.gap;
            botShoot(agent, target, ctx);
            if (w.mag === 0) w.reloadLeft = 1.9;
          }
        } else {
          ai.pauseTimer -= dt;
          if (ai.pauseTimer <= 0) {
            ai.burstLeft = 3 + Math.floor(random() * 3);
            ai.pauseTimer = 0.55 + random() * 0.5;
          }
        }
      }
    }
  } else if (ai.state === 'plant') {
    // Carrier channels the plant; any damage or enemy sight breaks it.
    if (seen) { ai.state = 'engage'; }
    else {
      ai.channel += dt;
      if (ai.channel >= 3.5) {
        ai.channel = 0;
        ai.state = 'hold';
        ctx.onPlant(agent);
      }
    }
  } else if (ai.state === 'defuse') {
    if (seen) { ai.state = 'engage'; }
    else {
      ai.channel += dt;
      if (ai.channel >= 5) {
        ai.channel = 0;
        ai.state = 'hold';
        ctx.onDefuse(agent);
      }
    }
  } else {
    // route / hold / investigate: pick a destination and walk the graph.
    let dest = null;
    if (ai.state === 'investigate' && ai.investigate) dest = ai.investigate;
    else if (ai.state === 'route' || ai.state === 'hold') {
      dest = routeDestination(agent, game, world);
    }
    if (dest) {
      const goalNode = world.nearestNode(dest.x, dest.z);
      if (ai.goalNode !== goalNode || ai.pathIdx >= ai.path.length) {
        ai.goalNode = goalNode;
        ai.path = world.findPath(world.nearestNode(st.position.x, st.position.z), goalNode);
        ai.pathIdx = 0;
      }
      const node = ai.path[ai.pathIdx];
      if (node !== undefined) {
        const wp = world.waypoints[node];
        const d = Math.hypot(wp.x - st.position.x, wp.z - st.position.z);
        if (d < 1.1) ai.pathIdx += 1;
        else {
          const yaw = angleTo(agent, wp.x, wp.z);
          if (turnToward(agent, yaw, dt, 4.5)) move.forward = 1;
          else move.forward = 0.25;
        }
      }
      // Arrived at the objective: plant, defuse or hold.
      const arrived = Math.hypot(dest.x - st.position.x, dest.z - st.position.z) < 1.6;
      if (arrived) {
        if (agent.team === 'atk' && ai.isCarrier && game.phase === 'live' && !game.spike.planted) {
          ai.state = 'plant';
          ai.channel = 0;
        } else if (agent.team === 'def' && game.spike.planted) {
          ai.state = 'defuse';
          ai.channel = 0;
        } else {
          ai.state = 'hold';
          ai.holdNode = ai.goalNode;
        }
      }
    }
    if (ai.state === 'hold') {
      // Scan the lane: slow yaw sweep.
      ai.scanPhase += dt * 0.55;
      agent.body.state.yaw += Math.sin(ai.scanPhase) * dt * 0.35;
      // Defenders rotate to a planted spike; attackers gather at the site.
      if (game.spike.planted && agent.team === 'def') {
        ai.state = 'route';
        ai.goalNode = -1;
      }
    }
  }

  agent.body.step(dt, move);
  // Sync the mesh to the body, and keep its matrices fresh: the simulation
  // raycasts against these meshes and must not depend on the render loop.
  agent.mesh.group.position.set(st.position.x, st.position.y, st.position.z);
  agent.mesh.group.rotation.y = st.yaw;
  agent.mesh.group.position.y += Math.abs(Math.sin(now * 9)) * 0.02 * (move.forward || move.strafe ? 1 : 0);
  agent.mesh.group.updateMatrixWorld(true);
}

function routeDestination(agent, game, world) {
  const ai = agent.ai;
  if (game.phase !== 'live') {
    // Buy phase: walk out of spawn toward mid.
    return { x: agent.team === 'atk' ? 0 : 0, z: agent.team === 'atk' ? 10 : -10 };
  }
  if (game.spike.planted) {
    if (agent.team === 'def') return { x: game.spike.x, z: game.spike.z };
    // Attackers hold the planted site.
    return { x: game.spike.x + (agent.id.charCodeAt(4) % 5) - 2, z: game.spike.z + 3 };
  }
  if (agent.team === 'atk') {
    const site = game.sites[ai.assignedSite];
    return { x: site.x, z: site.z };
  }
  // Defenders: hold their site, or mid if unassigned.
  if (ai.assignedSite) {
    const site = game.sites[ai.assignedSite];
    return { x: site.x + (agent.id.charCodeAt(4) % 3) - 1, z: site.z + 4 };
  }
  return { x: 0, z: -4 };
}

function botShoot(agent, target, ctx) {
  const { combat, effects, random, shootables } = ctx;
  const w = agent.weapon;
  eyeOf(agent, eye);
  const tp = target.body.state.position;
  const targetSpeed = Math.hypot(target.body.state.velocity.x, target.body.state.velocity.z);
  const ownSpeed = agent.body.groundSpeed();
  const dist = Math.hypot(tp.x - eye.x, tp.z - eye.z);
  // Aim at the chest, sometimes the head, with error that grows with distance and speed.
  const aimY = tp.y + (random() < 0.18 ? 1.55 : 1.15);
  targetEye.set(tp.x, aimY, tp.z);
  dir.copy(targetEye).sub(eye).normalize();
  const err = (0.026 + dist * 0.0009 + targetSpeed * 0.004 + ownSpeed * 0.005) / agent.ai.skill;
  dir.x += (random() * 2 - 1) * err;
  dir.y += (random() * 2 - 1) * err;
  dir.z += (random() * 2 - 1) * err;
  dir.normalize();
  muzzle.copy(eye).addScaledVector(dir, 0.6);
  const hit = combat.fireShot(agent, eye, dir, w.def, shootables, ctx.agents, ctx.onDamage);
  const end = hit ? hit.point : toPoint.copy(eye).addScaledVector(dir, w.def.range);
  effects.fireTracer(muzzle, end);
  if (hit && hit.blocked) effects.impact(hit.point, new THREE.Vector3(0, 1, 0));
  const d = Math.hypot(agent.body.state.position.x - ctx.playerPos.x, agent.body.state.position.z - ctx.playerPos.z);
  ctx.sfxShot(w.def.kind, Math.min(1, d / 45));
  ctx.recentShots.push({ x: eye.x, z: eye.z, team: agent.team, at: ctx.now });
}
