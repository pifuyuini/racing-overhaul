import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHARACTERS } from './types';
import type { CharacterId } from './types';
export const material = (color: number, roughness = 0.75) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.03 });
const sphere = new THREE.SphereGeometry(1, 20, 14);
// Character surfaces get a smoother silhouette without increasing scenery geometry.
const characterSphere = new THREE.SphereGeometry(1, 28, 20);
const detailSphere = new THREE.SphereGeometry(1, 16, 12);
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
  const white = material(0xfff2d8, 0.68),
    black = new THREE.MeshStandardMaterial({ color: 0x252d35, roughness: 0.16, metalness: 0 }),
    glint = new THREE.MeshBasicMaterial({ color: 0xfffdf4 }),
    pink = material(0xd99582, 0.8),
    fur = material(
      characterId === 'capybara'
        ? 0xb98a5d
        : characterId === 'fox'
          ? 0xd87936
          : characterId === 'penguin'
            ? 0x344b60
            : 0xb9653e,
      0.72,
    ),
    deepFur = material(characterId === 'panda' ? 0x644131 : 0x9b663f, 0.76),
    tan = material(0xcfa57b, 0.76);
  const sculptGeometries = new Set<THREE.BufferGeometry>();
  const sculpt = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) => {
    const size = Math.max(sx, sy, sz);
    const geometry = size < 0.18 ? detailSphere : size < 0.36 ? sphere : characterSphere;
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const stroke = (
    parent: THREE.Object3D,
    points: number[][],
    radius = 0.009,
    mat: THREE.Material = black,
  ) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((point) => new THREE.Vector3(...(point as [number, number, number]))),
    );
    const geometry = new THREE.TubeGeometry(curve, 12, radius, 5, false);
    sculptGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, mat);
    parent.add(mesh);
    return mesh;
  };
  const limb = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    a: number[],
    b: number[],
    width: number,
    depth = width,
  ) => {
    const from = new THREE.Vector3(...(a as [number, number, number])),
      to = new THREE.Vector3(...(b as [number, number, number])),
      direction = to.clone().sub(from),
      center = from.add(to).multiplyScalar(0.5);
    const mesh = sculpt(
      parent,
      mat,
      center.x,
      center.y,
      center.z,
      width,
      direction.length() / 2 + width * 0.45,
      depth,
    );
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
  };
  const eyes = (x: number, y: number, z: number, size = 1) => {
    for (const side of [-1, 1]) {
      sculpt(head, black, side * x, y, z, 0.052 * size, 0.069 * size, 0.03);
      sculpt(
        head,
        glint,
        side * x - 0.014 * size,
        y + 0.025 * size,
        z + 0.026,
        0.014 * size,
        0.018 * size,
        0.008,
      );
      sculpt(
        head,
        glint,
        side * x + 0.015 * size,
        y - 0.019 * size,
        z + 0.028,
        0.0055 * size,
        0.007 * size,
        0.004,
      );
    }
  };
  const pointedEar = (x: number, tilt: number) => {
    const earShape = new THREE.Shape();
    earShape.moveTo(-0.22, -0.13);
    earShape.quadraticCurveTo(-0.23, 0.02, -0.085, 0.39);
    earShape.quadraticCurveTo(0, 0.56, 0.085, 0.39);
    earShape.quadraticCurveTo(0.23, 0.02, 0.22, -0.13);
    earShape.quadraticCurveTo(0, -0.2, -0.22, -0.13);
    const geometry = new THREE.ExtrudeGeometry(earShape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.045,
      bevelSegments: 4,
      curveSegments: 10,
      steps: 1,
    });
    sculptGeometries.add(geometry);
    const ear = new THREE.Group();
    ear.position.set(x, 0.44, -0.08);
    ear.rotation.z = tilt;
    head.add(ear);
    const outer = new THREE.Mesh(geometry, fur);
    outer.castShadow = true;
    ear.add(outer);
    const inner = new THREE.Mesh(geometry, pink);
    inner.scale.set(0.58, 0.63, 0.19);
    inner.position.set(0, 0.065, 0.112);
    ear.add(inner);
  };
  const tail = (isPanda: boolean) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.36, 0.22, -0.22),
      new THREE.Vector3(0.73, 0.24, -0.53),
      new THREE.Vector3(0.98, 0.46, -0.83),
      new THREE.Vector3(1.02, 0.73, -1.01),
      new THREE.Vector3(0.89, 0.94, -1.0),
    ]);
    const segments = 40,
      radial = 20,
      frames = curve.computeFrenetFrames(segments, false),
      positions: number[] = [],
      normals: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const baseColor = new THREE.Color(isPanda ? 0xc47a47 : 0xd87936),
      stripeColor = new THREE.Color(0x704632),
      tipColor = new THREE.Color(0xfff2d8);
    for (let ring = 0; ring <= segments; ring++) {
      const t = ring / segments,
        center = curve.getPointAt(t),
        radius = (isPanda ? 0.235 : 0.29) * Math.pow(Math.sin(Math.PI * (t * 0.91 + 0.045)), 0.43),
        color = isPanda
          ? Math.floor(t * 8) % 2
            ? stripeColor
            : baseColor
          : t > 0.69
            ? tipColor
            : baseColor;
      for (let side = 0; side <= radial; side++) {
        const angle = (side / radial) * Math.PI * 2,
          normal = frames.normals[ring]
            .clone()
            .multiplyScalar(Math.cos(angle))
            .addScaledVector(frames.binormals[ring], Math.sin(angle)),
          point = center.clone().addScaledVector(normal, ring === segments ? 0.012 : radius);
        positions.push(point.x, point.y, point.z);
        normals.push(normal.x, normal.y, normal.z);
        colors.push(color.r, color.g, color.b);
        if (ring < segments && side < radial) {
          const a = ring * (radial + 1) + side,
            b = a + radial + 1;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    sculptGeometries.add(geometry);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    driverBody.add(mesh);
  };
  const driverBody = new THREE.Group();
  driver.add(driverBody);
  const isPenguin = characterId === 'penguin';
  sculpt(driverBody, fur, 0, 0.35, -0.035, isPenguin ? 0.52 : 0.49, isPenguin ? 0.65 : 0.57, 0.41);
  if (isPenguin) sculpt(driverBody, white, 0, 0.29, 0.318, 0.35, 0.49, 0.13);
  else if (characterId === 'fox') sculpt(driverBody, white, 0, 0.53, 0.3, 0.29, 0.3, 0.1);
  else if (characterId === 'panda') sculpt(driverBody, deepFur, 0, 0.2, 0.24, 0.37, 0.37, 0.15);
  for (const side of [-1, 1]) {
    if (isPenguin) {
      const flipper = limb(
        driverBody,
        fur,
        [side * 0.42, 0.6, 0.05],
        [side * 0.32, 0.46, 0.88],
        0.13,
        0.18,
      );
      flipper.rotation.z += side * 0.1;
    } else {
      limb(driverBody, fur, [side * 0.39, 0.59, 0.04], [side * 0.46, 0.35, 0.41], 0.145);
      limb(
        driverBody,
        characterId === 'panda' ? deepFur : fur,
        [side * 0.46, 0.35, 0.41],
        [side * 0.3, 0.46, 0.89],
        0.13,
      );
      sculpt(
        driverBody,
        characterId === 'panda' ? deepFur : fur,
        side * 0.29,
        0.46,
        0.94,
        0.145,
        0.13,
        0.13,
      );
    }
    sculpt(
      driverBody,
      isPenguin ? gold : characterId === 'panda' ? deepFur : fur,
      side * 0.29,
      -0.12,
      0.47,
      0.19,
      0.13,
      0.27,
    );
  }
  const scarf = material(
    characterId === 'panda'
      ? 0xe88a6e
      : characterId === 'capybara'
        ? 0x55a99b
        : characterId === 'fox'
          ? 0xf0c956
          : 0xe88473,
    0.8,
  );
  sculpt(driverBody, scarf, 0, 0.79, -0.015, 0.36, 0.13, 0.34);
  const knot = sculpt(driverBody, scarf, -0.3, 0.74, 0.2, 0.13, 0.12, 0.13);
  knot.rotation.z = -0.3;
  const scarfTail = sculpt(driverBody, scarf, -0.39, 0.5, 0.12, 0.12, 0.28, 0.07);
  scarfTail.rotation.z = -0.2;
  if (characterId === 'panda') {
    sculpt(head, fur, 0, 0.015, 0, 0.61, 0.51, 0.48);
    for (const side of [-1, 1]) {
      const ear = sculpt(head, white, side * 0.44, 0.41, -0.045, 0.205, 0.235, 0.13);
      ear.rotation.z = side * -0.24;
      const inner = sculpt(head, deepFur, side * 0.44, 0.42, 0.057, 0.135, 0.16, 0.045);
      inner.rotation.z = ear.rotation.z;
      const cheek = sculpt(head, white, side * 0.285, -0.14, 0.366, 0.3, 0.235, 0.103);
      cheek.rotation.z = side * -0.23;
      const mask = sculpt(head, deepFur, side * 0.245, 0.025, 0.452, 0.148, 0.155, 0.038);
      mask.rotation.z = side * -0.18;
      const brow = sculpt(head, white, side * 0.23, 0.215, 0.407, 0.162, 0.069, 0.05);
      brow.rotation.z = side * -0.17;
    }
    eyes(0.245, 0.025, 0.492, 1.02);
    sculpt(head, white, 0, -0.205, 0.448, 0.27, 0.17, 0.17);
    sculpt(head, black, 0, -0.135, 0.607, 0.088, 0.053, 0.044);
    stroke(head, [
      [0, -0.177, 0.625],
      [0, -0.23, 0.612],
    ]);
    stroke(head, [
      [-0.085, -0.248, 0.592],
      [0, -0.271, 0.604],
      [0.085, -0.248, 0.592],
    ]);
    tail(true);
  } else if (characterId === 'capybara') {
    // A continuous, gently squared surface keeps the broad capybara muzzle soft.
    const softForm = (sx: number, sy: number, sz: number, power: number) => {
      const geometry = characterSphere.clone(),
        positions = geometry.getAttribute('position'),
        normals = geometry.getAttribute('normal');
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i),
          y = positions.getY(i),
          z = positions.getZ(i);
        const round = (value: number) => Math.sign(value) * Math.pow(Math.abs(value), power);
        positions.setXYZ(i, round(x) * sx, round(y) * sy, round(z) * sz);
        const normal = new THREE.Vector3(
          (Math.sign(x) * Math.pow(Math.abs(x), 2 - power)) / sx,
          (Math.sign(y) * Math.pow(Math.abs(y), 2 - power)) / sy,
          (Math.sign(z) * Math.pow(Math.abs(z), 2 - power)) / sz,
        ).normalize();
        normals.setXYZ(i, normal.x, normal.y, normal.z);
      }
      sculptGeometries.add(geometry);
      return geometry;
    };
    const crown = new THREE.Mesh(softForm(0.595, 0.45, 0.5, 0.8), fur);
    crown.position.set(0, -0.015, 0.035);
    crown.castShadow = true;
    head.add(crown);
    const muzzle = new THREE.Mesh(softForm(0.505, 0.245, 0.325, 0.66), tan);
    muzzle.position.set(0, -0.165, 0.47);
    muzzle.castShadow = true;
    head.add(muzzle);
    for (const side of [-1, 1]) {
      sculpt(head, fur, side * 0.455, 0.4, -0.16, 0.14, 0.17, 0.105);
      sculpt(head, tan, side * 0.455, 0.415, -0.073, 0.079, 0.104, 0.033);
      const brow = sculpt(head, deepFur, side * 0.4, 0.205, 0.425, 0.078, 0.018, 0.013);
      brow.rotation.z = side * -0.08;
      sculpt(head, deepFur, side * 0.19, -0.1, 0.799, 0.027, 0.019, 0.012);
    }
    eyes(0.405, 0.115, 0.475, 0.81);
    stroke(
      head,
      [
        [-0.15, -0.285, 0.784],
        [0, -0.303, 0.788],
        [0.15, -0.285, 0.784],
      ],
      0.0085,
      deepFur,
    );
    const citrus = material(0xf0a836, 0.72);
    sculpt(head, citrus, -0.08, 0.5, -0.06, 0.145, 0.13, 0.145);
    const leaf = sculpt(head, material(0x689b60), 0.025, 0.618, -0.065, 0.12, 0.023, 0.055);
    leaf.rotation.z = 0.22;
  } else if (characterId === 'fox') {
    pointedEar(-0.365, 0.17);
    pointedEar(0.365, -0.17);
    sculpt(head, fur, 0, 0.015, 0, 0.535, 0.485, 0.46);
    for (const side of [-1, 1]) {
      const cheek = sculpt(head, white, side * 0.255, -0.18, 0.34, 0.275, 0.205, 0.112);
      cheek.rotation.z = side * 0.3;
      const brow = sculpt(head, deepFur, side * 0.225, 0.205, 0.405, 0.095, 0.023, 0.018);
      brow.rotation.z = side * -0.18;
    }
    eyes(0.225, 0.065, 0.441, 1.0);
    sculpt(head, white, 0, -0.205, 0.49, 0.205, 0.145, 0.25);
    sculpt(head, black, 0, -0.137, 0.723, 0.077, 0.048, 0.044);
    stroke(head, [
      [0, -0.18, 0.747],
      [0, -0.23, 0.736],
    ]);
    stroke(head, [
      [-0.08, -0.253, 0.709],
      [0, -0.276, 0.726],
      [0.08, -0.253, 0.709],
    ]);
    tail(false);
  } else {
    sculpt(head, fur, 0, 0.015, -0.005, 0.53, 0.54, 0.455);
    for (const side of [-1, 1]) {
      const face = sculpt(head, white, side * 0.185, -0.075, 0.35, 0.255, 0.345, 0.115);
      face.rotation.z = side * -0.12;
    }
    sculpt(head, white, 0, -0.24, 0.334, 0.33, 0.255, 0.115);
    eyes(0.205, 0.045, 0.471, 1.0);
    sculpt(head, gold, 0, -0.11, 0.51, 0.145, 0.077, 0.16);
    sculpt(head, material(0xe5a74d, 0.7), 0, -0.165, 0.533, 0.107, 0.03, 0.103);
    const hat = material(0xe88a76, 0.82);
    sculpt(head, hat, 0, 0.47, -0.065, 0.4, 0.13, 0.35);
    sculpt(head, hat, 0, 0.555, -0.075, 0.31, 0.12, 0.29);
    sculpt(head, hat, -0.045, 0.667, -0.075, 0.086, 0.084, 0.086);
  }
  batchStatic(head);
  batchStatic(driverBody);
  sculptGeometries.forEach((geometry) => geometry.dispose());
  const steering = new THREE.Group();
  steering.position.set(0, 1.3, 0.65);
  root.add(steering);
  const wheelFrame = new THREE.Group();
  wheelFrame.rotation.x = 0.7;
  steering.add(wheelFrame);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.048, 10, 28), rubber);
  wheelFrame.add(wheel);
  for (let i = 0; i < 3; i++) {
    const angle = Math.PI / 2 + (i * Math.PI * 2) / 3;
    const spoke = box(
      wheelFrame,
      chrome,
      Math.cos(angle) * 0.15,
      Math.sin(angle) * 0.15,
      0,
      0.27,
      0.035,
      0.035,
      0.015,
    );
    spoke.rotation.z = angle;
  }
  ellipsoid(wheelFrame, gold, 0, 0, 0.015, 0.085, 0.085, 0.04);
  const shaft = cylinder(steering, chrome, 0, -0.2, -0.04, 0.035, 0.035, 0.5, 10);
  shaft.rotation.x = 0.45;
  batchStatic(steering);
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
      if (
        object.geometry !== sphere &&
        object.geometry !== characterSphere &&
        object.geometry !== detailSphere
      )
        geometries.add(object.geometry);
      for (const mat of Array.isArray(object.material) ? object.material : [object.material])
        materials.add(mat);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((mat) => mat.dispose());
}
