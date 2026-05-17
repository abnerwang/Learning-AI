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

  const colors = {
    bg0: "#070a0f",
    bg1: "#0c1420",
    panel: "rgba(12, 19, 30, 0.78)",
    line: "rgba(172, 211, 255, 0.18)",
    strong: "rgba(238, 245, 255, 0.92)",
    muted: "rgba(198, 211, 228, 0.72)",
    faint: "rgba(159, 176, 196, 0.52)",
    cyan: "rgba(94, 231, 255, 1)",
    teal: "rgba(88, 240, 196, 1)",
    amber: "rgba(255, 198, 109, 1)",
    rose: "rgba(255, 111, 145, 1)",
    violet: "rgba(182, 156, 255, 1)"
  };

  const seed = (i) => {
    const x = Math.sin(i * 91.73) * 10000;
    return x - Math.floor(x);
  };

  function ease(x) {
    return x * x * (3 - 2 * x);
  }

  function mix(a, b, p) {
    return a + (b - a) * p;
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(360, Math.floor(rect.width));
    height = Math.max(520, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    makeParticles();
  }

  function layout() {
    const pad = Math.max(22, width * 0.035);
    return {
      pad,
      top: pad + 18,
      conditionY: pad + 62,
      trainY: height * 0.29,
      inferY: height * 0.61,
      bottomY: height - pad - 42,
      x0: width * 0.17,
      xt: width * 0.39,
      model: width * 0.56,
      x1: width * 0.78,
      vocoder: width * 0.91
    };
  }

  function makeParticles() {
    const l = layout();
    particles = Array.from({ length: 190 }, (_, i) => {
      const noiseA = seed(i) * Math.PI * 2;
      const noiseR = Math.pow(seed(i + 5), 0.55);
      const startX = l.x0 + Math.cos(noiseA) * noiseR * width * 0.075 + (seed(i + 17) - 0.5) * width * 0.035;
      const startY = l.inferY + Math.sin(noiseA) * noiseR * height * 0.135 + (seed(i + 29) - 0.5) * height * 0.07;

      const col = i % 38;
      const row = Math.floor(i / 38);
      const bandX = l.x1 - width * 0.09 + col * width * 0.0049;
      const harmonic = Math.sin(col * 0.44) * height * 0.055 + Math.sin(col * 0.12 + row) * height * 0.034;
      const endX = bandX + (seed(i + 43) - 0.5) * width * 0.018;
      const endY = l.inferY + harmonic + (row - 2) * height * 0.026 + (seed(i + 61) - 0.5) * height * 0.018;

      return { startX, startY, endX, endY, hue: i % 5, phase: seed(i + 77) * Math.PI * 2 };
    });
  }

  function roundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function fillRound(x, y, w, h, r, fill, stroke = colors.line) {
    roundedRect(x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function textLine(text, x, y, size = 14, color = colors.strong, weight = 650, align = "center") {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = weight + " " + size + "px Inter, system-ui, -apple-system, sans-serif";
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function arrow(x1, y1, x2, y2, color = "rgba(94,231,255,0.45)", widthLine = 1.6) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 8;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = widthLine;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(angle - 0.55) * head, y2 - Math.sin(angle - 0.55) * head);
    ctx.lineTo(x2 - Math.cos(angle + 0.55) * head, y2 - Math.sin(angle + 0.55) * head);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBackground() {
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, colors.bg1);
    bg.addColorStop(0.52, "#08111b");
    bg.addColorStop(1, colors.bg0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "rgba(172,211,255,0.12)";
    for (let x = -height * 0.25; x < width; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height * 0.24, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 46) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y - width * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMel(x, y, w, h, alpha, label) {
    fillRound(x, y, w, h, 8, "rgba(8,13,20,0.78)", "rgba(255,198,109," + (0.18 + alpha * 0.32) + ")");
    const rows = 20;
    const cols = 34;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const band = Math.max(0, Math.sin(c * 0.46 + r * 0.74) * 0.34 + Math.sin(c * 0.15) * 0.42 + 0.25);
        const warm = Math.floor(122 + 104 * band);
        ctx.fillStyle = "rgba(255," + warm + ",92," + (0.16 + band * 0.56) + ")";
        ctx.fillRect(x + 10 + c * (w - 20) / cols, y + 12 + r * (h - 24) / rows, (w - 24) / cols, (h - 28) / rows);
      }
    }
    ctx.restore();
    textLine(label, x + w / 2, y - 13, 13, colors.amber, 720);
  }

  function drawNoiseCloud(cx, cy, p, label) {
    ctx.save();
    for (let i = 0; i < 95; i++) {
      const a = seed(i + 300) * Math.PI * 2;
      const r = Math.pow(seed(i + 330), 0.54);
      const x = cx + Math.cos(a) * r * width * 0.065;
      const y = cy + Math.sin(a) * r * height * 0.12;
      const alpha = 0.18 + seed(i + 360) * 0.42;
      ctx.fillStyle = i % 3 === 0 ? "rgba(94,231,255," + alpha + ")" : "rgba(182,156,255," + alpha + ")";
      ctx.beginPath();
      ctx.arc(x, y, 1.8 + seed(i + 390) * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    textLine(label, cx, cy - height * 0.155, 13, colors.cyan, 720);
  }

  function drawConditionBundle(l, active) {
    const y = l.conditionY;
    textLine("Condition package: 给速度模型的约束", width * 0.5, y - 36, 14, colors.muted, 650);
    const chips = [
      ["text", "要读的文本"],
      ["speech tokens", "内容/韵律草图"],
      ["speaker prompt", "音色"],
      ["masked Mel", "已知帧/上下文"]
    ];
    const totalW = Math.min(width - l.pad * 2, 680);
    const startX = (width - totalW) / 2;
    const chipW = (totalW - 30) / 4;
    chips.forEach((chip, i) => {
      const x = startX + i * (chipW + 10);
      const glow = active ? 0.12 + 0.08 * Math.sin(performance.now() * 0.003 + i) : 0.035;
      fillRound(x, y - 18, chipW, 58, 8, "rgba(94,231,255," + glow + ")", "rgba(94,231,255," + (active ? 0.42 : 0.18) + ")");
      textLine(chip[0], x + chipW / 2, y - 1, 13, colors.strong, 760);
      textLine(chip[1], x + chipW / 2, y + 20, 11, colors.muted, 520);
      if (active) arrow(x + chipW / 2, y + 43, l.model, l.inferY - 54, "rgba(94,231,255,0.18)", 1);
    });
  }

  function drawTrainingRow(l, p) {
    const y = l.trainY;
    textLine("训练时：随机选 t，构造 xt，然后让模型预测通向 x1 的速度", width * 0.5, y - 76, 15, colors.strong, 720);
    drawNoiseCloud(l.x0, y, p, "x0 noise");

    const xtBoxW = Math.min(170, width * 0.22);
    const xtX = l.xt - xtBoxW / 2;
    fillRound(xtX, y - 58, xtBoxW, 116, 8, "rgba(17,23,33,0.86)", "rgba(182,156,255,0.34)");
    drawNoiseCloud(l.xt - 28, y + 4, p, "");
    drawMel(l.xt + 8, y - 40, xtBoxW * 0.42, 80, 0.3 + p * 0.45, "");
    textLine("xt = (1-t)x0 + t x1", l.xt, y - 75, 13, colors.violet, 720);
    textLine("中间态", l.xt, y + 76, 12, colors.muted, 560);

    const modelW = Math.min(190, width * 0.2);
    fillRound(l.model - modelW / 2, y - 48, modelW, 96, 8, "rgba(94,231,255,0.09)", "rgba(94,231,255,0.38)");
    textLine("vθ(xt, t, cond)", l.model, y - 10, 15, colors.cyan, 780);
    textLine("预测速度/方向", l.model, y + 17, 12, colors.muted, 560);

    drawMel(l.x1 - 76, y - 56, 152, 112, 1, "x1 real Mel");

    arrow(l.x0 + width * 0.075, y, l.xt - xtBoxW / 2 - 18, y, "rgba(182,156,255,0.42)", 1.8);
    arrow(l.xt + xtBoxW / 2 + 12, y, l.model - modelW / 2 - 16, y, "rgba(94,231,255,0.46)", 1.8);
    arrow(l.model + modelW / 2 + 12, y, l.x1 - 96, y, "rgba(255,198,109,0.52)", 1.8);
    textLine("target velocity: x1 - x0", (l.model + l.x1) / 2 + 10, y - 23, 12, colors.amber, 650);
  }

  function drawVectorField(l, p, now) {
    const left = l.xt - width * 0.11;
    const right = l.x1 - width * 0.08;
    const top = l.inferY - height * 0.13;
    const bottom = l.inferY + height * 0.13;
    ctx.save();
    for (let x = left; x <= right; x += 44) {
      for (let y = top; y <= bottom; y += 42) {
        const toward = Math.atan2(l.inferY - y, l.x1 - x);
        const wobble = Math.sin(x * 0.018 + y * 0.011 + now * 0.001) * 0.22 * (1 - p * 0.45);
        const len = 13 + 10 * p + Math.sin(y * 0.02) * 2;
        arrow(x, y, x + Math.cos(toward + wobble) * len, y + Math.sin(toward + wobble) * len, "rgba(94,231,255,0.22)", 1);
      }
    }
    ctx.restore();
  }

  function drawInferenceParticles(l, p, now) {
    const pal = ["94,231,255", "88,240,196", "255,198,109", "255,111,145", "182,156,255"];
    particles.forEach((particle, i) => {
      const local = ease(clamp((p - 0.08) / 0.84, 0, 1));
      const curl = Math.sin(now * 0.0014 + particle.phase) * (1 - Math.abs(0.5 - local) * 1.8) * height * 0.035;
      const x = mix(particle.startX, particle.endX, local);
      const y = mix(particle.startY, particle.endY, local) + curl;
      const size = mix(3.6, 1.7, local) + seed(i + 91) * 1.2;
      ctx.fillStyle = "rgba(" + pal[particle.hue] + "," + (0.24 + local * 0.56) + ")";
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();

      if (i % 14 === 0) {
        ctx.strokeStyle = "rgba(" + pal[particle.hue] + "," + (0.09 + local * 0.13) + ")";
        ctx.beginPath();
        ctx.moveTo(particle.startX, particle.startY);
        ctx.quadraticCurveTo(l.model, l.inferY + Math.sin(i) * height * 0.09, particle.endX, particle.endY);
        ctx.stroke();
      }
    });
  }

  function drawEulerSteps(l, p) {
    const n = 10;
    const active = Math.floor(clamp(p, 0, 0.999) * n);
    const startX = l.pad + 12;
    const endX = width - l.pad - 12;
    const y = l.bottomY;
    textLine("推理采样：10 个 Euler/ODE 小步，逐步把 xt 推向 Mel", width * 0.5, y - 30, 13, colors.muted, 620);
    for (let i = 0; i < n; i++) {
      const x = mix(startX, endX, i / (n - 1));
      const on = i <= active;
      ctx.fillStyle = on ? "rgba(94,231,255,0.95)" : "rgba(172,211,255,0.24)";
      ctx.beginPath();
      ctx.arc(x, y, on ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (i < n - 1) {
        ctx.strokeStyle = i < active ? "rgba(94,231,255,0.48)" : "rgba(172,211,255,0.14)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 8, y);
        ctx.lineTo(mix(startX, endX, (i + 1) / (n - 1)) - 8, y);
        ctx.stroke();
      }
    }
    textLine("x0", startX, y + 23, 11, colors.cyan, 700);
    textLine("x1 Mel", endX, y + 23, 11, colors.amber, 700);
  }

  function drawInferenceRow(l, p, now) {
    const y = l.inferY;
    textLine("推理时：从 x0 开始，反复查询 vθ 并沿速度场前进", width * 0.5, y - 104, 15, colors.strong, 720);
    drawNoiseCloud(l.x0, y, p, "start x0");
    drawVectorField(l, p, now);

    const modelW = Math.min(164, width * 0.18);
    fillRound(l.model - modelW / 2, y - 54, modelW, 108, 8, "rgba(94,231,255,0.1)", "rgba(94,231,255,0.44)");
    textLine("vθ", l.model, y - 20, 23, colors.cyan, 800);
    textLine("读入 xt, t, cond", l.model, y + 9, 12, colors.muted, 560);
    textLine("输出 velocity", l.model, y + 29, 12, colors.amber, 650);

    drawMel(l.x1 - 78, y - 58, 156, 116, clamp(p * 1.1, 0.18, 1), "generated Mel");
    fillRound(l.vocoder - 56, y - 38, 112, 76, 8, "rgba(255,198,109,0.08)", "rgba(255,198,109,0.32)");
    textLine("Vocoder", l.vocoder, y - 9, 13, colors.amber, 760);
    textLine("waveform", l.vocoder, y + 14, 12, colors.muted, 560);

    arrow(l.x0 + width * 0.075, y, l.model - modelW / 2 - 18, y, "rgba(94,231,255,0.38)", 1.8);
    arrow(l.model + modelW / 2 + 12, y, l.x1 - 99, y, "rgba(255,198,109,0.48)", 1.8);
    arrow(l.x1 + 88, y, l.vocoder - 64, y, "rgba(255,198,109,0.36)", 1.6);
    drawInferenceParticles(l, p, now);

    ctx.save();
    ctx.strokeStyle = "rgba(255,198,109,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const waveX = l.vocoder - 43;
    for (let i = 0; i <= 86; i++) {
      const x = waveX + i;
      const amp = Math.sin(i * 0.34 + now * 0.006) * 10 * clamp((p - 0.78) / 0.22, 0, 1);
      const yy = y + 29 + amp;
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawSectionFrames(l) {
    fillRound(l.pad, l.trainY - 98, width - l.pad * 2, height * 0.26, 8, "rgba(255,255,255,0.025)", "rgba(172,211,255,0.13)");
    fillRound(l.pad, l.inferY - 126, width - l.pad * 2, height * 0.34, 8, "rgba(255,255,255,0.025)", "rgba(172,211,255,0.13)");
    textLine("TRAINING OBJECTIVE", l.pad + 18, l.trainY - 80, 11, colors.faint, 780, "left");
    textLine("INFERENCE SAMPLING", l.pad + 18, l.inferY - 108, 11, colors.faint, 780, "left");
  }

  function draw(now) {
    const l = layout();
    const p = ease(t);
    ctx.clearRect(0, 0, width, height);
    drawBackground();
    drawSectionFrames(l);
    drawConditionBundle(l, t > 0.28);
    drawTrainingRow(l, p);
    drawInferenceRow(l, p, now);
    drawEulerSteps(l, p);

    textLine("核心：Flow Matching 学的是速度场，不是直接一步生成最终音频", width * 0.5, l.pad + 8, 14, colors.strong, 760);
  }

  function updateMeta() {
    const pct = Math.round(t * 100);
    if (label) label.textContent = "t = " + pct + "%";
    const activeIndex = t < 0.16 ? 0 : t < 0.32 ? 1 : t < 0.48 ? 2 : t < 0.66 ? 3 : t < 0.86 ? 4 : 5;
    steps.forEach((step, index) => step.classList.toggle("active", index === activeIndex));
  }

  function frame(now) {
    const dt = Math.min(48, now - last);
    last = now;
    if (playing) {
      t += dt / 7600;
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

