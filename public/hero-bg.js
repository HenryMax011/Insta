// Fundo do hero: ícones do Instagram flutuando com profundidade de campo, luzes e granulação.
(() => {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BLURS = [0, 3, 7, 14, 26];
  const BASE = 220;

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawGlyph(c, s, color, width) {
    c.strokeStyle = color;
    c.fillStyle = color;
    c.lineWidth = s * width;
    roundRect(c, -s * 0.32, -s * 0.32, s * 0.64, s * 0.64, s * 0.19);
    c.stroke();
    c.beginPath();
    c.arc(0, 0, s * 0.155, 0, TAU);
    c.stroke();
    c.beginPath();
    c.arc(s * 0.195, -s * 0.195, s * 0.05, 0, TAU);
    c.fill();
  }

  function drawApp(c, s) {
    const h = s / 2;
    const g = c.createRadialGradient(-h * 0.5, h * 1.1, 0, -h * 0.5, h * 1.1, s * 1.45);
    g.addColorStop(0, '#fdf497');
    g.addColorStop(0.08, '#fdf497');
    g.addColorStop(0.42, '#fd5949');
    g.addColorStop(0.62, '#d6249f');
    g.addColorStop(0.95, '#285aeb');
    roundRect(c, -h, -h, s, s, s * 0.28);
    c.fillStyle = g;
    c.fill();
    const shine = c.createLinearGradient(0, -h, 0, h * 0.2);
    shine.addColorStop(0, 'rgba(255,255,255,.28)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = shine;
    c.fill();
    drawGlyph(c, s, '#fff', 0.08);
  }

  function drawHeart(c, s) {
    const k = s / 34;
    c.scale(k, k);
    c.beginPath();
    c.moveTo(0, 11);
    c.bezierCurveTo(-18, -1, -16, -15, -8, -15);
    c.bezierCurveTo(-3, -15, 0, -11, 0, -8);
    c.bezierCurveTo(0, -11, 3, -15, 8, -15);
    c.bezierCurveTo(16, -15, 18, -1, 0, 11);
    const g = c.createLinearGradient(-17, -15, 17, 11);
    g.addColorStop(0, '#f472b6');
    g.addColorStop(1, '#e11d48');
    c.fillStyle = g;
    c.fill();
  }

  const PAINTERS = {
    app: drawApp,
    glyph: (c, s) => drawGlyph(c, s, 'rgba(255,255,255,.9)', 0.075),
    heart: drawHeart,
  };

  const sprites = {};
  for (const [kind, paint] of Object.entries(PAINTERS)) {
    sprites[kind] = BLURS.map((blur) => {
      const pad = blur * 3 + 10;
      const off = document.createElement('canvas');
      off.width = off.height = BASE + pad * 2;
      const c = off.getContext('2d');
      c.translate(off.width / 2, off.height / 2);
      if (blur) c.filter = `blur(${blur}px)`;
      paint(c, BASE);
      return off;
    });
  }

  let width = 0, height = 0, unit = 1;
  const items = [];
  const rand = (a, b) => a + Math.random() * (b - a);

  function spawn(item, initial) {
    item.z = rand(0, 1);
    const roll = Math.random();
    item.kind = roll < 0.55 ? 'app' : roll < 0.8 ? 'glyph' : 'heart';
    // ícones próximos (grandes) ficam nas laterais para não competir com o texto central
    item.x = item.z > 0.7
      ? (Math.random() < 0.5 ? rand(-0.15, 0.2) : rand(0.8, 1.15))
      : rand(-0.1, 1.1);
    item.y = initial ? rand(-0.1, 1.15) : rand(1.15, 1.35);
    item.rot = rand(-0.6, 0.6);
    item.spin = rand(-0.08, 0.08);
    item.phase = rand(0, TAU);
    return item;
  }

  function layout() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    unit = Math.max(width, height) / (width < 640 ? 1100 : 1400);
    const count = Math.round(Math.min(26, Math.max(14, (width * height) / 52000)));
    while (items.length < count) items.push(spawn({}, true));
    items.length = count;
    items.sort((a, b) => a.z - b.z);
  }

  const FOCUS = 0.6;
  function blurLevel(z) {
    const d = Math.abs(z - FOCUS);
    return d < 0.08 ? 0 : d < 0.18 ? 1 : d < 0.3 ? 2 : d < 0.45 ? 3 : 4;
  }

  const lights = [
    { color: '214,36,159', r: 0.55, ax: 0.3, ay: 0.25, sx: 0.07, sy: 0.05, p: 0 },
    { color: '253,89,73', r: 0.45, ax: 0.35, ay: 0.3, sx: 0.05, sy: 0.08, p: 2 },
    { color: '109,40,217', r: 0.6, ax: 0.25, ay: 0.2, sx: 0.06, sy: 0.04, p: 4 },
  ];

  let mouseX = 0, mouseY = 0, camX = 0, camY = 0;
  window.addEventListener('pointermove', (e) => {
    mouseX = e.clientX / window.innerWidth - 0.5;
    mouseY = e.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  let last = 0;
  function frame(now) {
    if (!width || !height) return;
    const t = now / 1000;
    const dt = Math.min(0.05, last ? t - last : 0);
    last = t;
    camX += (mouseX - camX) * 0.04;
    camY += (mouseY - camY) * 0.04;

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#070509';
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const x = width * (0.5 + Math.sin(t * l.sx * TAU + l.p) * l.ax);
      const y = height * (0.5 + Math.cos(t * l.sy * TAU + l.p) * l.ay);
      const r = Math.max(width, height) * l.r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${l.color},.32)`);
      g.addColorStop(1, `rgba(${l.color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const item of items) {
      const z = item.z;
      item.y -= dt * (0.012 + z * 0.05);
      item.rot += dt * item.spin;
      if (item.y < -0.35) {
        spawn(item, false);
        items.sort((a, b) => a.z - b.z);
      }
      const size = (36 + z ** 1.7 * 440) * unit;
      const sprite = sprites[item.kind][blurLevel(z)];
      const scale = size / BASE;
      const x = item.x * width + Math.sin(t * 0.25 + item.phase) * 30 * unit - camX * z * 60;
      const y = item.y * height - camY * z * 40;
      ctx.globalAlpha = Math.min(0.75, 0.25 + z * 0.75) * (item.kind === 'glyph' ? 0.55 : 0.85);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const dpr = canvas.width / width;
      ctx.setTransform(dpr * scale * Math.cos(item.rot), dpr * scale * Math.sin(item.rot), -dpr * scale * Math.sin(item.rot), dpr * scale * Math.cos(item.rot), dpr * x, dpr * y);
      ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
    }
    const dpr = canvas.width / width;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  }

  function makeGrain() {
    const grain = document.getElementById('hero-grain');
    if (!grain) return;
    const n = document.createElement('canvas');
    n.width = n.height = 160;
    const c = n.getContext('2d');
    const img = c.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
    grain.style.backgroundImage = `url(${n.toDataURL('image/png')})`;
  }

  let visible = true;
  let stopped = false;
  let raf = 0;
  const loop = (now) => {
    frame(now);
    raf = requestAnimationFrame(loop);
  };
  const sync = () => {
    cancelAnimationFrame(raf);
    last = 0;
    if (stopped) return;
    if (visible && !reducedMotion) raf = requestAnimationFrame(loop);
    else frame(performance.now());
  };

  // hero-3d.js assume o fundo quando o WebGL está disponível
  window.heroBg = {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      canvas.classList.add('opacity-0');
    },
  };

  new ResizeObserver(() => {
    layout();
    if (!visible || reducedMotion) frame(performance.now());
  }).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    sync();
  }).observe(canvas);

  makeGrain();
  layout();
  sync();
})();
