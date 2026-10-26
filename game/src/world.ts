import * as THREE from 'three';
import {
  TRACK,
  ROAD_WIDTH,
  BOOST_PADS,
  BRIDGE_START,
  BRIDGE_END,
  angleDelta,
  mod,
  LANE_OFFSETS,
  ROUTE_GATES,
  INTERACTIONS,
  NITRO_PICKUPS,
} from './track';
import {
  createKart,
  batchStatic,
  box,
  cylinder,
  ellipsoid,
  material,
  disposeModel,
} from './models';
import type { KartModel } from './models';
import type { RaceSnapshot, Quality, CharacterId } from './types';
const up = new THREE.Vector3(0, 1, 0);
export class GameWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.15, 1300);
  private karts: KartModel[] = [];
  private roster = '';
  private sun: THREE.DirectionalLight;
  private sea: THREE.ShaderMaterial;
  private startArch: THREE.Group | null = null;
  private itemMaterial: THREE.MeshStandardMaterial;
  private itemGeometry = new THREE.BoxGeometry(1.45, 1.45, 1.45);
  private boxes: THREE.Mesh[] = [];
  private projectileMeshes = new Map<number, THREE.Group>();
  private particles: THREE.Points;
  private particlePositions = new Float32Array(180 * 3);
  private particleColors = new Float32Array(180 * 3);
  private particleLife = new Float32Array(180);
  private particleVelocity = new Float32Array(180 * 3);
  private nextParticle = 0;
  private quality: Quality | null = null;
  private cameraReady = false;
  private cameraHeading = 0;
  private cameraTarget = new THREE.Vector3();
  private lastTime = 0;
  private staticRoot = new THREE.Group();
  private flagMeshes: THREE.Mesh[] = [];
  private assistedRoot = new THREE.Group();
  private energyCrystals: THREE.Mesh[] = [];
  private laneArrows: THREE.Mesh[] = [];
  private interactionRings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.fog = new THREE.Fog(0xa6dad4, 170, 550);
    this.scene.add(new THREE.HemisphereLight(0xd8f5ff, 0xb69c72, 2.5));
    this.sun = new THREE.DirectionalLight(0xffecd0, 3.6);
    this.sun.position.set(65, 90, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top = 60;
    this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.16;
    this.scene.add(this.sun, this.sun.target);
    this.createSky();
    this.sea = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
  varying vec3 world;void main(){vec4 p=modelMatrix*vec4(position,1.);world=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
      fragmentShader: `
  varying vec3 world;uniform float time;
  void main(){float wave=sin(world.x*.15+time*.7+sin(world.z*.08))*sin(world.z*.21-time*.35);
  float crest=sin(world.x*.18+world.z*.23+sin(world.z*.12-time*.6)*1.3+time*.45);
  float glint=pow(max(0.,crest),24.)*smoothstep(-.1,.8,sin(world.x*.31+sin(world.z*.4)))*.16;
  vec3 base=mix(vec3(.025,.48,.58),vec3(.14,.72,.72),.55+wave*.15);
  float far=clamp(length(world.xz)/850.,0.,1.);base=mix(base,vec3(.57,.79,.79),far);
  gl_FragColor=vec4(base+glint,1.);#include <tonemapping_fragment>
  #include <colorspace_fragment>
  }`.replace('1.);#include', '1.);\n#include'),
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2200, 2200), this.sea);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -1.1;
    this.scene.add(sea);
    const itemTemplate = this.textPlane('?', 128, 128, '#fff9cf', '#269f98', 1, 1);
    this.itemMaterial = itemTemplate.material;
    this.itemMaterial.emissive.setHex(0x177873);
    this.itemMaterial.emissiveIntensity = 0.2;
    itemTemplate.geometry.dispose();
    this.scene.add(this.staticRoot);
    this.createIsland();
    this.createRoad();
    this.createScenery();
    batchStatic(this.staticRoot);
    this.createAssistedFeatures();
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(this.particleColors, 3));
    this.particles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({
        size: 0.3,
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
    this.particlePositions.fill(-999);
    this.setQuality('medium');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
  private createAssistedFeatures() {
    const fixed = new THREE.Group();
    const turquoise = material(0x57ead2),
      gold = material(0xffce64),
      wood = material(0x916647);
    this.assistedRoot.add(fixed);
    this.scene.add(this.assistedRoot);
    for (const gate of ROUTE_GATES) {
      for (const side of [-1, 1]) {
        const p = TRACK.at(gate.progress, LANE_OFFSETS[side + 1]);
        const group = new THREE.Group();
        group.position.set(p.x, p.y, p.z);
        group.rotation.y = p.yaw;
        fixed.add(group);
        const mat = side < 0 ? turquoise : gold;
        box(group, mat, 0, 0.09, 0, 4.1, 0.12, 5, 0);
        for (const dx of [-2.25, 2.25]) cylinder(group, wood, dx, 1.9, 0, 0.1, 0.14, 3.8, 7);
        const sign = this.textPlane(
          side < 0 ? '氮气 +35' : '能量补给',
          384,
          96,
          '#fff4d5',
          side < 0 ? '#267c76' : '#b7743d',
          4.7,
          1.18,
        );
        sign.position.set(0, 3.8, 0);
        sign.rotation.y = Math.PI;
        group.add(sign);
      }
    }
    for (const point of INTERACTIONS) {
      const p = TRACK.at(point.progress),
        group = new THREE.Group();
      group.position.set(p.x, p.y, p.z);
      group.rotation.y = p.yaw;
      fixed.add(group);
      // Painted approach stripes and a timing ring are non-colliding invitations.
      for (let j = 0; j < 3; j++) box(group, gold, 0, 0.085, -j * 3, 14 - j, 0.05, 0.35, 0);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(3.7, 4, 36),
        new THREE.MeshBasicMaterial({
          color: 0xffdc77,
          transparent: true,
          opacity: 0.68,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, p.y + 0.12, p.z);
      this.assistedRoot.add(ring);
      this.interactionRings.push(ring);
      for (const side of [-1, 1]) {
        cylinder(group, wood, side * 8, 1.4, 0, 0.1, 0.14, 2.8, 7);
        const sign = this.textPlane('F  ' + point.title, 512, 128, '#164c51', '#ffdc77', 4, 1);
        sign.position.set(side * 8, 2.9, 0);
        sign.rotation.y = Math.PI;
        group.add(sign);
      }
    }
    batchStatic(fixed);
    const crystalGeometry = new THREE.OctahedronGeometry(0.72);
    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: 0x8bffea,
      emissive: 0x19baac,
      emissiveIntensity: 0.65,
      metalness: 0.25,
      roughness: 0.15,
    });
    for (const pickup of NITRO_PICKUPS) {
      const p = TRACK.at(pickup.progress, LANE_OFFSETS[pickup.lane + 1]);
      const mesh = new THREE.Mesh(crystalGeometry, crystalMaterial);
      mesh.position.set(p.x, p.y + 1.45, p.z);
      mesh.scale.y = 1.5;
      this.assistedRoot.add(mesh);
      this.energyCrystals.push(mesh);
    }
    const shape = new THREE.Shape();
    shape.moveTo(-0.52, -0.8);
    shape.lineTo(0, -1.5);
    shape.lineTo(0.52, -0.8);
    shape.lineTo(0.22, -0.8);
    shape.lineTo(0.22, 0);
    shape.lineTo(-0.22, 0);
    shape.lineTo(-0.22, -0.8);
    shape.closePath();
    const arrowGeo = new THREE.ShapeGeometry(shape);
    for (let i = 0; i < 9; i++) {
      const mesh = new THREE.Mesh(
        arrowGeo,
        new THREE.MeshBasicMaterial({
          color: 0xa5ffee,
          transparent: true,
          opacity: 0.64,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      this.assistedRoot.add(mesh);
      this.laneArrows.push(mesh);
    }
  }
  private updateAssistedFeatures(snapshot: RaceSnapshot, time: number, visible: boolean) {
    this.assistedRoot.visible = visible && snapshot.config.driving !== 'manual';
    if (!this.assistedRoot.visible) return;
    const player = snapshot.racers[0];
    this.interactionRings.forEach((ring, i) => {
      const prompt = snapshot.interaction,
        active = prompt?.id === INTERACTIONS[i].id;
      const ready = active && prompt.available;
      ring.material.color.setHex(ready ? (prompt.perfect ? 0xf6ffcf : 0x77ffe1) : 0xffdc77);
      ring.material.opacity = ready ? 0.88 : active ? 0.76 : 0.52;
      ring.scale.setScalar(ready ? 1 + Math.sin(time * 8) * 0.035 : 1);
    });
    this.energyCrystals.forEach((mesh, i) => {
      const pickup = snapshot.pickups[i];
      mesh.visible = !!pickup && pickup.collectedLap !== player.laps;
      if (pickup) {
        const p = TRACK.at(pickup.progress, LANE_OFFSETS[pickup.lane + 1]);
        mesh.position.y = p.y + 1.5 + Math.sin(time * 2.7 + i) * 0.2;
        mesh.rotation.y = time * 1.5 + i;
      }
    });
    this.laneArrows.forEach((mesh, i) => {
      const p = TRACK.at(
        player.progress + (8 + i * 4) / TRACK.length,
        LANE_OFFSETS[player.targetLane + 1],
      );
      mesh.position.set(p.x, p.y + 0.16, p.z);
      mesh.rotation.set(-Math.PI / 2, 0, p.yaw);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.64 - i * 0.055;
    });
  }
  private createSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader:
          'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:
          'varying vec3 p;void main(){float h=clamp(normalize(p).y*1.9,0.,1.);gl_FragColor=vec4(mix(vec3(.83,.91,.84),vec3(.22,.65,.79),h),1.);}',
      }),
    );
    this.scene.add(sky);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xf8fff1, fog: true }),
      clouds = new THREE.Group();
    for (let i = 0; i < 20; i++) {
      const angle = i * 2.399,
        x = Math.cos(angle) * (260 + i * 7),
        z = Math.sin(angle) * (260 + i * 7),
        y = 50 + (i % 5) * 8;
      for (let j = 0; j < 4; j++)
        ellipsoid(clouds, cloudMat, x + j * 8, y + (j % 2) * 3, z, 11 + j, 4.5 + (j % 2) * 2, 5.5);
    }
    batchStatic(clouds);
    this.scene.add(clouds);
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(18, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff5d1, fog: false }),
    );
    sun.position.set(-250, 220, -500);
    this.scene.add(sun);
  }
  private createIsland() {
    const shape = new THREE.Shape();
    const n = 90;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2,
        r = 1 + 0.026 * Math.sin(a * 7) + 0.018 * Math.cos(a * 11),
        x = Math.cos(a) * 196 * r,
        z = Math.sin(a) * 177 * r;
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    }
    const sand = new THREE.Mesh(new THREE.ShapeGeometry(shape), material(0xe9d4a0));
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = 0.3;
    sand.receiveShadow = true;
    this.staticRoot.add(sand);
    const wet = sand.clone();
    wet.material = material(0xc7c7a0);
    wet.scale.set(1.06, 1.06, 1);
    wet.position.y = -0.45;
    this.staticRoot.add(wet);
    const foam = sand.clone();
    (foam as THREE.Mesh<THREE.BufferGeometry, THREE.Material>).material =
      new THREE.MeshBasicMaterial({ color: 0xd7f5de, transparent: true, opacity: 0.6 });
    foam.scale.set(1.08, 1.08, 1);
    foam.position.y = -0.6;
    this.staticRoot.add(foam);
    const grassShape = new THREE.Shape();
    for (let i = 0; i <= 70; i++) {
      const a = (i / 70) * Math.PI * 2,
        r = 1 + 0.07 * Math.sin(a * 5);
      const x = Math.cos(a) * 68 * r,
        z = Math.sin(a) * 70 * r;
      if (i === 0) grassShape.moveTo(x, -z);
      else grassShape.lineTo(x, -z);
    }
    const lawn = new THREE.Mesh(new THREE.ShapeGeometry(grassShape), material(0x9daf63));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = 0.36;
    this.staticRoot.add(lawn);
  }
  private ribbon(
    width: number,
    offset: number,
    mat: THREE.Material,
    height = 0.015,
    from = 0,
    to = 1,
  ) {
    const segments = Math.ceil((to - from) * 900),
      positions: number[] = [],
      uv: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const p = from + ((to - from) * i) / segments,
        a = TRACK.at(p, offset - width / 2),
        b = TRACK.at(p, offset + width / 2);
      positions.push(a.x, a.y + height, a.z, b.x, b.y + height, b.z);
      uv.push(0, (p * TRACK.length) / 9, 1, (p * TRACK.length) / 9);
      if (i < segments) {
        const k = i * 2;
        indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.receiveShadow = true;
    this.staticRoot.add(mesh);
    return mesh;
  }
  private createRoad() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ded3b1';
    ctx.fillRect(0, 0, 128, 128);
    let seed = 71;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 2300; i++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(110,91,68,.055)' : 'rgba(255,255,231,.14)';
      ctx.fillRect(rand() * 128, rand() * 128, 1 + rand() * 2, 1 + rand() * 2);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const road = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, color: 0xfff8df });
    this.ribbon(ROAD_WIDTH + 6, 0, material(0xd8b983), -0.09);
    this.ribbon(ROAD_WIDTH, 0, road, 0);
    const orange = material(0xe88862),
      cream = material(0xffefcf);
    for (const side of [-1, 1]) {
      this.ribbon(0.19, side * (ROAD_WIDTH / 2 - 0.6), cream, 0.035);
      for (let i = 0; i < 150; i++)
        this.ribbon(
          0.72,
          side * (ROAD_WIDTH / 2 + 0.35),
          i % 2 === 0 ? orange : cream,
          0.025,
          i / 150,
          (i + 1) / 150,
        );
    }
    const bridgeMat = material(0xa77e51),
      railMat = material(0xe0bf80);
    for (
      let i = Math.floor(BRIDGE_START * TRACK.length);
      i < BRIDGE_END * TRACK.length;
      i += 1.15
    ) {
      const p = TRACK.at(i / TRACK.length);
      const plank = box(
        this.staticRoot,
        bridgeMat,
        p.x,
        p.y + 0.045,
        p.z,
        ROAD_WIDTH,
        0.12,
        1.03,
        0.02,
      );
      plank.rotation.y = p.yaw;
    }
    for (let i = BRIDGE_START * TRACK.length; i < BRIDGE_END * TRACK.length; i += 5) {
      for (const side of [-1, 1]) {
        const p = TRACK.at(i / TRACK.length, side * (ROAD_WIDTH / 2 + 1));
        cylinder(this.staticRoot, railMat, p.x, p.y + 0.65, p.z, 0.16, 0.2, 1.5, 8);
      }
    }
    for (const side of [-1, 1])
      this.ribbon(0.17, side * (ROAD_WIDTH / 2 + 1), railMat, 1.1, BRIDGE_START, BRIDGE_END);
    for (const progress of BOOST_PADS) {
      const p = TRACK.at(progress),
        pad = new THREE.Group();
      pad.position.set(p.x, p.y + 0.055, p.z);
      pad.rotation.y = p.yaw;
      this.staticRoot.add(pad);
      box(pad, material(0x40b6b3), 0, 0, 0, 10, 0.035, 5, 0);
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0xe0fff2 });
      for (let i = -1; i <= 1; i++)
        for (const side of [-1, 1]) {
          const stripe = box(pad, arrowMat, side * 1.13, 0.025, i * 1.4, 2.7, 0.02, 0.33, 0);
          stripe.rotation.y = side * 0.52;
        }
    }
    const start = TRACK.at(0);
    for (let x = -4; x < 4; x++)
      for (let z = 0; z < 2; z++) {
        const p = TRACK.at((z * 1.05) / TRACK.length, x * 2 + 1);
        const tile = box(
          this.staticRoot,
          (x + z) % 2 === 0 ? material(0x395657) : cream,
          p.x,
          p.y + 0.035,
          p.z,
          2,
          0.04,
          1.05,
          0,
        );
        tile.rotation.y = p.yaw;
      }
    const arch = new THREE.Group();
    arch.position.set(start.x, start.y, start.z);
    arch.rotation.y = start.yaw;
    this.scene.add(arch);
    this.startArch = arch;
    const teal = material(0x1d747c);
    for (const x of [-10, 10]) {
      cylinder(arch, teal, x, 3, 0, 0.27, 0.36, 6);
      box(arch, cream, x, 0.25, 0, 1.3, 0.5, 1.2, 0.12);
    }
    box(arch, teal, 0, 6.1, 0, 21, 0.65, 0.6, 0.15);
    const banner = this.textPlane('PAWPRINT  PARADISE', 1024, 128, '#fcedc7', '#246671', 17, 2.15);
    banner.position.set(0, 5.4, 0.03);
    arch.add(banner);
    const back = banner.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.04;
    arch.add(back);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffda69 });
    for (let i = -4; i <= 4; i++) ellipsoid(arch, bulbMat, i * 2, 6.08, 0.34, 0.1, 0.1, 0.1);
    batchStatic(arch);
    for (let i = 0; i < 8; i++) {
      const p = TRACK.at(-(8 + Math.floor(i / 2) * 6) / TRACK.length, i % 2 === 0 ? -2.5 : 2.5),
        line = box(this.staticRoot, cream, p.x, p.y + 0.028, p.z, 3.7, 0.035, 0.12, 0);
      line.rotation.y = p.yaw;
    }
  }
  private textPlane(
    text: string,
    w: number,
    h: number,
    foreground: string,
    background: string,
    width: number,
    height: number,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = foreground;
    ctx.font = '900 ' + Math.round(h * 0.55) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h * 0.52, w * 0.93);
    return this.canvasPlane(canvas, width, height);
  }
  private turnSign(direction: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e7825d';
    ctx.fillRect(0, 0, 256, 100);
    ctx.strokeStyle = '#fff1cd';
    ctx.lineWidth = 11;
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const x of [52, 128, 204]) {
      ctx.beginPath();
      ctx.moveTo(x - direction * 15, 23);
      ctx.lineTo(x + direction * 15, 50);
      ctx.lineTo(x - direction * 15, 77);
      ctx.stroke();
    }
    return this.canvasPlane(canvas, 3.2, 1.2);
  }
  private canvasPlane(canvas: HTMLCanvasElement, width: number, height: number) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, side: THREE.DoubleSide }),
    );
  }
  private createScenery() {
    let seed = 28;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const trunkMat = material(0x96764a),
      leafMat = material(0x3c9071),
      leafLight = material(0x73ad70),
      rockMat = material(0xc1a477),
      rockLight = material(0xdcc599),
      grass = material(0x95ae60),
      wood = material(0x946b47),
      cream = material(0xffe6b2),
      coral = material(0xe98b64),
      teal = material(0x429999);
    const palm = (x: number, z: number, scale: number) => {
      const tree = new THREE.Group();
      tree.position.set(x, 0.3, z);
      tree.scale.setScalar(scale);
      tree.rotation.y = rand() * 6.28;
      this.staticRoot.add(tree);
      const lean = rand() * 0.9 - 0.45;
      for (let i = 0; i < 6; i++) {
        const trunk = cylinder(
          tree,
          trunkMat,
          lean * i * i * 0.055,
          i * 1.05 + 0.5,
          0,
          0.25 - i * 0.018,
          0.32 - i * 0.018,
          1.1,
          7,
        );
        trunk.rotation.z = -lean * i * 0.08;
      }
      const topX = lean * 36 * 0.055,
        topY = 6.45;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2,
          positions: number[] = [],
          indices: number[] = [];
        for (let j = 0; j <= 7; j++) {
          const t = j / 7,
            l = t * 4.7,
            y = topY + Math.sin(t * Math.PI) * 1.1 - t * 1.65,
            half = Math.sin(t * Math.PI) * 0.57;
          for (const s of [-1, 1])
            positions.push(
              topX + Math.sin(a) * l + Math.cos(a) * half * s,
              y,
              z * 0 + Math.cos(a) * l - Math.sin(a) * half * s,
            );
          if (j < 7) {
            const k = j * 2;
            indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        g.setIndex(indices);
        g.computeVertexNormals();
        g.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2),
        );
        const m = i % 2 ? leafMat : leafLight;
        m.side = THREE.DoubleSide;
        const mesh = new THREE.Mesh(g, m);
        tree.add(mesh);
      }
      for (let i = 0; i < 3; i++)
        ellipsoid(
          tree,
          wood,
          topX + Math.sin(i * 2) * 0.35,
          6.1,
          Math.cos(i * 2) * 0.35,
          0.23,
          0.29,
          0.23,
        );
    };
    for (let i = 0; i < 100; i++) {
      const x = (rand() - 0.5) * 354,
        z = (rand() - 0.5) * 318;
      if ((x / 183) ** 2 + (z / 162) ** 2 > 1.04 || TRACK.nearest(x, z).distance < 17) continue;
      palm(x, z, 0.7 + rand() * 0.7);
    }
    // Roadside groves provide near-field parallax and frame the bends.
    for (let i = 0; i < 45; i++) {
      const p = TRACK.at(i / 45, (i % 2 === 0 ? 1 : -1) * (18 + (i % 3) * 3));
      if ((p.x / 183) ** 2 + (p.z / 164) ** 2 < 1.02 && TRACK.nearest(p.x, p.z).distance > 15)
        palm(p.x, p.z, 0.9 + (i % 4) * 0.13);
    }
    const flowerPink = material(0xe99593),
      flowerGold = material(0xf2c862),
      darkGreen = material(0x538767);
    for (let i = 0; i < 100; i++) {
      const p = TRACK.at(i / 100, (i % 2 === 0 ? 1 : -1) * (14.5 + (i % 4) * 0.7));
      if (TRACK.nearest(p.x, p.z).distance < 12) continue;
      const shrub = ellipsoid(this.staticRoot, darkGreen, p.x, 0.9, p.z, 0.65, 0.55, 0.65);
      for (let j = 0; j < 3; j++)
        ellipsoid(
          this.staticRoot,
          i % 3 === 0 ? flowerPink : flowerGold,
          p.x + Math.sin(j * 2.1) * 0.45,
          1.23,
          p.z + Math.cos(j * 2.1) * 0.45,
          0.16,
          0.13,
          0.16,
        );
    }
    // Warm sandstone bluffs make the northern switchbacks a distinct landmark.
    const cliffMats = [material(0xc58960), material(0xd69b70), material(0xe4b389)];
    for (let i = 0; i < 11; i++) {
      const p = TRACK.at(0.44 + i * 0.017, 22 + (i % 2) * 4);
      if (TRACK.nearest(p.x, p.z).distance < 17) continue;
      const cliff = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), cliffMats[i % 3]);
      cliff.position.set(p.x, 3.5, p.z);
      cliff.scale.set(7 + (i % 3) * 1.7, 6 + (i % 4) * 1.6, 8);
      cliff.rotation.y = i * 0.6;
      this.staticRoot.add(cliff);
      ellipsoid(this.staticRoot, grass, p.x, 8 + (i % 4), p.z, 5, 0.9, 5);
    }
    for (let i = 0; i < 32; i++) {
      const x = (rand() - 0.5) * 330,
        z = (rand() - 0.5) * 292;
      if (TRACK.nearest(x, z).distance < 21) continue;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1, 0),
        i % 2 ? rockMat : rockLight,
      );
      rock.position.set(x, 1 + rand(), z);
      rock.scale.set(2 + rand() * 6, 1 + rand() * 4, 2 + rand() * 5);
      rock.rotation.set(rand(), rand() * 6, rand());
      this.staticRoot.add(rock);
      for (let j = 0; j < 3; j++)
        ellipsoid(this.staticRoot, grass, x + j * 1.4, 0.6, z - j, 1.3, 1, 1.4);
    }
    // A compact waterside village in the infield, clear of every racing line.
    const hut = (x: number, z: number, angle: number, color: THREE.Material) => {
      const group = new THREE.Group();
      group.position.set(x, 0.5, z);
      group.rotation.y = angle;
      this.staticRoot.add(group);
      box(group, color, 0, 2.3, 0, 7, 4.5, 6, 0.15);
      box(group, wood, 0, 1.55, 3.05, 1.6, 3.1, 0.12, 0.04);
      for (const xx of [-2.4, 2.4]) {
        box(group, cream, xx, 2.5, 3.08, 1.3, 1.5, 0.12, 0.04);
        box(group, teal, xx, 2.5, 3.17, 0.91, 1.1, 0.05, 0.02);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(6.1, 3.3, 4), material(0xbd8e55));
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 6;
      roof.scale.z = 0.9;
      group.add(roof);
      for (let i = -3; i <= 3; i++) {
        const beam = box(group, wood, i, 4.25, 3.55, 0.12, 0.12, 1.3, 0.015);
      }
      box(group, cream, 0, 0.15, 3.8, 9, 0.3, 2, 0.08);
    };
    hut(-20, 40, -0.25, cream);
    hut(-38, 25, -0.5, coral);
    hut(-8, 20, 0.35, teal);
    const hutSign = this.textPlane('COCONUT CLUB', 512, 96, '#fff0cb', '#4d8573', 8, 1.5);
    hutSign.position.set(-19, 4.5, 44);
    this.staticRoot.add(hutSign);
    // Beach umbrellas, chairs and a lifeguard hut on the sunny coast.
    for (let i = 0; i < 8; i++) {
      const x = 40 + i * 14,
        z = 144 - i * 3;
      if (TRACK.nearest(x, z).distance < 17) continue;
      cylinder(this.staticRoot, cream, x, 2, z, 0.06, 0.06, 4, 6);
      const canopy = new THREE.Mesh(new THREE.ConeGeometry(3, 1.2, 10), i % 2 ? coral : teal);
      canopy.position.set(x, 4, z);
      this.staticRoot.add(canopy);
      const chair = box(this.staticRoot, cream, x + 2, 0.6, z + 1, 1.3, 0.12, 2.9, 0.04);
      chair.rotation.x = -0.18;
    }
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), rockMat);
    rock.position.set(-190, 3, -115);
    rock.scale.set(18, 9, 14);
    this.staticRoot.add(rock);
    // Outside islands and small sailboats give the horizon depth.
    for (let i = 0; i < 5; i++) {
      ellipsoid(this.staticRoot, rockLight, 260 + i * 47, 0, -220 - (i % 2) * 45, 30, 7 + i, 19);
      ellipsoid(this.staticRoot, grass, 260 + i * 47, 5, -220 - (i % 2) * 45, 18, 5, 13);
    }
    for (let i = 0; i < 4; i++) {
      const boat = new THREE.Group();
      boat.position.set(230 + i * 48, 0, 80 - i * 80);
      boat.rotation.y = i;
      this.staticRoot.add(boat);
      ellipsoid(boat, coral, 0, -0.4, 0, 1.6, 0.8, 4.1);
      cylinder(boat, wood, 0, 5, 0, 0.08, 0.12, 10, 7);
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.Float32BufferAttribute([0, 9, 0, 0, 1.2, 0, 0, 1.2, 5], 3),
      );
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0], 2));
      g.computeVertexNormals();
      const sailMat = material(0xfff4d5);
      sailMat.side = THREE.DoubleSide;
      boat.add(new THREE.Mesh(g, sailMat));
    }
    // Curved guardrails line the edges, matching the collision boundary.
    for (let i = 0; i < TRACK.length; i += 6) {
      const progress = i / TRACK.length;
      if (progress > BRIDGE_START && progress < BRIDGE_END) continue;
      for (const side of [-1, 1]) {
        const p = TRACK.at(progress, side * (ROAD_WIDTH / 2 + 5));
        cylinder(this.staticRoot, wood, p.x, p.y + 0.45, p.z, 0.095, 0.13, 0.95, 6);
        const q = TRACK.at((i + 6) / TRACK.length, side * (ROAD_WIDTH / 2 + 5)),
          beam = box(
            this.staticRoot,
            cream,
            (p.x + q.x) / 2,
            (p.y + q.y) / 2 + 0.7,
            (p.z + q.z) / 2,
            0.14,
            0.16,
            Math.hypot(q.x - p.x, q.z - p.z),
            0,
          );
        beam.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      }
    }
    for (const progress of [0.12, 0.31, 0.49, 0.62, 0.79, 0.91]) {
      const p = TRACK.at(progress, -11),
        bend = angleDelta(TRACK.at(progress + 0.025).yaw, p.yaw),
        sign = this.turnSign(bend > 0 ? -1 : 1);
      sign.position.set(p.x, p.y + 1.55, p.z);
      sign.rotation.y = p.yaw + Math.PI;
      this.staticRoot.add(sign);
      cylinder(this.staticRoot, wood, p.x, p.y + 0.7, p.z, 0.075, 0.075, 1.4, 6);
    }
    // Bunting at the village and the starting straight.
    for (const progress of [0.97, 0.46]) {
      const a = TRACK.at(progress, -12),
        b = TRACK.at(progress, 12);
      for (const p of [a, b]) cylinder(this.staticRoot, wood, p.x, p.y + 3.6, p.z, 0.12, 0.16, 7.2);
      for (let i = 0; i < 13; i++) {
        const t = (i + 1) / 14,
          x = a.x + (b.x - a.x) * t,
          z = a.z + (b.z - a.z) * t,
          y = a.y + 6.8 - Math.sin(t * Math.PI) * 1.3;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([-0.65, 0, 0, 0.65, 0, 0, 0, -0.9, 0], 3),
        );
        geom.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
        geom.computeVertexNormals();
        const flag = new THREE.Mesh(
          geom,
          new THREE.MeshStandardMaterial({
            color: [0xe9876c, 0x61b2ac, 0xf6d369][i % 3],
            side: THREE.DoubleSide,
            roughness: 1,
          }),
        );
        flag.position.set(x, y, z);
        flag.rotation.y = a.yaw;
        this.scene.add(flag);
        this.flagMeshes.push(flag);
      }
    }
  }
  private ensureRoster(snapshot: RaceSnapshot) {
    const roster = snapshot.racers.map((r) => r.characterId).join(',');
    if (this.roster === roster) return;
    for (const kart of this.karts) {
      this.scene.remove(kart.root);
      disposeModel(kart.root);
    }
    this.karts = snapshot.racers.map((r) => {
      const kart = createKart(r.characterId, r.id);
      this.scene.add(kart.root);
      return kart;
    });
    this.roster = roster;
    this.cameraReady = false;
  }
  setQuality(quality: Quality) {
    if (this.quality === quality) return;
    this.quality = quality;
    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio,
        quality === 'high' ? 1.75 : quality === 'medium' ? 1.35 : 1,
      ),
    );
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.sun.shadow.mapSize.setScalar(quality === 'high' ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize();
  }
  resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  resetCamera() {
    this.cameraReady = false;
  }
  portraits(): Record<CharacterId, string> {
    const oldSize = this.renderer.getSize(new THREE.Vector2()),
      oldPixel = this.renderer.getPixelRatio(),
      scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdcece8);
    scene.add(new THREE.HemisphereLight(0xeafaff, 0xc9a078, 3));
    const light = new THREE.DirectionalLight(0xfff1d7, 4);
    light.position.set(4, 7, 5);
    scene.add(light);
    const cam = new THREE.PerspectiveCamera(35, 2, 0.1, 30);
    cam.position.set(1.15, 2.55, 2.9);
    cam.lookAt(0, 2.0, -0.15);
    const result = {} as Record<CharacterId, string>;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(512, 256, false);
    for (const id of ['panda', 'capybara', 'fox', 'penguin'] as CharacterId[]) {
      const kart = createKart(id);
      scene.add(kart.root);
      this.renderer.render(scene, cam);
      result[id] = this.canvas.toDataURL('image/png');
      scene.remove(kart.root);
      disposeModel(kart.root);
    }
    this.renderer.setPixelRatio(oldPixel);
    this.renderer.setSize(oldSize.x, oldSize.y, false);
    return result;
  }
  update(
    snapshot: RaceSnapshot,
    time: number,
    alpha: number,
    mode: 'race' | 'menu' | 'results' = 'race',
  ) {
    this.ensureRoster(snapshot);
    this.updateAssistedFeatures(snapshot, time, mode === 'race');
    if (this.startArch) this.startArch.visible = mode !== 'menu';
    const dt = Math.min(0.05, time - this.lastTime || 0.016);
    this.lastTime = time;
    this.sea.uniforms.time.value = time;
    for (let i = 0; i < this.karts.length; i++) {
      const kart = this.karts[i],
        r = snapshot.racers[i];
      const x = r.previousX + (r.x - r.previousX) * alpha,
        z = r.previousZ + (r.z - r.previousZ) * alpha,
        yaw = r.previousYaw + angleDelta(r.yaw, r.previousYaw) * alpha;
      const actionProgress = r.actionTime > 0 ? 1 - r.actionTime / r.actionDuration : 0;
      const jump =
        r.actionKind === 'jump' || r.actionKind === 'spin'
          ? Math.sin(actionProgress * Math.PI) * 2.6
          : 0;
      kart.root.position.set(
        x,
        TRACK.height(x, z) +
          jump +
          Math.sin(time * 22 + i) * Math.min(0.018, Math.abs(r.speed) * 0.0007),
        z,
      );
      kart.root.rotation.y =
        yaw +
        (r.actionKind === 'spin'
          ? actionProgress * Math.PI * 2
          : r.actionKind === 'drift'
            ? Math.sin(actionProgress * Math.PI) * 0.45
            : 0);
      const moving = Math.min(1, Math.abs(r.speed) / 20),
        hitReaction = Math.min(1, r.stun / 0.3);
      kart.root.rotation.x =
        r.actionKind === 'jump'
          ? -Math.sin(actionProgress * Math.PI * 2) * 0.13
          : r.boost > 0
            ? -0.018 * moving
            : 0;
      kart.root.rotation.z =
        -r.steer * moving * 0.035 + Math.sin(time * 24 + i) * hitReaction * 0.025;
      kart.shadow.position.y = 0.018 - jump;
      (kart.shadow.material as THREE.MeshBasicMaterial).opacity = 0.19 * (1 - jump * 0.17);
      kart.driver.rotation.z = -r.steer * Math.min(0.1, Math.abs(r.speed) * 0.004);
      kart.driver.rotation.x = Math.sin(time * 5 + i) * 0.015;
      kart.head.rotation.y = r.steer * 0.13;
      kart.head.rotation.z = Math.sin(time * 2.7 + i) * 0.035;
      if (mode === 'results') {
        kart.driver.position.y = 0.89 + Math.sin(time * 5 + i) * 0.06;
        kart.head.rotation.z = Math.sin(time * 5 + i) * 0.12;
      }
      for (const wheel of kart.wheels) wheel.rotation.x += r.speed * dt * 2.1;
      for (const wheel of kart.front) wheel.rotation.y = r.steer * 0.36;
      kart.steering.rotation.z = -r.steer * 0.5;
      kart.shield.visible = r.shield > 0;
      kart.shield.rotation.y = time * 0.5;
      for (const flame of kart.flames) {
        flame.visible = r.boost > 0;
        flame.scale.y = 1 + Math.sin(time * 50) * 0.3;
        flame.scale.x = 0.85 + Math.sin(time * 40) * 0.15;
      }
      if (r.drifting && this.quality !== 'low' && snapshot.phase === 'racing')
        for (const side of [-1, 1])
          this.emitParticle(
            x + Math.cos(yaw) * side,
            z - Math.sin(yaw) * side,
            TRACK.height(x, z) + 0.16,
            r.driftCharge >= 1.8 ? 0xffba55 : 0x6ef5ff,
            yaw,
          );
      if (r.offroad && r.speed > 7 && this.quality !== 'low' && snapshot.phase === 'racing')
        this.emitParticle(x, z, TRACK.height(x, z) + 0.14, 0xe6cc99, yaw);
    }
    while (this.boxes.length < snapshot.boxes.length) {
      const mesh = new THREE.Mesh(this.itemGeometry, this.itemMaterial);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.boxes.push(mesh);
    }
    for (let i = 0; i < this.boxes.length; i++) {
      const mesh = this.boxes[i],
        box = snapshot.boxes[i];
      mesh.visible = !!box && box.cooldown <= 0;
      if (box) {
        const p = TRACK.at(box.progress, box.offset);
        mesh.position.set(p.x, p.y + 1.3 + Math.sin(time * 2.5 + i) * 0.18, p.z);
        mesh.rotation.set(0.1, time * 0.6 + i, 0.1);
      }
    }
    const activeProjectiles = new Set<number>();
    for (const projectile of snapshot.projectiles) {
      activeProjectiles.add(projectile.id);
      let group = this.projectileMeshes.get(projectile.id);
      if (!group) {
        group = new THREE.Group();
        if (projectile.type === 'water') {
          ellipsoid(
            group,
            new THREE.MeshStandardMaterial({
              color: 0x67d7ef,
              emissive: 0x156890,
              emissiveIntensity: 0.6,
              transparent: true,
              opacity: 0.9,
              roughness: 0.15,
            }),
            0,
            0,
            0,
            0.6,
            0.6,
            0.6,
          );
        } else {
          const mat = material(0xffd459);
          for (let i = 0; i < 3; i++) {
            const peel = ellipsoid(
              group,
              mat,
              Math.sin(i * 2.1) * 0.4,
              0.15,
              Math.cos(i * 2.1) * 0.4,
              0.16,
              0.15,
              0.65,
            );
            peel.rotation.y = i * 2.1;
          }
          ellipsoid(group, mat, 0, 0.45, 0, 0.12, 0.35, 0.12);
        }
        this.projectileMeshes.set(projectile.id, group);
        this.scene.add(group);
      }
      group.position.set(
        projectile.x,
        TRACK.height(projectile.x, projectile.z) + (projectile.type === 'water' ? 1 : 0.15),
        projectile.z,
      );
      group.rotation.y = time * 4;
    }
    for (const [id, group] of this.projectileMeshes)
      if (!activeProjectiles.has(id)) {
        this.scene.remove(group);
        disposeModel(group);
        this.projectileMeshes.delete(id);
      }
    for (let i = 0; i < this.flagMeshes.length; i++)
      this.flagMeshes[i].rotation.x = Math.sin(time * 2 + i * 0.7) * 0.12;
    this.updateParticles(dt);
    const player = snapshot.racers[0],
      playerX = player.previousX + (player.x - player.previousX) * alpha,
      playerZ = player.previousZ + (player.z - player.previousZ) * alpha,
      position = new THREE.Vector3(playerX, TRACK.height(playerX, playerZ), playerZ),
      viewYaw =
        mode === 'race' && snapshot.config.driving !== 'manual'
          ? TRACK.at(player.progress).yaw
          : player.yaw;
    this.cameraHeading = this.cameraReady
      ? this.cameraHeading + angleDelta(viewYaw, this.cameraHeading) * (1 - Math.exp(-dt * 7))
      : viewYaw;
    const forward = new THREE.Vector3(
        Math.sin(this.cameraHeading),
        0,
        Math.cos(this.cameraHeading),
      ),
      left = new THREE.Vector3(Math.cos(this.cameraHeading), 0, -Math.sin(this.cameraHeading));
    let desired: THREE.Vector3, target: THREE.Vector3;
    if (mode === 'menu') {
      const p = TRACK.at(player.progress),
        f = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)),
        r = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      desired = position
        .clone()
        .addScaledVector(f, 10)
        .addScaledVector(r, 11)
        .add(new THREE.Vector3(0, 6.3, 0));
      target = position
        .clone()
        .addScaledVector(f, -3)
        .addScaledVector(r, -1.5)
        .add(new THREE.Vector3(0, 1.2, 0));
    } else if (mode === 'results') {
      desired = position
        .clone()
        .addScaledVector(forward, 7.8)
        .addScaledVector(left, 5)
        .add(new THREE.Vector3(0, 4, 0));
      target = position.clone().add(new THREE.Vector3(0, 1.3, 0));
    } else {
      desired = position
        .clone()
        .addScaledVector(forward, -8.1 - (player.boost > 0 ? 0.6 : 0))
        .add(new THREE.Vector3(0, 4.35, 0));
      const jump =
        (player.actionKind === 'jump' || player.actionKind === 'spin') && player.actionTime > 0
          ? Math.sin((1 - player.actionTime / player.actionDuration) * Math.PI) * 0.8
          : 0;
      target = position
        .clone()
        .addScaledVector(forward, 7)
        .add(new THREE.Vector3(0, 1.35 + jump, 0));
    }
    if (!this.cameraReady) {
      this.camera.position.copy(desired);
      this.cameraTarget.copy(target);
      this.cameraReady = true;
    } else {
      this.camera.position.lerp(desired, 1 - Math.exp(-dt * (mode === 'race' ? 8 : 2.5)));
      this.cameraTarget.lerp(target, 1 - Math.exp(-dt * (mode === 'race' ? 10 : 3)));
    }
    this.camera.lookAt(this.cameraTarget);
    const fov =
      mode === 'race' ? 58 + (Math.abs(player.speed) / 40) * 5 + (player.boost > 0 ? 5 : 0) : 48;
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
    this.camera.updateProjectionMatrix();
    this.sun.position.copy(position).add(new THREE.Vector3(55, 85, 35));
    this.sun.target.position.copy(position);
    this.renderer.render(this.scene, this.camera);
  }
  private emitParticle(x: number, z: number, y: number, color: number, yaw: number) {
    const i = this.nextParticle++ % 180,
      c = new THREE.Color(color);
    this.particlePositions.set([x, y, z], i * 3);
    this.particleColors.set([c.r, c.g, c.b], i * 3);
    this.particleVelocity.set(
      [
        -Math.sin(yaw) * 2 + (Math.random() - 0.5) * 2,
        1 + Math.random(),
        -Math.cos(yaw) * 2 + (Math.random() - 0.5) * 2,
      ],
      i * 3,
    );
    this.particleLife[i] = 0.35 + Math.random() * 0.25;
  }
  private updateParticles(dt: number) {
    for (let i = 0; i < 180; i++) {
      if (this.particleLife[i] > 0) {
        this.particleLife[i] -= dt;
        for (let j = 0; j < 3; j++)
          this.particlePositions[i * 3 + j] += this.particleVelocity[i * 3 + j] * dt;
        this.particleVelocity[i * 3 + 1] -= 3 * dt;
      } else this.particlePositions[i * 3 + 1] = -999;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
    this.particles.geometry.attributes.color.needsUpdate = true;
  }
  getStats() {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }
}
