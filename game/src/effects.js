// Transient combat visuals: tracers, impact sparks and the spike explosion.
// Everything is pooled and reused; nothing is allocated per shot in the hot loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const SPARKS = 12;

export function createEffects(scene) {
  const tracerGeo = new THREE.BufferGeometry();
  const tracerPos = new Float32Array(TRACERS * 2 * 3);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracerMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(PALETTE.hazard), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
  });
  const tracerLines = new THREE.LineSegments(tracerGeo, tracerMat);
  tracerLines.frustumCulled = false;
  scene.add(tracerLines);
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) tracers.push({ life: 0, a: new THREE.Vector3(), b: new THREE.Vector3() });

  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARKS * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.hazard), size: 0.09, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  const spark = { life: 0, origin: new THREE.Vector3(), vel: [] };
  for (let i = 0; i < SPARKS; i += 1) spark.vel.push(new THREE.Vector3());

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.hazard), transparent: true, opacity: 0, depthWrite: false }),
  );
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.hazard), 0, 30);
  scene.add(boomLight);
  const boomState = { life: 0 };

  const tmp = new THREE.Vector3();

  function fireTracer(from, to) {
    let slot = tracers.find((t) => t.life <= 0) ?? tracers[0];
    slot.a.copy(from);
    slot.b.copy(to);
    slot.life = 0.09;
  }

  function impact(point, normal) {
    spark.life = 0.22;
    spark.origin.copy(point);
    for (let i = 0; i < SPARKS; i += 1) {
      tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 3);
      tmp.add(normal);
      spark.vel[i].copy(tmp);
    }
  }

  function explode(point) {
    boom.position.copy(point);
    boomLight.position.copy(point).y += 1;
    boomState.life = 0.7;
  }

  function step(dt) {
    for (let i = 0; i < TRACERS; i += 1) {
      const t = tracers[i];
      if (t.life > 0) t.life -= dt;
      const o = i * 6;
      if (t.life > 0) {
        tracerPos[o] = t.a.x; tracerPos[o + 1] = t.a.y; tracerPos[o + 2] = t.a.z;
        tracerPos[o + 3] = t.b.x; tracerPos[o + 4] = t.b.y; tracerPos[o + 5] = t.b.z;
      } else {
        tracerPos[o + 3] = tracerPos[o]; tracerPos[o + 4] = tracerPos[o + 1]; tracerPos[o + 5] = tracerPos[o + 2];
      }
    }
    tracerGeo.attributes.position.needsUpdate = true;
    if (spark.life > 0) {
      spark.life -= dt;
      for (let i = 0; i < SPARKS; i += 1) {
        sparkPos[i * 3] = spark.origin.x + spark.vel[i].x * (0.22 - spark.life);
        sparkPos[i * 3 + 1] = spark.origin.y + spark.vel[i].y * (0.22 - spark.life) - (0.22 - spark.life) ** 2 * 4;
        sparkPos[i * 3 + 2] = spark.origin.z + spark.vel[i].z * (0.22 - spark.life);
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkMat.opacity = Math.max(0, spark.life / 0.22);
    } else {
      sparkMat.opacity = 0;
    }
    if (boomState.life > 0) {
      boomState.life -= dt;
      const t = 1 - Math.max(0, boomState.life) / 0.7;
      const r = 0.5 + t * 9;
      boom.scale.setScalar(r);
      boom.material.opacity = Math.max(0, 0.55 * (1 - t));
      boomLight.intensity = Math.max(0, 60 * (1 - t));
    } else {
      boom.material.opacity = 0;
      boomLight.intensity = 0;
    }
  }

  return { fireTracer, impact, explode, step };
}
