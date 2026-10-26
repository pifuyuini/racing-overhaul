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
export function batchStatic(root: THREE.Group, disposeSources = false) {
  root.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>(),
    inverse = root.matrixWorld.clone().invert(),
    sources = new Set<THREE.BufferGeometry>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !Array.isArray(object.material)) {
      if (
        disposeSources &&
        object.geometry !== sphere &&
        object.geometry !== characterSphere &&
        object.geometry !== detailSphere
      )
        sources.add(object.geometry);
      const geometry = object.geometry.clone();
      geometry.applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      const list = buckets.get(object.material) ?? [];
      const buffer = geometry.index ? geometry.toNonIndexed() : geometry;
      if (buffer !== geometry) geometry.dispose();
      list.push(buffer);
      buckets.set(object.material, list);
    }
  });
  root.clear();
  sources.forEach((geometry) => geometry.dispose());
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
export interface KartRig {
  body: THREE.Group;
  wheelMounts: THREE.Group[];
  torso: THREE.Group;
  hands: THREE.Group[];
  grips: THREE.Object3D[];
  poseHands: () => void;
  eyelids: THREE.Group[];
  gaze: THREE.Group;
  ears: THREE.Group[];
  tail: THREE.Group | null;
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
  rig: KartRig;
}
export function createKart(characterId: CharacterId, variant = 0): KartModel {
  const spec = CHARACTERS.find((c) => c.id === characterId)!,
    root = new THREE.Group(),
    body = new THREE.Group(),
    chassis = new THREE.Group();
  root.add(body);
  body.add(chassis);
  const bodyColor = new THREE.Color(spec.color);
  if (variant > 0) bodyColor.offsetHSL((variant % 3) * 0.018, 0, (variant % 2) * 0.06);
  const paint = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.36,
    metalness: 0.1,
  });
  const cream = material(0xfff0cf),
    rubber = material(0x24343e, 0.92),
    dark = material(0x234852),
    chrome = material(0xd5e6d9, 0.25),
    gold = material(0xfac757, 0.4);
  box(chassis, dark, 0, 0.38, 0, 1.8, 0.26, 3.1, 0.12);
  box(chassis, paint, 0, 0.68, 0.25, 1.78, 0.6, 2.65, 0.2);
  box(chassis, paint, 0, 0.73, 1.36, 1.62, 0.43, 0.92, 0.17);
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
  box(chassis, dark, 0, 1.24, -0.754, 0.94, 0.54, 0.14, 0.11);
  for (const side of [-1, 1]) box(chassis, dark, side * 0.46, 1.05, -0.51, 0.15, 0.32, 0.72, 0.07);
  const link = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
    const center = a.clone().add(b).multiplyScalar(0.5),
      direction = b.clone().sub(a);
    const rod = cylinder(
      chassis,
      chrome,
      center.x,
      center.y,
      center.z,
      radius,
      radius,
      direction.length(),
      8,
    );
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  };
  for (const z of [-0.98, 1.08]) {
    link(new THREE.Vector3(-1.04, 0.525, z), new THREE.Vector3(1.04, 0.525, z), 0.045);
    for (const side of [-1, 1]) {
      for (const offset of [-0.15, 0.15])
        link(
          new THREE.Vector3(side * 0.53, 0.4, z + offset),
          new THREE.Vector3(side * 0.97, 0.525, z),
          0.035,
        );
      const coilPoints: THREE.Vector3[] = [];
      for (let i = 0; i <= 36; i++) {
        const t = i / 36,
          angle = t * Math.PI * 8;
        coilPoints.push(
          new THREE.Vector3(
            side * 0.92 + Math.cos(angle) * 0.057,
            0.47 + t * 0.28,
            z + Math.sin(angle) * 0.057,
          ),
        );
      }
      const coilGeometry = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(coilPoints),
        36,
        0.016,
        4,
        false,
      );
      const coil = new THREE.Mesh(coilGeometry, gold);
      coil.castShadow = true;
      chassis.add(coil);
    }
  }
  batchStatic(chassis, true);
  const wheels: THREE.Group[] = [],
    front: THREE.Group[] = [],
    wheelMounts: THREE.Group[] = [];
  const wheelAlloy = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.48,
    metalness: 0.12,
  });
  const tireGeometry = new THREE.TorusGeometry(0.365, 0.16, 20, 20),
    rimGeometry = new THREE.TorusGeometry(0.245, 0.032, 6, 20),
    capGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 12);
  // Shallow channels are carved into the tread; the smooth outer radius stays 0.525.
  const tirePositions = tireGeometry.getAttribute('position'),
    tireNormals = tireGeometry.getAttribute('normal');
  for (let i = 0; i < tirePositions.count; i++) {
    const x = tirePositions.getX(i),
      y = tirePositions.getY(i),
      z = tirePositions.getZ(i),
      radius = Math.hypot(x, y);
    if (radius < 0.46 || Math.abs(z) < 0.02) continue;
    const delta = Math.abs(z) - 0.05,
      groove = 0.014 * Math.exp(-Math.pow(delta / 0.014, 2)),
      angle = Math.atan2(z, radius - 0.365),
      dz = 0.16 * Math.cos(angle),
      dr = -0.16 * Math.sin(angle) + ((groove * 2 * delta) / (0.014 * 0.014)) * Math.sign(z) * dz,
      normal = new THREE.Vector3((x / radius) * dz, (y / radius) * dz, -dr).normalize();
    tirePositions.setXY(i, (x * (radius - groove)) / radius, (y * (radius - groove)) / radius);
    tireNormals.setXYZ(i, normal.x, normal.y, normal.z);
  }
  for (const x of [-1.04, 1.04])
    for (const z of [-0.98, 1.08]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.525, z);
      root.add(pivot);
      wheelMounts.push(pivot);
      const wheel = new THREE.Group();
      pivot.add(wheel);
      wheels.push(wheel);
      if (z > 0) front.push(pivot);
      const tire = new THREE.Mesh(tireGeometry, rubber);
      tire.rotation.y = Math.PI / 2;
      tire.castShadow = true;
      wheel.add(tire);
      const rim = new THREE.Mesh(rimGeometry, gold);
      rim.rotation.y = Math.PI / 2;
      rim.castShadow = true;
      wheel.add(rim);
      const cap = new THREE.Mesh(capGeometry, cream);
      cap.rotation.z = Math.PI / 2;
      wheel.add(cap);
      for (const side of [-1, 1]) {
        const sidewallGeometry = new THREE.TorusGeometry(0.365, 0.012, 4, 24);
        const sidewall = new THREE.Mesh(sidewallGeometry, rubber);
        sidewall.position.x = side * 0.151;
        sidewall.rotation.y = Math.PI / 2;
        wheel.add(sidewall);
      }
      const brake = cylinder(wheel, rubber, -Math.sign(x) * 0.07, 0, 0, 0.215, 0.215, 0.026, 20);
      brake.rotation.z = Math.PI / 2;
      for (let i = 0; i < 5; i++) {
        const spoke = box(
          wheel,
          cream,
          0,
          Math.cos((i * Math.PI * 2) / 5) * 0.16,
          Math.sin((i * Math.PI * 2) / 5) * 0.16,
          0.12,
          0.18,
          0.045,
          0.015,
        );
        spoke.rotation.x = (i * Math.PI * 2) / 5;
      }
      // The two painted alloy colors share one draw call; rubber keeps its own rough finish.
      wheel.traverse((object) => {
        if (
          !(object instanceof THREE.Mesh) ||
          (object.material !== gold && object.material !== cream)
        )
          return;
        const original = object.geometry,
          geometry = original.clone(),
          color = object.material.color,
          colors = new Float32Array(geometry.getAttribute('position').count * 3);
        for (let i = 0; i < colors.length; i += 3) {
          colors[i] = color.r;
          colors[i + 1] = color.g;
          colors[i + 2] = color.b;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        object.geometry = geometry;
        object.material = wheelAlloy;
        if (original !== rimGeometry && original !== capGeometry) original.dispose();
      });
      const sourceGeometries = new Set<THREE.BufferGeometry>();
      wheel.traverse((object) => {
        if (
          object instanceof THREE.Mesh &&
          object.geometry !== tireGeometry &&
          object.geometry !== rimGeometry &&
          object.geometry !== capGeometry
        )
          sourceGeometries.add(object.geometry);
      });
      batchStatic(wheel);
      sourceGeometries.forEach((geometry) => geometry.dispose());
    }
  tireGeometry.dispose();
  rimGeometry.dispose();
  capGeometry.dispose();
  const driver = new THREE.Group();
  driver.position.set(0, 0.89, -0.32);
  body.add(driver);
  const head = new THREE.Group();
  head.position.set(0, 1.04, 0.02);
  driver.add(head);
  const headShell = new THREE.Group(),
    gaze = new THREE.Group(),
    ears: THREE.Group[] = [],
    eyelids: THREE.Group[] = [];
  head.add(headShell, gaze);
  let tailRig: THREE.Group | null = null;
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
  const clay = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.75,
    metalness: 0.02,
  });
  const bakeClay = (part: THREE.Group) => {
    const oldMaterials = new Set<THREE.Material>(),
      oldGeometries = new Set<THREE.BufferGeometry>();
    part.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        !(object.material instanceof THREE.MeshStandardMaterial) ||
        object.material.roughness < 0.3
      )
        return;
      const original = object.geometry,
        geometry = original.clone(),
        color = object.material.color,
        colors = new Float32Array(geometry.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) {
        colors[i] = color.r;
        colors[i + 1] = color.g;
        colors[i + 2] = color.b;
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      object.geometry = geometry;
      oldMaterials.add(object.material);
      object.material = clay;
      if (original !== sphere && original !== characterSphere && original !== detailSphere)
        oldGeometries.add(original);
    });
    oldGeometries.forEach((geometry) => geometry.dispose());
    const retained = new Set<THREE.Material>();
    root.traverse((object) => {
      if (object instanceof THREE.Mesh)
        for (const mat of Array.isArray(object.material) ? object.material : [object.material])
          retained.add(mat);
    });
    oldMaterials.forEach((mat) => {
      if (!retained.has(mat)) mat.dispose();
    });
  };
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
  const seatBelt = (side: number) => {
    const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.25, 0.69, 0.27),
        new THREE.Vector3(side * 0.18, 0.4, 0.395),
        new THREE.Vector3(side * 0.12, 0.14, 0.36),
      ]),
      positions: number[] = [],
      normals: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12,
        center = curve.getPoint(t),
        tangent = curve.getTangent(t),
        edge = new THREE.Vector3(tangent.y, -tangent.x, 0).normalize().multiplyScalar(0.028);
      for (const sign of [-1, 1]) {
        positions.push(center.x + edge.x * sign, center.y + edge.y * sign, center.z);
        normals.push(0, 0, 1);
        uvs.push((sign + 1) / 2, t);
      }
      if (i < 12) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    const belt = new THREE.Mesh(geometry, cream);
    driverBody.add(belt);
  };
  const eyes = (x: number, y: number, z: number, size = 1) => {
    for (const side of [-1, 1]) {
      sculpt(gaze, black, side * x, y, z, 0.052 * size, 0.069 * size, 0.03);
      sculpt(
        gaze,
        glint,
        side * x - 0.014 * size,
        y + 0.025 * size,
        z + 0.026,
        0.014 * size,
        0.018 * size,
        0.008,
      );
      sculpt(
        gaze,
        glint,
        side * x + 0.015 * size,
        y - 0.019 * size,
        z + 0.028,
        0.0055 * size,
        0.007 * size,
        0.004,
      );
      const lid = new THREE.Group();
      lid.position.set(side * x, y + 0.075 * size, z + 0.009);
      const lidMaterial =
        characterId === 'penguin' ? white : characterId === 'panda' ? deepFur : fur;
      sculpt(lid, lidMaterial, 0, -0.075 * size, 0, 0.064 * size, 0.083 * size, 0.038);
      lid.scale.y = 0.001;
      head.add(lid);
      eyelids.push(lid);
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
    const ear = new THREE.Group();
    ear.position.set(x, 0.44, -0.08);
    ear.rotation.z = tilt;
    head.add(ear);
    ears.push(ear);
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
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    tailRig = new THREE.Group();
    tailRig.position.set(0.36, 0.22, -0.22);
    mesh.position.set(-0.36, -0.22, 0.22);
    tailRig.add(mesh);
    torso.add(tailRig);
  };
  const torso = new THREE.Group(),
    driverBody = new THREE.Group();
  driver.add(torso);
  torso.add(driverBody);
  const hands: THREE.Group[] = [],
    armParts: {
      upper: THREE.Mesh;
      forearm: THREE.Mesh | null;
      shoulder: THREE.Vector3;
      side: number;
    }[] = [];
  const isPenguin = characterId === 'penguin';
  sculpt(driverBody, fur, 0, 0.35, -0.035, isPenguin ? 0.52 : 0.49, isPenguin ? 0.65 : 0.57, 0.41);
  if (isPenguin) sculpt(driverBody, white, 0, 0.29, 0.318, 0.35, 0.49, 0.13);
  else if (characterId === 'fox') sculpt(driverBody, white, 0, 0.53, 0.3, 0.29, 0.3, 0.1);
  else if (characterId === 'panda') sculpt(driverBody, deepFur, 0, 0.2, 0.24, 0.37, 0.37, 0.15);
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * 0.39, 0.59, 0.04);
    const upper = limb(
      torso,
      fur,
      shoulder.toArray(),
      [side * 0.47, 0.34, 0.42],
      isPenguin ? 0.115 : 0.14,
      isPenguin ? 0.18 : 0.14,
    );
    const pawMaterial = characterId === 'panda' ? deepFur : fur;
    const forearm = isPenguin
      ? null
      : limb(torso, pawMaterial, [side * 0.47, 0.34, 0.42], [side * 0.295, 0.41, 0.97], 0.125);
    const hand = new THREE.Group();
    hand.position.set(side * 0.295, 0.41, 0.97);
    sculpt(hand, pawMaterial, 0, 0, 0, isPenguin ? 0.1 : 0.135, 0.125, 0.12);
    if (!isPenguin) sculpt(hand, pawMaterial, -side * 0.075, -0.055, 0.035, 0.067, 0.075, 0.065);
    batchStatic(hand, true);
    torso.add(hand);
    hands.push(hand);
    armParts.push({ upper, forearm, shoulder, side });
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
    seatBelt(side);
  }
  box(driverBody, gold, 0, 0.14, 0.378, 0.1, 0.085, 0.035, 0.018);
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
    sculpt(headShell, fur, 0, 0.015, 0, 0.61, 0.51, 0.48);
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(side * 0.44, 0.34, -0.045);
      ear.rotation.z = side * -0.24;
      sculpt(ear, white, 0, 0.07, 0, 0.205, 0.235, 0.13);
      sculpt(ear, deepFur, 0, 0.08, 0.102, 0.135, 0.16, 0.045);
      head.add(ear);
      ears.push(ear);
      const cheek = sculpt(headShell, white, side * 0.285, -0.14, 0.366, 0.3, 0.235, 0.103);
      cheek.rotation.z = side * -0.23;
      const mask = sculpt(headShell, deepFur, side * 0.245, 0.025, 0.452, 0.148, 0.155, 0.038);
      mask.rotation.z = side * -0.18;
      const brow = sculpt(headShell, white, side * 0.23, 0.215, 0.407, 0.162, 0.069, 0.05);
      brow.rotation.z = side * -0.17;
    }
    eyes(0.245, 0.025, 0.492, 1.02);
    sculpt(headShell, white, 0, -0.205, 0.448, 0.27, 0.17, 0.17);
    sculpt(headShell, black, 0, -0.135, 0.607, 0.088, 0.053, 0.044);
    stroke(headShell, [
      [0, -0.177, 0.625],
      [0, -0.23, 0.612],
    ]);
    stroke(headShell, [
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
      return geometry;
    };
    const crown = new THREE.Mesh(softForm(0.595, 0.45, 0.5, 0.8), fur);
    crown.position.set(0, -0.015, 0.035);
    crown.castShadow = true;
    headShell.add(crown);
    const muzzle = new THREE.Mesh(softForm(0.505, 0.245, 0.325, 0.66), tan);
    muzzle.position.set(0, -0.165, 0.47);
    muzzle.castShadow = true;
    headShell.add(muzzle);
    for (const side of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(side * 0.455, 0.33, -0.16);
      sculpt(ear, fur, 0, 0.07, 0, 0.14, 0.17, 0.105);
      sculpt(ear, tan, 0, 0.085, 0.087, 0.079, 0.104, 0.033);
      head.add(ear);
      ears.push(ear);
      const brow = sculpt(headShell, deepFur, side * 0.4, 0.205, 0.425, 0.078, 0.018, 0.013);
      brow.rotation.z = side * -0.08;
      sculpt(headShell, deepFur, side * 0.19, -0.1, 0.799, 0.027, 0.019, 0.012);
    }
    eyes(0.405, 0.115, 0.475, 0.81);
    stroke(
      headShell,
      [
        [-0.15, -0.285, 0.784],
        [0, -0.303, 0.788],
        [0.15, -0.285, 0.784],
      ],
      0.0085,
      deepFur,
    );
    const citrus = material(0xf0a836, 0.72);
    sculpt(headShell, citrus, -0.08, 0.5, -0.06, 0.145, 0.13, 0.145);
    const leaf = sculpt(headShell, material(0x689b60), 0.025, 0.618, -0.065, 0.12, 0.023, 0.055);
    leaf.rotation.z = 0.22;
  } else if (characterId === 'fox') {
    pointedEar(-0.365, 0.17);
    pointedEar(0.365, -0.17);
    sculpt(headShell, fur, 0, 0.015, 0, 0.535, 0.485, 0.46);
    for (const side of [-1, 1]) {
      const cheek = sculpt(headShell, white, side * 0.255, -0.18, 0.34, 0.275, 0.205, 0.112);
      cheek.rotation.z = side * 0.3;
      const brow = sculpt(headShell, deepFur, side * 0.225, 0.205, 0.405, 0.095, 0.023, 0.018);
      brow.rotation.z = side * -0.18;
    }
    eyes(0.225, 0.065, 0.441, 1.0);
    sculpt(headShell, white, 0, -0.205, 0.49, 0.205, 0.145, 0.25);
    sculpt(headShell, black, 0, -0.137, 0.723, 0.077, 0.048, 0.044);
    stroke(headShell, [
      [0, -0.18, 0.747],
      [0, -0.23, 0.736],
    ]);
    stroke(headShell, [
      [-0.08, -0.253, 0.709],
      [0, -0.276, 0.726],
      [0.08, -0.253, 0.709],
    ]);
    tail(false);
  } else {
    sculpt(headShell, fur, 0, 0.015, -0.005, 0.53, 0.54, 0.455);
    for (const side of [-1, 1]) {
      const face = sculpt(headShell, white, side * 0.185, -0.075, 0.35, 0.255, 0.345, 0.115);
      face.rotation.z = side * -0.12;
    }
    sculpt(headShell, white, 0, -0.24, 0.334, 0.33, 0.255, 0.115);
    eyes(0.205, 0.045, 0.471, 1.0);
    sculpt(headShell, gold, 0, -0.11, 0.51, 0.145, 0.077, 0.16);
    sculpt(headShell, material(0xe5a74d, 0.7), 0, -0.165, 0.533, 0.107, 0.03, 0.103);
    const hat = material(0xe88a76, 0.82);
    sculpt(headShell, hat, 0, 0.47, -0.065, 0.4, 0.13, 0.35);
    sculpt(headShell, hat, 0, 0.555, -0.075, 0.31, 0.12, 0.29);
    sculpt(headShell, hat, -0.045, 0.667, -0.075, 0.086, 0.084, 0.086);
  }
  bakeClay(headShell);
  batchStatic(headShell, true);
  batchStatic(gaze, true);
  bakeClay(driverBody);
  batchStatic(driverBody, true);
  ears.forEach((ear) => {
    bakeClay(ear);
    batchStatic(ear, true);
  });
  const steering = new THREE.Group();
  steering.position.set(0, 1.3, 0.65);
  body.add(steering);
  const wheelFrame = new THREE.Group();
  wheelFrame.rotation.x = 0.7;
  steering.add(wheelFrame);
  const grips: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const grip = new THREE.Object3D();
    grip.position.x = side * 0.295;
    wheelFrame.add(grip);
    grips.push(grip);
  }
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
  // Keep grip anchors out of static merging so they follow the steering wheel.
  wheelFrame.remove(...grips);
  batchStatic(steering, true);
  wheelFrame.clear();
  wheelFrame.add(...grips);
  steering.add(wheelFrame);
  const handTarget = new THREE.Vector3(),
    elbow = new THREE.Vector3(),
    direction = new THREE.Vector3(),
    center = new THREE.Vector3(),
    up = new THREE.Vector3(0, 1, 0),
    torsoInverse = new THREE.Quaternion(),
    gripQuaternion = new THREE.Quaternion();
  const poseSegment = (
    mesh: THREE.Mesh,
    a: THREE.Vector3,
    b: THREE.Vector3,
    width: number,
    depth: number,
  ) => {
    direction.subVectors(b, a);
    center.addVectors(a, b).multiplyScalar(0.5);
    mesh.position.copy(center);
    mesh.scale.set(width, direction.length() / 2 + width * 0.35, depth);
    mesh.quaternion.setFromUnitVectors(up, direction.normalize());
  };
  const poseHands = () => {
    body.updateMatrixWorld(true);
    torso.getWorldQuaternion(torsoInverse).invert();
    for (let i = 0; i < hands.length; i++) {
      const arm = armParts[i],
        hand = hands[i];
      grips[i].getWorldPosition(handTarget);
      torso.worldToLocal(handTarget);
      hand.position.copy(handTarget);
      grips[i].getWorldQuaternion(gripQuaternion);
      hand.quaternion.copy(torsoInverse).multiply(gripQuaternion);
      if (arm.forearm) {
        elbow.copy(arm.shoulder).lerp(handTarget, 0.55);
        elbow.x += arm.side * 0.16;
        elbow.y -= 0.14;
        elbow.z -= 0.08;
        poseSegment(arm.upper, arm.shoulder, elbow, 0.14, 0.14);
        poseSegment(arm.forearm, elbow, handTarget, 0.125, 0.125);
      } else poseSegment(arm.upper, arm.shoulder, handTarget, 0.115, 0.18);
    }
  };
  poseHands();
  const rig: KartRig = {
    body,
    wheelMounts,
    torso,
    hands,
    grips,
    poseHands,
    eyelids,
    gaze,
    ears,
    tail: tailRig,
  };
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
  return { root, driver, head, wheels, front, steering, flames, shield, shadow, rig };
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
