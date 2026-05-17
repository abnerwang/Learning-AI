const canvas = document.querySelector("[data-flow-canvas]");
const progress = document.querySelector("[data-flow-progress]");
const play = document.querySelector("[data-flow-play]");
const label = document.querySelector("[data-flow-label]");
const steps = Array.from(document.querySelectorAll("[data-flow-step]"));

if (canvas) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let t = Number((progress && progress.value) || 0.35);
  let playing = true;
  let last = performance.now();
  let particles = [];

  const seed = (i) => {
    const x = Math.sin(i * 91.73) * 10000;
    return x - Math.floor(x);
  };

  function makeParticles() {
    particles = Array.from({ length: 280 }, (_, i) => {
      const a = seed(i) * Math.PI * 2;
      const r = Math.pow(seed(i + 19), 0.6);
      const startX = width * (0.18 + Math.cos(a) * r * 0.12 + (seed(i + 3) - 0.5) * 0.14);
      const startY = height * (0.5 + Math.sin(a) * r * 0.34);
      const band = i % 34;
      const endX = width * (0.64 + band / 34 * 0.24 + (seed(i + 7) - 0.5) * 0.035);
      const harmonic = Math.sin(band * 0.62) * 0.16 + Math.sin(band * 1.27) * 0.06;
      const endY = height * (0.52 + harmonic + (seed(i + 11) - 0.5) * 0.08);
      return { startX, startY, endX, endY, hue: i % 5 };
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(320, Math.floor(rect.width));
    height = Math.max(320, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeParticles();
  }

  function ease(x) {
    return x * x * (3 - 2 * x);
  }

  function mix(a, b, p) {
    return a + (b - a) * p;
  }

  function drawGrid() {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "rgba(172,211,255,0.16)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height * 0.18, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y - width * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVectorField(now) {
    ctx.save();
    ctx.lineWidth = 1;
    for (let x = width * 0.28; x < width * 0.88; x += 54) {
      for (let y = height * 0.18; y < height * 0.84; y += 54) {
        const phase = Math.sin(x * 0.012 + y * 0.016 + now * 0.0012);
        const angle = -0.15 + phase * 0.28;
        const len = 18 + phase * 6;
        ctx.strokeStyle = "rgba(94,231,255,0.24)";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
        ctx.stroke();
        ctx.fillStyle = "rgba(94,231,255,0.34)";
        ctx.beginPath();
        ctx.arc(x + Math.cos(angle) * len, y + Math.sin(angle) * len, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawSpectrogram() {
    ctx.save();
    const baseX = width * 0.62;
    const baseY = height * 0.2;
    const w = width * 0.3;
    const h = height * 0.62;
    const rows = 18;
    const cols = 32;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const energy = Math.max(0, Math.sin(c * 0.52 + r * 0.8) * 0.4 + Math.sin(c * 0.18) * 0.45 + 0.25);
        ctx.fillStyle = "rgba(255, " + (160 + Math.floor(70 * energy)) + ", 90, " + (0.08 + energy * 0.18) + ")";
        ctx.fillRect(baseX + c * w / cols, baseY + r * h / rows, w / cols - 2, h / rows - 2);
      }
    }
    ctx.restore();
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#0b1018");
    bg.addColorStop(1, "#070a0f");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    drawGrid();
    drawVectorField(now);
    drawSpectrogram();

    const p = ease(t);
    const colors = ["94,231,255", "88,240,196", "255,198,109", "255,111,145", "182,156,255"];
    particles.forEach((particle, i) => {
      const curl = Math.sin(now * 0.001 + i * 0.17) * (1 - Math.abs(0.5 - p) * 2) * 38;
      const x = mix(particle.startX, particle.endX, p);
      const y = mix(particle.startY, particle.endY, p) + curl;
      const size = mix(3.2, 1.8, p) + seed(i + 31) * 1.4;
      ctx.fillStyle = "rgba(" + colors[particle.hue] + ", " + (0.34 + p * 0.42) + ")";
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      if (i % 7 === 0) {
        ctx.strokeStyle = "rgba(" + colors[particle.hue] + ", " + (0.08 + p * 0.12) + ")";
        ctx.beginPath();
        ctx.moveTo(particle.startX, particle.startY);
        ctx.quadraticCurveTo(width * 0.46, height * (0.48 + Math.sin(i) * 0.22), particle.endX, particle.endY);
        ctx.stroke();
      }
    });

    ctx.fillStyle = "rgba(238,245,255,0.9)";
    ctx.font = "600 14px Inter, system-ui, sans-serif";
    ctx.fillText("noise x0", width * 0.08, height * 0.12);
    ctx.fillText("learned velocity field", width * 0.36, height * 0.12);
    ctx.fillText("mel x1", width * 0.76, height * 0.12);
  }

  function updateMeta() {
    const pct = Math.round(t * 100);
    if (label) label.textContent = "t = " + pct + "%";
    const activeIndex = t < 0.28 ? 0 : t < 0.58 ? 1 : t < 0.84 ? 2 : 3;
    steps.forEach((step, index) => step.classList.toggle("active", index === activeIndex));
  }

  function frame(now) {
    const dt = Math.min(48, now - last);
    last = now;
    if (playing) {
      t += dt / 5200;
      if (t > 1) t = 0;
      if (progress) progress.value = t.toFixed(3);
      updateMeta();
    }
    draw(now);
    requestAnimationFrame(frame);
  }

  resize();
  updateMeta();
  requestAnimationFrame(frame);
  window.addEventListener("resize", resize);

  if (progress) {
    progress.addEventListener("input", () => {
      t = Number(progress.value);
      playing = false;
      if (play) play.textContent = "播放";
      updateMeta();
    });
  }

  if (play) {
    play.addEventListener("click", () => {
      playing = !playing;
      play.textContent = playing ? "暂停" : "播放";
    });
  }
}
