// FOUNDRY YARD: an original industrial depot, not a copy of any commercial map.
// 48 x 40 m. Attackers spawn south, defenders north. Site A is west, Site B east,
// joined by three lanes: west alley, mid yard and east alley. Crates, containers and
// silo walls make the cover; a low platform in mid is jumpable. Bots navigate a
// waypoint graph laid over the same floor the player walks.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { x: -17, z: -10, r: 5 },
  B: { x: 17, z: -10, r: 5 },
};

export const SPAWNS = {
  attackers: [
    { x: -6, z: 17, yaw: 0 }, { x: -2, z: 17.5, yaw: 0 }, { x: 2, z: 17.5, yaw: 0 },
    { x: 6, z: 17, yaw: 0 }, { x: 0, z: 15, yaw: 0 },
  ],
  defenders: [
    { x: -6, z: -17, yaw: Math.PI }, { x: -2, z: -17.5, yaw: Math.PI },
    { x: 2, z: -17.5, yaw: Math.PI }, { x: 6, z: -17, yaw: Math.PI }, { x: 0, z: -15, yaw: Math.PI },
  ],
};

// Waypoint graph: [x, z] nodes and the edges between them (by index).
const NODES = [
  [0, 16], [0, 10], [0, 4], [0, -2], [0, -8], // 0-4 mid spine
  [-16, 10], [-18, 2], [-18, -6], [-12, -10], [-17, -12], // 5-9 west
  [16, 10], [18, 2], [18, -6], [12, -10], [17, -12], // 10-14 east
  [-6, -15], [6, -15], [0, -16], // 15-17 defender side
  [-9, -2], [9, -2], [-8, 6], [8, 6], // 18-21 cross links
  [-17, -15], [17, -15], // 22-23 site backs
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 17],
  [0, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 22], [8, 15],
  [0, 10], [10, 11], [11, 12], [12, 13], [13, 14], [14, 23], [13, 16],
  [15, 17], [16, 17], [15, 22], [16, 23],
  [2, 20], [2, 21], [3, 18], [3, 19], [18, 7], [19, 12],
  [20, 5], [21, 10], [18, 8], [19, 13], [20, 6], [21, 11],
  [4, 8], [4, 13], [9, 15], [14, 16],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const mats = {};
  for (const [name, spec] of Object.entries({
    ground: PALETTE.ground, concrete: PALETTE.concrete, steel: PALETTE.steel,
    rust: PALETTE.rust, hazard: PALETTE.hazard, ink: PALETTE.ink, grass: PALETTE.grass,
  })) {
    mats[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec), roughness: name === 'steel' ? 0.55 : 0.92, metalness: name === 'steel' ? 0.35 : 0.04,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  // Floor and perimeter.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(48.6, 0.4, 40.6), mats.ground);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3().setFromObject(floor));
  box(0.6, 5, 40.6, -24.3, 2.5, 0, 'concrete');
  box(0.6, 5, 40.6, 24.3, 2.5, 0, 'concrete');
  box(48.6, 5, 0.6, 0, 2.5, -20.3, 'concrete');
  box(48.6, 5, 0.6, 0, 2.5, 20.3, 'concrete');

  // Mossy ground patches (flat, non-solid).
  box(10, 0.02, 8, -14, 0.01, 8, 'grass', false);
  box(8, 0.02, 7, 15, 0.01, -2, 'grass', false);
  box(9, 0.02, 6, -4, 0.01, -14, 'grass', false);

  // Site pads: amber floor rings marking A and B.
  for (const site of Object.values(SITES)) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(site.r, 28), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hazard), roughness: 0.8, transparent: true, opacity: 0.22 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(site.x, 0.02, site.z);
    pad.receiveShadow = true;
    group.add(pad);
  }

  // Containers and crates: the cover. Big ones block sightlines, low ones are crouch cover.
  box(6, 2.6, 2.4, -8, 1.3, -6, 'steel');
  box(6, 2.6, 2.4, 8, 1.3, 2, 'rust');
  box(2.4, 2.6, 6, -13, 1.3, 4, 'steel');
  box(2.4, 2.6, 6, 13, 1.3, -4, 'rust');
  box(4.4, 2.6, 2.4, -19, 1.3, -14, 'rust');
  box(4.4, 2.6, 2.4, 19, 1.3, -14, 'steel');
  box(1.2, 1.2, 1.2, -3.4, 0.6, 0, 'rust');
  box(1.2, 1.2, 1.2, 3.4, 0.6, -2, 'rust');
  box(1.2, 1.2, 1.2, -6, 0.6, 8, 'steel');
  box(1.2, 1.2, 1.2, 6, 0.6, 8, 'steel');
  box(1.6, 0.8, 1.6, -14, 0.4, -8, 'rust');
  box(1.6, 0.8, 1.6, 14, 0.4, -8, 'steel');
  box(1.2, 1.1, 3.4, -17, 0.55, -4, 'concrete');
  box(1.2, 1.1, 3.4, 17, 0.55, -4, 'concrete');
  box(2.2, 1.0, 1.2, -4, 0.5, -12, 'rust');
  box(2.2, 1.0, 1.2, 4, 0.5, -12, 'steel');

  // Mid platform, 0.9 m: jumpable, overlooks both sites' approaches.
  box(5, 0.9, 3.4, 0, 0.45, -6, 'concrete');
  box(1.2, 1.0, 1.2, -3.4, 0.5, -6, 'rust');
  box(1.2, 1.0, 1.2, 3.4, 0.5, -6, 'rust');

  // Silo walls: tall cylinders approximated by a box collider each, plus the visual drum.
  for (const [x, z] of [[-21, 6], [21, 6], [-21, -2], [21, -2]]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 5, 14), mats.steel);
    drum.position.set(x, 2.5, z);
    drum.castShadow = true;
    drum.receiveShadow = true;
    group.add(drum);
    const c = new THREE.Box3(new THREE.Vector3(x - 1.6, 0, z - 1.6), new THREE.Vector3(x + 1.6, 5, z + 1.6));
    colliders.push(c);
    shootables.push(drum);
  }

  // Hazard stripes on the two big mid containers (thin amber boxes, non-solid).
  box(6.05, 0.18, 0.05, -8, 2.2, -7.22, 'hazard', false);
  box(6.05, 0.18, 0.05, 8, 2.2, 0.78, 'hazard', false);

  // Site beacons: a thin amber beam over each site so the objective reads at a glance.
  const beacons = [];
  for (const site of Object.values(SITES)) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.7, 9, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.hazard), transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(site.x, 4.5, site.z);
    group.add(beam);
    beacons.push(beam);
  }

  // The spike: a small amber device, hidden until planted.
  const spike = new THREE.Group();
  const spikeBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.42), mats.hazard);
  spikeBody.castShadow = true;
  const spikeLight = new THREE.PointLight(new THREE.Color(PALETTE.hazard), 0, 7);
  spikeLight.position.y = 0.6;
  spike.add(spikeBody, spikeLight);
  spike.position.y = 0.15;
  spike.visible = false;
  scene.add(spike);

  // Light: low dusk sun from the west, cool sky fill, warm site lamps.
  const sky = new THREE.HemisphereLight(new THREE.Color('#9db4c8'), new THREE.Color('#232830'), 1.15);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.8);
  sun.position.set(-18, 22, 10);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  for (const site of Object.values(SITES)) {
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.hazard), 12, 16);
    lamp.position.set(site.x, 4.2, site.z);
    scene.add(lamp);
  }

  const waypoints = NODES.map(([x, z]) => ({ x, z }));
  const adjacency = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return {
    colliders, shootables, waypoints, adjacency, spike, spikeLight, beacons,
    // BFS over the graph; returns a list of node indices from start to goal.
    findPath(start, goal, out = []) {
      out.length = 0;
      if (start === goal) { out.push(goal); return out; }
      const prev = new Int16Array(NODES.length).fill(-1);
      const queue = [start];
      prev[start] = start;
      for (let head = 0; head < queue.length; head += 1) {
        const node = queue[head];
        if (node === goal) break;
        for (const next of adjacency[node]) {
          if (prev[next] === -1) { prev[next] = node; queue.push(next); }
        }
      }
      if (prev[goal] === -1) { out.push(goal); return out; }
      let node = goal;
      while (node !== start) { out.push(node); node = prev[node]; }
      out.reverse();
      return out;
    },
    nearestNode(x, z) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < NODES.length; i += 1) {
        const dx = NODES[i][0] - x;
        const dz = NODES[i][1] - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    },
  };
}
