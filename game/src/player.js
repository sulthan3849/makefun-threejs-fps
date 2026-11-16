// A walking body: acceleration, friction, gravity, crouch and jump, resolved as a
// box against the world's colliders one axis at a time, so a wall never swallows it.
// One factory serves the player and every bot; only the tuning differs.
import * as THREE from 'three';

const RADIUS = 0.34;

export function createBody(colliders, spawn, opts = {}) {
  const standHeight = opts.standHeight ?? 1.72;
  const crouchHeight = opts.crouchHeight ?? 1.12;
  const body = {
    position: new THREE.Vector3(spawn.x, 0, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: opts.yaw ?? 0,
    pitch: 0,
    eye: opts.standEye ?? 1.6,
    onGround: true,
    crouching: false,
    height: standHeight,
    walkSpeed: opts.walkSpeed ?? 5.2,
    crouchSpeed: opts.crouchSpeed ?? 2.4,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  // lift keeps the feet and the crown out of the horizontal tests, so standing on the
  // floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  // move: {forward, strafe} in -1..1, crouch and jump booleans. Fixed-step only.
  function step(dt, move) {
    const crouching = !!move.crouch;
    if (crouching && !body.crouching) {
      body.crouching = true;
      body.height = crouchHeight;
    } else if (!crouching && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, standHeight, 0.02)) {
      body.crouching = false;
      body.height = standHeight;
    }
    const eyeTarget = body.crouching ? (opts.crouchEye ?? 1.02) : (opts.standEye ?? 1.6);
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    wish.set(0, 0, 0);
    if (move.forward || move.strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * move.forward + cos * move.strafe, 0, -cos * move.forward - sin * move.strafe).normalize();
    }

    const speed = body.crouching ? body.crouchSpeed : body.walkSpeed;
    const accel = body.onGround ? 42 : 9;
    const blend = Math.min(1, (accel * dt) / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - 9 * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (move.jump && body.onGround) {
      body.velocity.y = 6.2;
      body.onGround = false;
    }
    body.velocity.y -= 20 * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    if (body.velocity.y < -30) body.velocity.y = -30;
  }

  return {
    state: body,
    step,
    look,
    recoil,
    overlaps,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
    teleport(x, z, yaw) {
      body.position.set(x, 0, z);
      body.velocity.set(0, 0, 0);
      if (yaw !== undefined) body.yaw = yaw;
      body.pitch = 0;
    },
  };
}
