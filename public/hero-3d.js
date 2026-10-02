// Fundo 3D do hero (WebGL). Se o WebGL ou o CDN falharem, o fundo 2D de hero-bg.js continua ativo.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/+esm';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/postprocessing/EffectComposer.js/+esm';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/postprocessing/RenderPass.js/+esm';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/postprocessing/UnrealBloomPass.js/+esm';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/postprocessing/OutputPass.js/+esm';

const TAU = Math.PI * 2;
const BG = '#07050b';

function roundedRect(target, size, radius) {
  const h = size / 2;
  target.moveTo(-h + radius, -h);
  target.lineTo(h - radius, -h);
  target.quadraticCurveTo(h, -h, h, -h + radius);
  target.lineTo(h, h - radius);
  target.quadraticCurveTo(h, h, h - radius, h);
  target.lineTo(-h + radius, h);
  target.quadraticCurveTo(-h, h, -h, h - radius);
  target.lineTo(-h, -h + radius);
  target.quadraticCurveTo(-h, -h, -h + radius, -h);
  return target;
}

function glyphGeometry() {
  const frame = roundedRect(new THREE.Shape(), 2.25, 0.72);
  frame.holes.push(roundedRect(new THREE.Path(), 1.75, 0.47));
  const lens = new THREE.Shape().absarc(0, 0, 0.61, 0, TAU, false);
  lens.holes.push(new THREE.Path().absarc(0, 0, 0.36, 0, TAU, true));
  const dot = new THREE.Shape().absarc(0.61, 0.61, 0.155, 0, TAU, false);
  const geometry = new THREE.ExtrudeGeometry([frame, lens, dot], {
    depth: 0.18, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.045, bevelSegments: 5, curveSegments: 48,
  });
  geometry.center();
  return geometry;
}

function tileGeometry() {
  const geometry = new THREE.ExtrudeGeometry(roundedRect(new THREE.Shape(), 3, 0.85), {
    depth: 0.45, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.14, bevelSegments: 6, curveSegments: 32,
  });
  geometry.center();
  return geometry;
}

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.bezierCurveTo(-1.6, 0.1, -1.1, 1.3, -0.5, 1.2);
  s.bezierCurveTo(-0.2, 1.15, 0, 0.9, 0, 0.7);
  s.bezierCurveTo(0, 0.9, 0.2, 1.15, 0.5, 1.2);
  s.bezierCurveTo(1.1, 1.3, 1.6, 0.1, 0, -0.9);
  const geometry = new THREE.ExtrudeGeometry(s, {
    depth: 0.35, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.14, bevelSegments: 6, curveSegments: 32,
  });
  geometry.center();
  return geometry;
}

function gradientTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(130, 560, 0, 130, 560, 720);
  g.addColorStop(0, '#fdf497');
  g.addColorStop(0.08, '#fdf497');
  g.addColorStop(0.42, '#fd5949');
  g.addColorStop(0.62, '#d6249f');
  g.addColorStop(0.95, '#285aeb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  // as faces do extrude usam as coordenadas x/y como UV: mapeia [-1.5, 1.5] para [0, 1]
  texture.repeat.set(1 / 3, 1 / 3);
  texture.offset.set(0.5, 0.5);
  return texture;
}

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function environment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: '#3a1850', side: THREE.BackSide })));
  const softbox = (color, intensity, position, size) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size[0], size[1]),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    mesh.position.set(...position);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  };
  softbox('#ff2d8a', 9, [-9, 4, 8], [12, 10]);
  softbox('#ff8a3d', 8, [9, -3, 8], [10, 12]);
  softbox('#8b5cf6', 7, [0, 10, 2], [14, 5]);
  softbox('#ffffff', 6, [3, 6, 12], [8, 3]);
  softbox('#3b5bff', 4, [-6, -8, 4], [12, 5]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  return texture;
}

function main() {
  const canvas = document.getElementById('hero-3d');
  if (!canvas) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, 0.05);
  scene.environment = environment(renderer);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  const pink = new THREE.PointLight('#ff3d8b', 70, 30);
  pink.position.set(-6, 4, 6);
  const orange = new THREE.PointLight('#ff8a3d', 55, 30);
  orange.position.set(6, -3, 6);
  scene.add(pink, orange, new THREE.AmbientLight('#2a1638', 1));

  const glyph = glyphGeometry();
  const tile = tileGeometry();
  const heart = heartGeometry();
  const chrome = new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 1, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 2 });
  const iridescent = new THREE.MeshPhysicalMaterial({ color: '#ffd6f0', metalness: 0.8, roughness: 0.2, iridescence: 1, iridescenceIOR: 1.7, envMapIntensity: 1.8 });
  const tileMaterial = new THREE.MeshPhysicalMaterial({ map: gradientTexture(), roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 });
  const whiteGloss = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.2, clearcoat: 1, emissive: '#ffffff', emissiveIntensity: 0.15 });
  const heartMaterial = new THREE.MeshPhysicalMaterial({ color: '#ff2d6f', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#ff1a5a', emissiveIntensity: 0.35 });

  const makers = {
    chrome: () => new THREE.Mesh(glyph, chrome),
    iridescent: () => new THREE.Mesh(glyph, iridescent),
    app: () => {
      const group = new THREE.Group();
      const front = new THREE.Mesh(glyph, whiteGloss);
      front.scale.setScalar(0.78);
      front.position.z = 0.42;
      group.add(new THREE.Mesh(tile, tileMaterial), front);
      return group;
    },
    heart: () => new THREE.Mesh(heart, heartMaterial),
  };

  // posições em coordenadas de tela (-1..1) — o centro fica livre para o texto
  const LAYOUT = [
    { kind: 'chrome', nx: 0.72, ny: -0.42, z: 0, scale: 1.55, spin: 0.22 },
    { kind: 'app', nx: -0.74, ny: 0.4, z: -2, scale: 0.85 },
    { kind: 'iridescent', nx: -0.62, ny: -0.58, z: 1.5, scale: 0.62 },
    { kind: 'app', nx: 0.6, ny: 0.62, z: -5, scale: 0.55 },
    { kind: 'heart', nx: 0.38, ny: 0.78, z: 2, scale: 0.32 },
    { kind: 'heart', nx: -0.42, ny: -0.86, z: 3, scale: 0.26 },
    { kind: 'heart', nx: 0.92, ny: 0.12, z: -1, scale: 0.4 },
    { kind: 'heart', nx: -0.95, ny: -0.1, z: -3, scale: 0.45 },
    { kind: 'chrome', nx: -0.25, ny: 0.85, z: -9, scale: 0.8, spin: -0.15 },
    { kind: 'app', nx: 0.2, ny: -0.88, z: -10, scale: 0.7 },
    { kind: 'iridescent', nx: 0.95, ny: -0.9, z: -8, scale: 0.9 },
    { kind: 'heart', nx: -0.7, ny: 0.92, z: -7, scale: 0.5 },
  ];
  const objects = LAYOUT.map((spec, i) => {
    const mesh = makers[spec.kind]();
    mesh.scale.setScalar(spec.scale);
    mesh.userData = { ...spec, phase: i * 1.7, tilt: (i % 2 ? 1 : -1) * (0.25 + (i % 3) * 0.1) };
    scene.add(mesh);
    return mesh;
  });

  const dot = softDot();
  const makeParticles = (count, size, opacity, spread) => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = ['#ff4d9d', '#ff9a4d', '#a78bfa', '#ffffff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * spread[0];
      positions[i * 3 + 1] = (Math.random() - 0.5) * spread[1];
      positions[i * 3 + 2] = -14 + Math.random() * 18;
      palette[i % palette.length].toArray(colors, i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      size, map: dot, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    scene.add(points);
    return points;
  };
  const dust = makeParticles(500, 0.09, 0.9, [30, 18]);
  const bokeh = makeParticles(40, 1.1, 0.18, [30, 18]);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.6, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function layout() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const narrow = camera.aspect < 0.9;
    for (const mesh of objects) {
      const { nx, ny, z } = mesh.userData;
      const dist = camera.position.z - z;
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
      const halfW = halfH * camera.aspect;
      // no celular, empurra os objetos para as bordas superior/inferior em vez das laterais
      mesh.userData.x = nx * halfW * (narrow ? 0.9 : 1);
      mesh.userData.y = ny * halfH * (narrow ? 1.05 : 1);
      mesh.visible = !narrow || Math.abs(ny) > 0.5 || z < -4;
    }
  }

  let mouseX = 0, mouseY = 0;
  window.addEventListener('pointermove', (e) => {
    mouseX = e.clientX / window.innerWidth - 0.5;
    mouseY = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  const clock = new THREE.Clock();
  function render() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    camera.position.x += (mouseX * 1.2 - camera.position.x) * 0.03;
    camera.position.y += (-mouseY * 0.8 - camera.position.y) * 0.03;
    camera.position.z = 14 + Math.sin(t * 0.12) * 0.6;
    camera.lookAt(0, 0, 0);

    for (const mesh of objects) {
      const u = mesh.userData;
      mesh.position.set(u.x, u.y + Math.sin(t * 0.6 + u.phase) * 0.25, u.z);
      // balança em vez de girar 360°: de perfil o logo some
      const swing = u.spin ? Math.sin(t * Math.abs(u.spin) * 1.6 + u.phase) * 0.75 : Math.sin(t * 0.35 + u.phase) * 0.45;
      mesh.rotation.y = swing + u.tilt * 0.6;
      mesh.rotation.x = Math.sin(t * 0.27 + u.phase) * 0.25;
      mesh.rotation.z = Math.sin(t * 0.18 + u.phase) * 0.12;
    }

    for (const points of [dust, bokeh]) {
      const pos = points.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * (0.15 + (i % 5) * 0.05);
        if (y > 9) y = -9;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }

    pink.position.x = -6 + Math.sin(t * 0.4) * 2;
    orange.position.y = -3 + Math.cos(t * 0.3) * 2;
    composer.render();
  }

  let visible = true;
  let started = false;
  const loop = () => {
    if (!visible) return;
    render();
    if (!started) {
      started = true;
      canvas.classList.remove('opacity-0');
      window.heroBg?.stop();
    }
    if (!reducedMotion) requestAnimationFrame(loop);
  };

  new ResizeObserver(() => {
    layout();
    if (reducedMotion && started) render();
  }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    const wasVisible = visible;
    visible = entry.isIntersecting;
    if (visible && !wasVisible) {
      clock.getDelta();
      requestAnimationFrame(loop);
    }
  }).observe(canvas);

  layout();
  requestAnimationFrame(loop);
}

main();
