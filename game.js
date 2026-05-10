import * as THREE from "./vendor/three.module.js";

const canvas = document.querySelector("#game");
const scoreEl = document.querySelector("#score");
const livesEl = document.querySelector("#lives");
const bestEl = document.querySelector("#best");
const overlay = document.querySelector("#overlay");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayText = document.querySelector("#overlayText");
const startButton = document.querySelector("#startButton");
const pauseButton = document.querySelector("#pauseButton");
const pauseIcon = document.querySelector("#pauseIcon");
const touchPad = document.querySelector("#touchPad");
const touchStick = document.querySelector("#touchStick");

const keys = new Set();
const pointer = { active: false, id: null, x: 0, y: 0 };
const input = { x: 0, z: 0 };

const state = {
  width: 0,
  height: 0,
  aspect: 1,
  worldWidth: 220,
  worldDepth: 280,
  running: false,
  paused: false,
  gameOver: false,
  lastTime: 0,
  score: 0,
  best: Number(localStorage.getItem("harbor-run-best") || 0),
  lives: 3,
  waveTime: 0,
  packageTimer: 0,
  pirateTimer: 0,
  boat: null,
  packages: [],
  pirates: [],
  splashes: [],
  islands: [],
};

const boatRadius = 3.1;
const packageRadius = 2.4;
const pirateRadius = 3.2;
const maxSpeed = 42;
const acceleration = 88;
const drag = 0.92;
const pirateAcceleration = 13.5;
const pirateTurnRate = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7fcbe2);
scene.fog = new THREE.Fog(0x7fcbe2, 150, 420);

const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 520);
camera.position.set(0, 72, 78);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const root = new THREE.Group();
const packageRoot = new THREE.Group();
const pirateRoot = new THREE.Group();
const splashRoot = new THREE.Group();
const islandRoot = new THREE.Group();
const waveRoot = new THREE.Group();
scene.add(root, packageRoot, pirateRoot, splashRoot, islandRoot, waveRoot);

const materials = {
  water: new THREE.MeshPhongMaterial({ color: 0x087c8e, shininess: 70, specular: 0x9fe8ff }),
  sand: new THREE.MeshStandardMaterial({ color: 0xd9b768, roughness: 0.78 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x4fac6f, roughness: 0.7 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x7b4f2b, roughness: 0.72 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x2f9d68, roughness: 0.65 }),
  hull: new THREE.MeshStandardMaterial({ color: 0x8b4a2f, roughness: 0.5 }),
  deck: new THREE.MeshStandardMaterial({ color: 0xc99663, roughness: 0.68 }),
  cabin: new THREE.MeshStandardMaterial({ color: 0xe8dfc9, roughness: 0.52 }),
  rigging: new THREE.LineBasicMaterial({ color: 0x2d2019, transparent: true, opacity: 0.7 }),
  pirateHull: new THREE.MeshStandardMaterial({ color: 0x22252c, roughness: 0.48 }),
  sail: new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.55, side: THREE.DoubleSide }),
  goldSail: new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5, side: THREE.DoubleSide }),
  pirateSail: new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.55, side: THREE.DoubleSide }),
  red: new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.5 }),
  crate: new THREE.MeshStandardMaterial({ color: 0xb67337, roughness: 0.62 }),
  strap: new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.45 }),
  wake: new THREE.MeshBasicMaterial({ color: 0xdbf6ff, transparent: true, opacity: 0.58 }),
  foam: new THREE.LineBasicMaterial({ color: 0xd7f7ff, transparent: true, opacity: 0.35 }),
};

const waterGeometry = new THREE.PlaneGeometry(1, 1, 140, 140);
const water = new THREE.Mesh(waterGeometry, materials.water);
const waterPositions = waterGeometry.attributes.position;
const waterBase = Array.from({ length: waterPositions.count }, (_, index) => ({
  x: waterPositions.getX(index),
  y: waterPositions.getY(index),
}));
water.rotation.x = -Math.PI / 2;
water.receiveShadow = true;
root.add(water);

const hemi = new THREE.HemisphereLight(0xb8f0ff, 0x1f5060, 2.3);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 3.2);
sun.position.set(-36, 70, 28);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 260;
sun.shadow.camera.left = -150;
sun.shadow.camera.right = 150;
sun.shadow.camera.top = 150;
sun.shadow.camera.bottom = -150;
scene.add(sun);
scene.add(sun.target);

const cameraFocus = new THREE.Vector3();
cameraFocus.set(0, 1.8, -7);
camera.lookAt(cameraFocus);
const desiredCameraPosition = new THREE.Vector3();
const desiredCameraLookAt = new THREE.Vector3();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function bounds(padding = 0) {
  return {
    minX: -state.worldWidth / 2 + padding,
    maxX: state.worldWidth / 2 - padding,
    minZ: -state.worldDepth / 2 + padding,
    maxZ: state.worldDepth / 2 - padding,
  };
}

function islandRadii(island, padding = 0) {
  return {
    x: island.rx + padding,
    z: island.rz + padding,
  };
}

function islandOverlap(entity, island, padding = 0) {
  const radii = islandRadii(island, padding);
  const dx = entity.x - island.x;
  const dz = entity.z - island.z;
  return (dx * dx) / (radii.x * radii.x) + (dz * dz) / (radii.z * radii.z);
}

function isOnIsland(entity, padding = 0) {
  return state.islands.some((island) => islandOverlap(entity, island, padding) < 1);
}

function isIslandPoint(x, z, padding = 0) {
  return state.islands.some((island) => islandOverlap({ x, z }, island, padding) < 1);
}

function resolveIslandCollisions(entity, padding, bounce = 0.25) {
  for (const island of state.islands) {
    const radii = islandRadii(island, padding);
    const dx = entity.x - island.x || 0.001;
    const dz = entity.z - island.z || 0.001;
    const overlap = (dx * dx) / (radii.x * radii.x) + (dz * dz) / (radii.z * radii.z);

    if (overlap < 1) {
      const scale = 1 / Math.sqrt(overlap);
      const targetX = island.x + dx * scale;
      const targetZ = island.z + dz * scale;
      const pushX = targetX - entity.x;
      const pushZ = targetZ - entity.z;
      const pushLength = Math.hypot(pushX, pushZ) || 1;
      const normalX = pushX / pushLength;
      const normalZ = pushZ / pushLength;
      const intoLand = entity.vx * normalX + entity.vz * normalZ;

      entity.x = targetX;
      entity.z = targetZ;

      if (intoLand < 0) {
        entity.vx -= intoLand * normalX * (1 + bounce);
        entity.vz -= intoLand * normalZ * (1 + bounce);
      }
    }
  }
}

function resize() {
  state.width = window.innerWidth;
  state.height = window.innerHeight;
  state.aspect = state.width / state.height;
  state.worldDepth = 280;
  state.worldWidth = clamp(state.worldDepth * state.aspect, 190, 390);

  renderer.setSize(state.width, state.height, false);
  camera.aspect = state.aspect;
  camera.updateProjectionMatrix();

  water.scale.set(state.worldWidth + 240, state.worldDepth + 240, 1);
  makeScenery();

  if (state.boat) {
    const b = bounds(boatRadius);
    state.boat.x = clamp(state.boat.x, b.minX, b.maxX);
    state.boat.z = clamp(state.boat.z, b.minZ, b.maxZ);
  }
}

function makeScenery() {
  islandRoot.clear();
  waveRoot.clear();
  state.islands = [
    { x: -state.worldWidth * 0.34, z: state.worldDepth * 0.28, rx: 17, rz: 8.6, palms: 3 },
    { x: state.worldWidth * 0.34, z: -state.worldDepth * 0.3, rx: 15, rz: 7.4, palms: 2 },
    { x: -state.worldWidth * 0.22, z: -state.worldDepth * 0.18, rx: 12, rz: 6.3, palms: 2 },
    { x: state.worldWidth * 0.18, z: state.worldDepth * 0.34, rx: 20, rz: 9.2, palms: 4 },
    { x: state.worldWidth * 0.42, z: state.worldDepth * 0.08, rx: 10, rz: 5.2, palms: 1 },
    { x: -state.worldWidth * 0.45, z: -state.worldDepth * 0.42, rx: 13, rz: 6.8, palms: 2 },
    { x: state.worldWidth * 0.05, z: -state.worldDepth * 0.44, rx: 18, rz: 8.4, palms: 3 },
    { x: state.worldWidth * 0.44, z: state.worldDepth * 0.42, rx: 14, rz: 7.2, palms: 2 },
    { x: -state.worldWidth * 0.08, z: state.worldDepth * 0.12, rx: 9, rz: 4.8, palms: 1 },
    { x: state.worldWidth * 0.28, z: -state.worldDepth * 0.02, rx: 11, rz: 5.7, palms: 2 },
  ];

  for (const island of state.islands) {
    islandRoot.add(createIsland(island));
  }

  for (let z = -state.worldDepth / 2 - 32; z <= state.worldDepth / 2 + 32; z += 11) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-state.worldWidth / 2 - 42, 0.18, z),
      new THREE.Vector3(-state.worldWidth / 6, 0.18, z + random(-3, 3)),
      new THREE.Vector3(state.worldWidth / 6, 0.18, z + random(-3, 3)),
      new THREE.Vector3(state.worldWidth / 2 + 42, 0.18, z),
    ]);
    addFoamWave(curve);
  }
}

function addFoamWave(curve) {
  let segment = [];
  for (const point of curve.getPoints(80)) {
    if (isIslandPoint(point.x, point.z, 5.5)) {
      addFoamSegment(segment);
      segment = [];
    } else {
      segment.push(point);
    }
  }
  addFoamSegment(segment);
}

function addFoamSegment(points) {
  if (points.length < 4) return;
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    materials.foam.clone(),
  );
  waveRoot.add(line);
}

function createIsland(island) {
  const group = new THREE.Group();
  group.position.set(island.x, 0.05, island.z);

  const sand = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.2, 48), materials.sand);
  sand.scale.set(island.rx, 1, island.rz);
  sand.castShadow = true;
  sand.receiveShadow = true;
  group.add(sand);

  const grass = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32), materials.grass);
  grass.position.set(2.5, 0.7, -1);
  grass.scale.set(island.rx * 0.48, 0.8, island.rz * 0.45);
  grass.castShadow = true;
  grass.receiveShadow = true;
  group.add(grass);

  for (let i = 0; i < island.palms; i += 1) {
    const palm = createPalm();
    palm.position.set(-5 + i * 5, 1.1, -1 + Math.sin(i) * 2);
    palm.rotation.y = i * 0.8;
    group.add(palm);
  }

  return group;
}

function createPalm() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.65, 7.5, 8), materials.trunk);
  trunk.position.y = 3.4;
  trunk.rotation.z = -0.18;
  trunk.castShadow = true;
  group.add(trunk);

  for (let i = 0; i < 5; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6.6, 8), materials.leaf);
    leaf.position.set(Math.cos(i * 1.26) * 1.5, 7.1, Math.sin(i * 1.26) * 1.5);
    leaf.rotation.z = Math.PI / 2;
    leaf.rotation.y = i * 1.26;
    leaf.castShadow = true;
    group.add(leaf);
  }
  return group;
}

function createHullGeometry() {
  const stations = [
    { z: -4.6, w: 0.2, deck: 0.08, chine: -0.46, keel: -0.68 },
    { z: -3.4, w: 1.15, deck: 0.2, chine: -0.66, keel: -1.05 },
    { z: -1.3, w: 1.85, deck: 0.28, chine: -0.78, keel: -1.28 },
    { z: 1.5, w: 1.72, deck: 0.24, chine: -0.76, keel: -1.18 },
    { z: 3.8, w: 0.9, deck: 0.12, chine: -0.54, keel: -0.78 },
    { z: 5.0, w: 0.08, deck: 0.04, chine: -0.26, keel: -0.36 },
  ];
  const vertices = [];
  const indices = [];

  for (const station of stations) {
    vertices.push(
      -station.w, station.deck, station.z,
      station.w, station.deck, station.z,
      -station.w * 0.82, station.chine, station.z,
      station.w * 0.82, station.chine, station.z,
      0, station.keel, station.z,
    );
  }

  for (let i = 0; i < stations.length - 1; i += 1) {
    const a = i * 5;
    const b = (i + 1) * 5;
    indices.push(
      a, b, a + 1, a + 1, b, b + 1,
      a, a + 2, b, b, a + 2, b + 2,
      a + 1, b + 1, a + 3, a + 3, b + 1, b + 3,
      a + 2, a + 4, b + 2, b + 2, a + 4, b + 4,
      a + 4, a + 3, b + 4, b + 4, a + 3, b + 3,
    );
  }

  indices.push(0, 1, 2, 1, 3, 2, 2, 3, 4);
  const end = (stations.length - 1) * 5;
  indices.push(end, end + 2, end + 1, end + 1, end + 2, end + 3, end + 2, end + 4, end + 3);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createCurvedSail(width, height, side, material) {
  const stepsX = 8;
  const stepsY = 12;
  const vertices = [];
  const indices = [];

  for (let y = 0; y <= stepsY; y += 1) {
    const v = y / stepsY;
    const rowWidth = width * (1 - v);
    for (let x = 0; x <= stepsX; x += 1) {
      const u = x / stepsX;
      const lateral = side * rowWidth * u;
      const billow = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.72;
      vertices.push(lateral, height * v, billow);
    }
  }

  for (let y = 0; y < stepsY; y += 1) {
    for (let x = 0; x < stepsX; x += 1) {
      const a = y * (stepsX + 1) + x;
      const b = a + 1;
      const c = a + stepsX + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

function createCylinderBetween(start, end, radius, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  cylinder.position.copy(start).add(end).multiplyScalar(0.5);
  cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  cylinder.castShadow = true;
  return cylinder;
}

function createRigging(points) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, materials.rigging);
}

function createBoatModel({ pirate = false } = {}) {
  const group = new THREE.Group();

  const hull = new THREE.Mesh(createHullGeometry(), pirate ? materials.pirateHull : materials.hull);
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.16, 5.7), materials.deck);
  deck.position.set(0, 0.35, 0.2);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.72, 1.4), pirate ? materials.pirateHull : materials.cabin);
  cabin.position.set(0, 0.88, -1.55);
  cabin.castShadow = true;
  cabin.receiveShadow = true;
  group.add(cabin);

  const mast = createCylinderBetween(new THREE.Vector3(0, 0.35, -0.3), new THREE.Vector3(0, 8.7, -0.3), 0.12, materials.trunk);
  group.add(mast);

  const boom = createCylinderBetween(new THREE.Vector3(0, 2.15, -0.3), new THREE.Vector3(3.6, 1.75, 0.2), 0.08, materials.trunk);
  group.add(boom);

  const bowsprit = createCylinderBetween(new THREE.Vector3(0, 0.35, 4.3), new THREE.Vector3(0, 0.7, 6.5), 0.07, materials.trunk);
  group.add(bowsprit);

  const mainSail = createCurvedSail(3.75, 6.6, 1, pirate ? materials.pirateSail : materials.sail);
  mainSail.position.set(0.05, 2.05, -0.34);
  group.add(mainSail);

  const jib = createCurvedSail(2.55, 4.9, -1, pirate ? materials.pirateSail : materials.goldSail);
  jib.position.set(-0.05, 1.2, 3.95);
  jib.rotation.y = 0.08;
  group.add(jib);

  group.add(createRigging([
    new THREE.Vector3(0, 8.7, -0.3),
    new THREE.Vector3(0, 0.72, 6.5),
    new THREE.Vector3(0, 0.35, 4.3),
  ]));
  group.add(createRigging([
    new THREE.Vector3(0, 8.7, -0.3),
    new THREE.Vector3(-1.55, 0.3, -3.5),
    new THREE.Vector3(1.55, 0.3, -3.5),
    new THREE.Vector3(0, 8.7, -0.3),
  ]));

  if (pirate) {
    const flagPole = createCylinderBetween(new THREE.Vector3(0, 8.55, -0.3), new THREE.Vector3(0, 10.2, -0.3), 0.055, materials.trunk);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.68, 0.05), materials.red);
    flag.position.set(0.58, 9.72, -0.3);
    flag.castShadow = true;
    group.add(flagPole, flag);
  }

  group.scale.setScalar(pirate ? 0.9 : 1);
  return group;
}

function waveHeightAt(x, z, time = state.waveTime) {
  if (isIslandPoint(x, z, 1.5)) return -0.82;

  const shoreDamping = isIslandPoint(x, z, 7) ? 0.22 : 1;
  return shoreDamping * (
    Math.sin(x * 0.09 + time * 1.7) * 0.42 +
    Math.sin(z * 0.075 + x * 0.025 + time * 1.15) * 0.34 +
    Math.sin((x + z) * 0.045 + time * 2.25) * 0.18
  );
}

function updateWater() {
  for (let i = 0; i < waterPositions.count; i += 1) {
    const worldX = waterBase[i].x * water.scale.x;
    const worldZ = waterBase[i].y * water.scale.y;
    waterPositions.setZ(i, waveHeightAt(worldX, worldZ));
  }
  waterPositions.needsUpdate = true;
  waterGeometry.computeVertexNormals();
}

function createPackageModel() {
  const group = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 3.6), materials.crate);
  crate.castShadow = true;
  crate.receiveShadow = true;
  group.add(crate);

  const strapA = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.28, 3.8), materials.strap);
  strapA.castShadow = true;
  group.add(strapA);

  const strapB = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.3, 0.5), materials.strap);
  strapB.castShadow = true;
  group.add(strapB);
  return group;
}

function resetGame() {
  state.score = 0;
  state.lives = 3;
  state.running = true;
  state.paused = false;
  state.gameOver = false;
  state.waveTime = 0;
  state.packageTimer = 0;
  state.pirateTimer = 1.5;
  packageRoot.clear();
  pirateRoot.clear();
  splashRoot.clear();
  state.packages = [];
  state.pirates = [];
  state.splashes = [];

  if (state.boat?.model) root.remove(state.boat.model);
  state.boat = {
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    angle: Math.PI,
    invincible: 0,
    model: createBoatModel(),
  };
  root.add(state.boat.model);

  for (let i = 0; i < 6; i += 1) spawnPackage();
  spawnPirate();
  syncHud();
  hideOverlay();
  pauseIcon.textContent = "Ⅱ";
}

function syncHud() {
  scoreEl.textContent = state.score;
  livesEl.textContent = state.lives;
  bestEl.textContent = state.best;
}

function showOverlay(title, text, action) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startButton.textContent = action;
  overlay.classList.add("is-visible");
}

function hideOverlay() {
  overlay.classList.remove("is-visible");
}

function edgeSpawn(margin = 4) {
  const b = bounds(-margin);
  const side = Math.floor(random(0, 4));
  if (side === 0) return { x: random(b.minX, b.maxX), z: b.minZ };
  if (side === 1) return { x: b.maxX, z: random(b.minZ, b.maxZ) };
  if (side === 2) return { x: random(b.minX, b.maxX), z: b.maxZ };
  return { x: b.minX, z: random(b.minZ, b.maxZ) };
}

function spawnPackage() {
  const b = bounds(8);
  let cargo;
  let attempts = 0;
  do {
    cargo = {
      x: random(b.minX, b.maxX),
      z: random(b.minZ, b.maxZ),
      bob: random(0, Math.PI * 2),
      model: createPackageModel(),
    };
    attempts += 1;
  } while (((state.boat && distance(cargo, state.boat) < 22) || isOnIsland(cargo, packageRadius)) && attempts < 50);

  state.packages.push(cargo);
  packageRoot.add(cargo.model);
}

function spawnPirate() {
  const spawn = edgeSpawn(7);
  const angle = Math.atan2(-spawn.x, -spawn.z);
  const pirate = {
    x: spawn.x,
    z: spawn.z,
    vx: 0,
    vz: 0,
    angle,
    speed: random(11, 15) + Math.min(state.score * 0.22, 6.5),
    wobble: random(0, Math.PI * 2),
    turnRate: random(0.82, 1.12) * pirateTurnRate,
    model: createBoatModel({ pirate: true }),
  };
  state.pirates.push(pirate);
  pirateRoot.add(pirate.model);
}

function burst(x, z, color = 0xdbf6ff, count = 10) {
  for (let i = 0; i < count; i += 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(random(0.18, 0.45), 8, 8), materials.wake.clone());
    mesh.material.color.setHex(color);
    mesh.position.set(x, random(0.4, 1.2), z);
    splashRoot.add(mesh);
    state.splashes.push({
      x,
      z,
      vx: random(-8, 8),
      vz: random(-8, 8),
      y: mesh.position.y,
      vy: random(3, 8),
      life: random(0.35, 0.8),
      maxLife: random(0.35, 0.8),
      model: mesh,
    });
  }
}

function updateInput() {
  let x = 0;
  let z = 0;

  if (keys.has("ArrowLeft") || keys.has("KeyA")) x -= 1;
  if (keys.has("ArrowRight") || keys.has("KeyD")) x += 1;
  if (keys.has("ArrowUp") || keys.has("KeyW")) z -= 1;
  if (keys.has("ArrowDown") || keys.has("KeyS")) z += 1;

  if (pointer.active) {
    x += pointer.x;
    z += pointer.y;
  }

  const magnitude = Math.hypot(x, z);
  input.x = magnitude > 1 ? x / magnitude : x;
  input.z = magnitude > 1 ? z / magnitude : z;
}

function update(dt) {
  updateInput();
  state.waveTime += dt;
  state.packageTimer += dt;
  state.pirateTimer += dt;

  updateBoat(dt);
  updatePirates(dt);
  updatePackages(dt);
  updateSplashes(dt);
  updateModels();

  if (state.packageTimer > Math.max(1.1, 2.4 - state.score * 0.035)) {
    state.packageTimer = 0;
    if (state.packages.length < 9) spawnPackage();
  }

  if (state.pirateTimer > Math.max(3.1, 7.0 - state.score * 0.08)) {
    state.pirateTimer = 0;
    if (state.pirates.length < 5) spawnPirate();
  }
}

function updateBoat(dt) {
  const boat = state.boat;
  boat.vx += input.x * acceleration * dt;
  boat.vz += input.z * acceleration * dt;
  boat.vx *= Math.pow(drag, dt * 60);
  boat.vz *= Math.pow(drag, dt * 60);

  const speed = Math.hypot(boat.vx, boat.vz);
  if (speed > maxSpeed) {
    boat.vx = (boat.vx / speed) * maxSpeed;
    boat.vz = (boat.vz / speed) * maxSpeed;
  }

  boat.x += boat.vx * dt;
  boat.z += boat.vz * dt;
  const b = bounds(boatRadius);
  boat.x = clamp(boat.x, b.minX, b.maxX);
  boat.z = clamp(boat.z, b.minZ, b.maxZ);
  resolveIslandCollisions(boat, boatRadius + 1, 0.18);

  if (Math.hypot(boat.vx, boat.vz) > 2) {
    boat.angle = Math.atan2(boat.vx, boat.vz);
  }

  boat.invincible = Math.max(0, boat.invincible - dt);

  if (speed > 22 && Math.random() < 0.25) {
    burst(boat.x - Math.sin(boat.angle) * 3.5, boat.z - Math.cos(boat.angle) * 3.5, 0xdbf6ff, 1);
  }
}

function updatePirates(dt) {
  const boat = state.boat;
  for (const pirate of state.pirates) {
    pirate.wobble += dt * 1.45;
    const isOutsideSea = isNearEdge(pirate, 5);
    const target = isOutsideSea ? { x: 0, z: 0 } : boat;
    const targetAngle = Math.atan2(target.x - pirate.x, target.z - pirate.z);
    const wanderingAim = targetAngle + Math.sin(pirate.wobble) * 0.9 + Math.sin(pirate.wobble * 0.47) * 0.45;
    const turnRate = isOutsideSea ? pirate.turnRate * 2.3 : pirate.turnRate;
    pirate.angle += clamp(angleDelta(pirate.angle, wanderingAim), -turnRate * dt, turnRate * dt);
    pirate.vx += Math.sin(pirate.angle) * pirateAcceleration * dt;
    pirate.vz += Math.cos(pirate.angle) * pirateAcceleration * dt;
    pirate.vx *= Math.pow(0.988, dt * 60);
    pirate.vz *= Math.pow(0.988, dt * 60);

    const velocity = Math.hypot(pirate.vx, pirate.vz) || 1;
    const cap = isOutsideSea ? pirate.speed * 1.22 : distance(pirate, boat) < 18 ? pirate.speed * 0.76 : pirate.speed;
    if (velocity > cap) {
      pirate.vx = (pirate.vx / velocity) * cap;
      pirate.vz = (pirate.vz / velocity) * cap;
    }

    pirate.x += pirate.vx * dt;
    pirate.z += pirate.vz * dt;
    keepPirateInSea(pirate);
    resolveIslandCollisions(pirate, pirateRadius + 1, 0.25);

    if (Math.hypot(pirate.vx, pirate.vz) > 1.4) {
      pirate.angle = Math.atan2(pirate.vx, pirate.vz);
    }

    if (boat.invincible <= 0 && distance(pirate, boat) < pirateRadius + boatRadius) {
      hitBoat(pirate);
    }
  }
}

function isNearEdge(entity, margin) {
  const b = bounds(margin);
  return entity.x <= b.minX || entity.x >= b.maxX || entity.z <= b.minZ || entity.z >= b.maxZ;
}

function keepPirateInSea(pirate) {
  const b = bounds(pirateRadius);
  if (pirate.x < b.minX) {
    pirate.x = b.minX;
    pirate.vx = Math.abs(pirate.vx) * 0.7;
  } else if (pirate.x > b.maxX) {
    pirate.x = b.maxX;
    pirate.vx = -Math.abs(pirate.vx) * 0.7;
  }

  if (pirate.z < b.minZ) {
    pirate.z = b.minZ;
    pirate.vz = Math.abs(pirate.vz) * 0.7;
  } else if (pirate.z > b.maxZ) {
    pirate.z = b.maxZ;
    pirate.vz = -Math.abs(pirate.vz) * 0.7;
  }
}

function updatePackages(dt) {
  for (let i = state.packages.length - 1; i >= 0; i -= 1) {
    const cargo = state.packages[i];
    cargo.bob += dt * 3.2;
    if (distance(cargo, state.boat) < packageRadius + boatRadius) {
      packageRoot.remove(cargo.model);
      state.packages.splice(i, 1);
      state.score += 1;
      state.best = Math.max(state.best, state.score);
      localStorage.setItem("harbor-run-best", state.best);
      syncHud();
      burst(cargo.x, cargo.z, 0xffd166, 16);
      if (state.packages.length < 2) spawnPackage();
    }
  }
}

function updateSplashes(dt) {
  for (let i = state.splashes.length - 1; i >= 0; i -= 1) {
    const splash = state.splashes[i];
    splash.life -= dt;
    splash.x += splash.vx * dt;
    splash.z += splash.vz * dt;
    splash.y += splash.vy * dt;
    splash.vy -= 16 * dt;
    splash.model.position.set(splash.x, Math.max(0.2, splash.y), splash.z);
    splash.model.material.opacity = clamp(splash.life / splash.maxLife, 0, 0.7);

    if (splash.life <= 0) {
      splashRoot.remove(splash.model);
      splash.model.geometry.dispose();
      splash.model.material.dispose();
      state.splashes.splice(i, 1);
    }
  }
}

function updateModels() {
  updateWater();
  waveRoot.position.x = 0;
  waveRoot.position.z = 0;
  waveRoot.position.y = Math.sin(state.waveTime * 1.4) * 0.12;

  if (state.boat?.model) {
    const wave = waveHeightAt(state.boat.x, state.boat.z);
    const bob = Math.sin(state.waveTime * 3.2 + state.boat.x * 0.05) * 0.22;
    state.boat.model.position.set(state.boat.x, 1.35 + wave * 0.55 + bob, state.boat.z);
    state.boat.model.rotation.set(
      Math.sin(state.waveTime * 2.8 + state.boat.z * 0.04) * 0.055,
      state.boat.angle,
      Math.sin(state.waveTime * 2.2 + state.boat.x * 0.04) * 0.09,
    );
    state.boat.model.visible = state.boat.invincible <= 0 || Math.floor(state.boat.invincible * 12) % 2 !== 0;
  }

  for (const cargo of state.packages) {
    cargo.model.position.set(cargo.x, 1.25 + waveHeightAt(cargo.x, cargo.z) * 0.35 + Math.sin(cargo.bob) * 0.35, cargo.z);
    cargo.model.rotation.y += 0.01;
  }

  for (const pirate of state.pirates) {
    const bob = Math.sin(state.waveTime * 3 + pirate.wobble) * 0.2;
    pirate.model.position.set(pirate.x, 1.15 + waveHeightAt(pirate.x, pirate.z) * 0.5 + bob, pirate.z);
    pirate.model.rotation.set(
      Math.sin(state.waveTime * 2.5 + pirate.wobble) * 0.045,
      pirate.angle,
      Math.sin(pirate.wobble) * 0.075,
    );
  }
}

function updateCamera(dt) {
  const targetX = state.boat ? state.boat.x : 0;
  const targetZ = state.boat ? state.boat.z : 0;
  const follow = 1 - Math.pow(0.002, dt);

  desiredCameraPosition.set(targetX, 72, targetZ + 78);
  desiredCameraLookAt.set(targetX, 1.8, targetZ - 7);
  camera.position.lerp(desiredCameraPosition, follow);
  cameraFocus.lerp(desiredCameraLookAt, follow);
  camera.lookAt(cameraFocus);

  sun.position.set(targetX - 42, 82, targetZ + 36);
  sun.target.position.set(targetX, 0, targetZ);
  sun.target.updateMatrixWorld();
}

function hitBoat(pirate) {
  state.lives -= 1;
  syncHud();
  state.boat.invincible = 1.65;
  state.boat.vx = -Math.sin(pirate.angle) * 30;
  state.boat.vz = -Math.cos(pirate.angle) * 30;
  pirate.x -= Math.sin(pirate.angle) * 7;
  pirate.z -= Math.cos(pirate.angle) * 7;
  pirate.vx *= -0.25;
  pirate.vz *= -0.25;
  burst(state.boat.x, state.boat.z, 0xff6b6b, 20);

  if (state.lives <= 0) {
    endGame();
  }
}

function endGame() {
  state.running = false;
  state.gameOver = true;
  showOverlay("Run Over", `${state.score} package${state.score === 1 ? "" : "s"} delivered.`, "Sail Again");
}

function render(time) {
  const dt = Math.min((time - state.lastTime) / 1000 || 0, 0.033);
  state.lastTime = time;

  if (state.running && !state.paused) update(dt);
  else updateModels();

  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

function togglePause() {
  if (!state.running || state.gameOver) return;
  state.paused = !state.paused;
  pauseIcon.textContent = state.paused ? "▶" : "Ⅱ";
  if (state.paused) {
    showOverlay("Paused", "The tide is holding steady.", "Resume");
  } else {
    hideOverlay();
  }
}

function setPointerPosition(clientX, clientY) {
  const rect = touchPad.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  const max = rect.width * 0.34;
  const magnitude = Math.hypot(dx, dy);
  const limited = magnitude > max ? max / magnitude : 1;
  const x = dx * limited;
  const y = dy * limited;

  pointer.x = clamp(x / max, -1, 1);
  pointer.y = clamp(y / max, -1, 1);
  touchStick.style.transform = `translate(${x}px, ${y}px)`;
}

function clearPointer() {
  pointer.active = false;
  pointer.id = null;
  pointer.x = 0;
  pointer.y = 0;
  touchStick.style.transform = "translate(0, 0)";
}

startButton.addEventListener("click", () => {
  if (state.paused) {
    state.paused = false;
    pauseIcon.textContent = "Ⅱ";
    hideOverlay();
    return;
  }
  resetGame();
});

pauseButton.addEventListener("click", togglePause);

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (event.code === "Space" || event.code === "Escape") {
    event.preventDefault();
    togglePause();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

touchPad.addEventListener("pointerdown", (event) => {
  pointer.active = true;
  pointer.id = event.pointerId;
  touchPad.setPointerCapture(event.pointerId);
  setPointerPosition(event.clientX, event.clientY);
});

touchPad.addEventListener("pointermove", (event) => {
  if (pointer.active && event.pointerId === pointer.id) {
    setPointerPosition(event.clientX, event.clientY);
  }
});

touchPad.addEventListener("pointerup", clearPointer);
touchPad.addEventListener("pointercancel", clearPointer);
window.addEventListener("resize", resize);

bestEl.textContent = state.best;
resize();
updateModels();
requestAnimationFrame(render);
