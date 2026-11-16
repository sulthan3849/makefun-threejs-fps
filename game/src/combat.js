// Shooting and explosions: one raycast resolves a shot against the world and every
// agent's body and head. Damage falls off with range, headshots multiply, armour
// absorbs half of what remains. Grenades fly, bounce, then burst in a radius.
import * as THREE from 'three';
import { sfx } from './audio.js';

const GRAVITY = 14;
const raycaster = new THREE.Raycaster();
const tmpDir = new THREE.Vector3();
const tmpTo = new THREE.Vector3();
const tmpOrigin = new THREE.Vector3();

export function createCombat(scene, world, effects) {
  const grenades = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2e343b, roughness: 0.5, metalness: 0.6 });

  function losBlocked(from, to) {
    tmpDir.copy(to).sub(from);
    const dist = tmpDir.length();
    if (dist < 0.01) return false;
    tmpDir.multiplyScalar(1 / dist);
    raycaster.set(from, tmpDir);
    raycaster.far = dist;
    return raycaster.intersectObjects(world.shootables, false).length > 0;
  }

  // agents: every alive agent. shootables: world meshes plus each agent's hit meshes.
  // Returns the hit record, or null. onDamage(target, amount, part, attacker) is the
  // game's damage hook (kill feed, death, sounds).
  function fireShot(shooter, origin, dir, def, shootables, agents, onDamage) {
    raycaster.set(origin, dir);
    raycaster.far = def.range;
    const hits = raycaster.intersectObjects(shootables, false);
    // The ray starts inside the shooter's own head mesh, and may cross a teammate
    // or a corpse: skip every hit on the shooter, on the shooter's own team, or on
    // a fighter who is already down.
    let hit = null;
    for (const candidate of hits) {
      const owner = candidate.object.userData.agent;
      if (owner && (owner === shooter || owner.team === shooter.team || !owner.alive)) continue;
      hit = candidate;
      break;
    }
    if (!hit) return null;
    const point = hit.point;
    const obj = hit.object;
    if (obj.userData.agent) {
      const target = obj.userData.agent;
      const dist = origin.distanceTo(point);
      const falloff = Math.max(0.55, 1 - (dist / def.range) * 0.45);
      const part = obj.userData.part;
      const amount = def.damage * (part === 'head' ? def.headMult : 1) * falloff;
      onDamage(target, amount, part, shooter);
      return { point, agent: target, part, blocked: false };
    }
    return { point, blocked: true };
  }

  function applyDamage(target, amount, onDeath) {
    let rest = amount;
    if (target.armor > 0) {
      const absorbed = Math.min(target.armor, rest * 0.5);
      target.armor -= absorbed;
      rest -= absorbed;
    }
    target.hp -= rest;
    if (target.hp <= 0 && target.alive) {
      target.hp = 0;
      target.alive = false;
      onDeath(target);
      return true;
    }
    return false;
  }

  function throwGrenade(owner, origin, dir) {
    const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    scene.add(mesh);
    grenades.push({
      mesh,
      pos: mesh.position,
      vel: new THREE.Vector3().copy(dir).multiplyScalar(17).add(new THREE.Vector3(0, 4.5, 0)),
      fuse: 1.6,
      owner,
      bounced: false,
    });
    sfx.grenadePin();
  }

  const probe = new THREE.Box3();
  function stepGrenades(dt, agents, onDamage) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.fuse -= dt;
      g.vel.y -= GRAVITY * dt;
      g.pos.addScaledVector(g.vel, dt);
      // Cheap bounce: test the next position against world colliders as a small box.
      probe.min.set(g.pos.x - 0.1, g.pos.y - 0.1, g.pos.z - 0.1);
      probe.max.set(g.pos.x + 0.1, g.pos.y + 0.1, g.pos.z + 0.1);
      for (const c of world.colliders) {
        if (!probe.intersectsBox(c)) continue;
        const cx = (c.min.x + c.max.x) / 2;
        const cz = (c.min.z + c.max.z) / 2;
        if (g.pos.y < c.max.y && g.pos.y > c.min.y) {
          if (Math.abs(g.pos.x - cx) > Math.abs(g.pos.z - cz)) g.vel.x *= -0.45;
          else g.vel.z *= -0.45;
        } else {
          g.vel.y = Math.abs(g.vel.y) * 0.45;
          g.pos.y = c.max.y + 0.1;
        }
        if (!g.bounced) { sfx.bounce(); g.bounced = true; }
        break;
      }
      if (g.pos.y < 0.1) { g.pos.y = 0.1; g.vel.y = Math.abs(g.vel.y) * 0.45; }
      if (g.fuse <= 0) {
        effects.explode(g.pos);
        sfx.explosion();
        for (const agent of agents) {
          if (!agent.alive) continue;
          tmpTo.set(agent.body.state.position.x, agent.body.state.position.y + 1, agent.body.state.position.z);
          const d = tmpTo.distanceTo(g.pos);
          if (d > 6) continue;
          tmpOrigin.copy(g.pos);
          const blocked = losBlocked(tmpOrigin, tmpTo);
          const amount = 120 * (1 - d / 6) * (blocked ? 0.35 : 1);
          if (amount > 5) onDamage(agent, amount, 'blast', g.owner);
        }
        scene.remove(g.mesh);
        grenades.splice(i, 1);
      }
    }
  }

  return { fireShot, applyDamage, losBlocked, throwGrenade, stepGrenades, grenades };
}
