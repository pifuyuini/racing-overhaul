import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHARACTERS } from './types';
import type { CharacterId } from './types';
export const material = (color: number, roughness = 0.75) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.03 });
const sphere = new THREE.SphereGeometry(1, 20, 14);
export function ellipsoid(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  const mesh = new THREE.Mesh(sphere, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function box(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  r = 0.08,
) {
  const mesh = new THREE.Mesh(
    r > 0
      ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2))
      : new THREE.BoxGeometry(w, h, d),
    mat,
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function cylinder(
  parent: THREE.Object3D,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
  top: number,
  bottom: number,
  height: number,
  sides = 10,
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, sides), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export function batchStatic(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>(),
    inverse = root.matrixWorld.clone().invert();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !Array.isArray(object.material)) {
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      const list = buckets.get(object.material) ?? [];
      list.push(geometry.index ? geometry.toNonIndexed() : geometry);
      buckets.set(object.material, list);
    }
  });
  root.clear();
  for (const [mat, geometries] of buckets) {
    const geometry = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (geometry) {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
}
export interface KartModel {
  root: THREE.Group;
  driver: THREE.Group;
  head: THREE.Group;
  wheels: THREE.Group[];
  front: THREE.Group[];
  steering: THREE.Group;
  flames: THREE.Mesh[];
  shield: THREE.Mesh;
  shadow: THREE.Mesh;
}
export function createKart(characterId: CharacterId, variant = 0): KartModel {
  const spec = CHARACTERS.find((c) => c.id === characterId)!,
    root = new THREE.Group(),
    chassis = new THREE.Group();
  root.add(chassis);
  const bodyColor = new THREE.Color(spec.color);
  if (variant > 0) bodyColor.offsetHSL((variant % 3) * 0.018, 0, (variant % 2) * 0.06);
  const paint = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.36,
    metalness: 0.1,
  });
  const cream = material(0xfff0cf),
    rubber = material(0x24343e),
    dark = material(0x234852),
    chrome = material(0xd5e6d9, 0.25),
    gold = material(0xfac757, 0.4);
  box(chassis, dark, 0, 0.38, 0, 1.8, 0.26, 3.1, 0.12);
  box(chassis, paint, 0, 0.68, 0.25, 1.9, 0.6, 2.65, 0.2);
  box(chassis, paint, 0, 0.73, 1.36, 1.76, 0.43, 0.92, 0.17);
  box(chassis, cream, 0, 0.77, 1.54, 0.28, 0.45, 0.68, 0.08);
  box(chassis, dark, 0, 0.59, 1.82, 1.31, 0.24, 0.09, 0.03);
  for (let x = -0.45; x <= 0.45; x += 0.18)
    box(chassis, chrome, x, 0.59, 1.88, 0.05, 0.13, 0.03, 0.01);
  for (const x of [-0.66, 0.66]) ellipsoid(chassis, gold, x, 0.88, 1.77, 0.21, 0.12, 0.055);
  box(chassis, chrome, 0, 0.4, 1.87, 2.05, 0.16, 0.17, 0.06);
  box(chassis, cream, 0, 0.66, -1.24, 2.07, 0.26, 0.44, 0.08);
  box(chassis, dark, 0, 0.95, -0.55, 1.15, 0.3, 0.96, 0.16);
  box(chassis, cream, 0, 1.25, -0.88, 1.2, 0.67, 0.2, 0.15);
  for (const x of [-0.82, 0.82]) {
    box(chassis, paint, x, 0.74, -1.2, 0.13, 0.42, 0.2, 0.035);
    box(chassis, cream, x, 0.98, -1.2, 0.14, 0.14, 0.22, 0.035);
  }
  box(chassis, paint, 0, 1.13, -1.35, 2.23, 0.14, 0.42, 0.05);
  for (const x of [-0.61, 0.61]) {
    const exhaust = cylinder(chassis, chrome, x, 0.53, -1.65, 0.15, 0.15, 0.4);
    exhaust.rotation.x = Math.PI / 2;
  }
  batchStatic(chassis);
  const wheels: THREE.Group[] = [],
    front: THREE.Group[] = [];
  const tireGeometry = new THREE.TorusGeometry(0.365, 0.16, 10, 20),
    rimGeometry = new THREE.CylinderGeometry(0.29, 0.29, 0.18, 16),
    capGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 12);
  for (const x of [-1.04, 1.04])
    for (const z of [-0.98, 1.08]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.5, z);
      root.add(pivot);
      const wheel = new THREE.Group();
      pivot.add(wheel);
      wheels.push(wheel);
      if (z > 0) front.push(pivot);
      const tire = new THREE.Mesh(tireGeometry, rubber);
      tire.rotation.y = Math.PI / 2;
      tire.castShadow = true;
      wheel.add(tire);
      const rim = new THREE.Mesh(rimGeometry, gold);
      rim.rotation.z = Math.PI / 2;
      rim.castShadow = true;
      wheel.add(rim);
      const cap = new THREE.Mesh(capGeometry, cream);
      cap.rotation.z = Math.PI / 2;
      wheel.add(cap);
      for (let i = 0; i < 4; i++) {
        const spoke = box(
          wheel,
          cream,
          0,
          Math.cos((i * Math.PI) / 2) * 0.16,
          Math.sin((i * Math.PI) / 2) * 0.16,
          0.22,
          0.07,
          0.07,
          0.015,
        );
        spoke.rotation.x = (-i * Math.PI) / 2;
      }
      batchStatic(wheel);
    }
  const driver = new THREE.Group();
  driver.position.set(0, 0.89, -0.32);
  root.add(driver);
  const head = new THREE.Group();
  head.position.set(0, 1.04, 0.02);
  driver.add(head);
  const black = material(0x28313c),
    white = material(0xfff5df),
    pink = material(0xeeaa97),
    brown = material(
      characterId === 'capybara' ? 0xb88759 : characterId === 'fox' ? 0xdb7c36 : 0xb66843,
    );
  const fur = characterId === 'penguin' ? material(0x3b5167) : brown;
  const driverBody = new THREE.Group();
  driver.add(driverBody);
  ellipsoid(driverBody, fur, 0, 0.34, 0, 0.51, 0.58, 0.45);
  ellipsoid(driverBody, white, 0, 0.32, 0.345, 0.35, 0.43, 0.145);
  for (const x of [-0.4, 0.4]) {
    const arm = ellipsoid(driverBody, fur, x, 0.48, 0.34, 0.18, 0.36, 0.17);
    arm.rotation.x = -0.6;
    arm.rotation.z = x > 0 ? 0.3 : -0.3;
    ellipsoid(
      driverBody,
      characterId === 'penguin' ? gold : fur,
      x * 0.8,
      -0.15,
      0.44,
      0.2,
      0.16,
      0.29,
    );
  }
  const scarf = material(
    characterId === 'panda'
      ? 0xec8567
      : characterId === 'capybara'
        ? 0x4daf9e
        : characterId === 'fox'
          ? 0xf4d671
          : 0xec8274,
  );
  cylinder(driverBody, scarf, 0, 0.8, 0, 0.37, 0.37, 0.18, 16);
  const scarfTail = box(driverBody, scarf, 0.22, 0.46, -0.44, 0.2, 0.66, 0.1, 0.05);
  scarfTail.rotation.z = -0.22;
  if (characterId === 'capybara') {
    ellipsoid(head, fur, 0, 0, 0.03, 0.62, 0.47, 0.58);
    ellipsoid(head, material(0xc59b70), 0, -0.15, 0.44, 0.5, 0.27, 0.29);
    for (const x of [-0.43, 0.43]) {
      ellipsoid(head, fur, x, 0.36, -0.06, 0.18, 0.2, 0.14);
      ellipsoid(head, pink, x, 0.39, 0.055, 0.09, 0.11, 0.04);
    }
    for (const x of [-0.27, 0.27]) {
      ellipsoid(head, black, x, 0.045, 0.548, 0.052, 0.074, 0.035);
      ellipsoid(head, white, x - 0.012, 0.07, 0.579, 0.016, 0.02, 0.012);
    }
    for (const x of [-0.12, 0.12]) ellipsoid(head, black, x, -0.11, 0.695, 0.036, 0.024, 0.016);
    const orange = material(0xf2a12a);
    ellipsoid(head, orange, 0, 0.53, -0.02, 0.2, 0.18, 0.2);
    const leaf = ellipsoid(head, material(0x4e9462), 0.12, 0.72, -0.01, 0.13, 0.035, 0.07);
    leaf.rotation.z = 0.3;
  } else if (characterId === 'penguin') {
    ellipsoid(head, fur, 0, 0, 0, 0.54, 0.57, 0.49);
    for (const x of [-0.2, 0.2]) ellipsoid(head, white, x, -0.06, 0.385, 0.3, 0.38, 0.17);
    for (const x of [-0.22, 0.22]) {
      ellipsoid(head, black, x, 0.04, 0.533, 0.067, 0.09, 0.034);
      ellipsoid(head, white, x - 0.015, 0.073, 0.559, 0.02, 0.025, 0.015);
    }
    ellipsoid(head, gold, 0, -0.14, 0.6, 0.18, 0.1, 0.2);
    const hat = material(0xe98c78);
    ellipsoid(head, hat, 0, 0.48, -0.02, 0.48, 0.18, 0.44);
    ellipsoid(head, hat, 0, 0.63, 0, 0.12, 0.1, 0.12);
  } else {
    ellipsoid(head, fur, 0, 0, 0, 0.59, 0.52, 0.49);
    const earGeometry = new THREE.ConeGeometry(0.235, 0.57, 3);
    for (const x of [-0.42, 0.42]) {
      const ear = new THREE.Mesh(earGeometry, fur);
      ear.position.set(x, 0.46, -0.045);
      ear.rotation.z = x < 0 ? 0.23 : -0.23;
      ear.rotation.y = Math.PI;
      head.add(ear);
      const inner = new THREE.Mesh(new THREE.ConeGeometry(0.135, 0.33, 3), pink);
      inner.position.set(x, 0.48, 0.065);
      inner.rotation.copy(ear.rotation);
      head.add(inner);
    }
    for (const x of [-0.24, 0.24]) {
      const patch = ellipsoid(head, white, x, -0.02, 0.37, 0.28, 0.27, 0.17);
      patch.rotation.z = x > 0 ? -0.2 : 0.2;
      if (characterId === 'panda') {
        const eyePatch = ellipsoid(head, material(0x704b3b), x, 0.065, 0.509, 0.145, 0.15, 0.044);
        eyePatch.rotation.z = x > 0 ? -0.2 : 0.2;
      }
      ellipsoid(head, black, x, 0.055, 0.551, 0.057, 0.083, 0.033);
      ellipsoid(head, white, x - 0.014, 0.079, 0.578, 0.018, 0.024, 0.012);
      ellipsoid(head, pink, x * 1.5, -0.12, 0.45, 0.1, 0.052, 0.022);
    }
    ellipsoid(head, white, 0, -0.22, 0.42, 0.33, 0.2, 0.24);
    ellipsoid(head, black, 0, -0.15, 0.657, 0.095, 0.057, 0.052);
    const tail = new THREE.Group();
    tail.position.set(0.23, 0.19, -0.4);
    tail.rotation.z = -0.45;
    driverBody.add(tail);
    ellipsoid(tail, fur, 0, 0.1, -0.25, 0.23, 0.25, 0.65);
    if (characterId === 'panda')
      for (let i = 0; i < 3; i++)
        ellipsoid(tail, material(0x774e3a), 0, 0.1, -0.26 - i * 0.2, 0.235, 0.26, 0.1);
    else ellipsoid(tail, white, 0, 0.1, -0.7, 0.2, 0.22, 0.23);
  }
  batchStatic(head);
  batchStatic(driverBody);
  const steering = new THREE.Group();
  steering.position.set(0, 1.3, 0.65);
  root.add(steering);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 8, 20), rubber);
  wheel.rotation.x = 0.7;
  steering.add(wheel);
  const shaft = cylinder(steering, chrome, 0, -0.2, -0.04, 0.035, 0.035, 0.5, 8);
  shaft.rotation.x = 0.45;
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: 0x85ffff,
    transparent: true,
    opacity: 0.88,
  });
  const flames: THREE.Mesh[] = [];
  for (const x of [-0.61, 0.61]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.9, 7), flameMaterial);
    flame.rotation.x = -Math.PI / 2;
    flame.position.set(x, 0.53, -2.04);
    flame.visible = false;
    root.add(flame);
    flames.push(flame);
  }
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshPhysicalMaterial({
      color: 0x92f9fa,
      transparent: true,
      opacity: 0.2,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  shield.scale.set(1.9, 1.85, 2.35);
  shield.position.y = 1.1;
  shield.visible = false;
  root.add(shield);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1, 24),
    new THREE.MeshBasicMaterial({
      color: 0x283c40,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.018;
  shadow.scale.set(1.5, 2.05, 1);
  root.add(shadow);
  return { root, driver, head, wheels, front, steering, flames, shield, shadow };
}

export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (object.geometry !== sphere) geometries.add(object.geometry);
      for (const mat of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(mat);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((mat) => mat.dispose());
}
