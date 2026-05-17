const canvas = document.querySelector("[data-flow-canvas]");
const progress = document.querySelector("[data-flow-progress]");
const play = document.querySelector("[data-flow-play]");
const label = document.querySelector("[data-flow-label]");
const steps = Array.from(document.querySelectorAll("[data-flow-step]"));
const tabs = Array.from(document.querySelectorAll("[data-flow-mode]"));
const modeTitle = document.querySelector("[data-flow-mode-title]");

if (canvas) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let t = Number((progress && progress.value) || 0.35);
  let playing = true;
  let activeMode = "pipeline";
  let last = performance.now();

  const modes = {
    pipeline: { title: "全链路：x0 -> xt -> x1", steps: [["1. 噪声起点", "x0 是没有语音结构的连续 Mel 变量。"], ["2. 速度模型", "vθ 读取 xt、时间 t 和条件信息，预测下一步方向。"], ["3. 多步前进", "Euler / ODE 采样反复更新 xt。"], ["4. 声音出口", "Flow 输出 Mel，Vocoder 再生成 waveform。"]] },
    field: { title: "速度场：每个位置该往哪里走", steps: [["1. 当前位置", "中间态 xt 可以落在路径上的任意位置。"], ["2. 局部方向", "模型预测的是 velocity，不是一次性预测最终 Mel。"], ["3. 路径收束", "许多局部方向共同把分布推向真实 Mel。"], ["4. 训练目标", "训练时用 x0 与 x1 之间的方向监督速度。"]] },
    condition: { title: "条件约束：内容、音色和上下文", steps: [["1. Speech token", "约束内容和粗粒度韵律。"], ["2. Speaker prompt", "提供说话人音色和风格参考。"], ["3. Masked Mel", "提供已知帧或上下文，避免声学断裂。"], ["4. 条件速度", "vθ(xt,t,cond) 在这些约束下更新 Mel。"]] },
    streaming: { title: "流式 chunk：只看必要的未来", steps: [["1. 分块输入", "语音 token 和 Mel 按 chunk 前进。"], ["2. Causal mask", "限制未来信息，降低首包延迟。"], ["3. Lookahead", "少量未来 token 缓解 chunk 边界问题。"], ["4. 连续输出", "每个 chunk 渲染后接给 Vocoder。"]] }
  };

  const colors = {
    bg0: "#050910",
    bg1: "#0d1724",
    line: "rgba(174, 214, 255, 0.18)",
    text: "rgba(241, 247, 255, 0.94)",
    muted: "rgba(199, 214, 232, 0.74)",
    cyan: "rgba(94, 231, 255, 1)",
    amber: "rgba(255, 198, 109, 1)",
    rose: "rgba(255, 111, 145, 1)"
  };

  const seed = (i) => {
    const x = Math.sin(i * 91.73) * 10000;
    return x - Math.floor(x);
  };
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const mix = (a, b, p) => a + (b - a) * p;
  const ease = (x) => x * x * (3 - 2 * x);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(340, Math.floor(rect.width));
    height = Math.max(460, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function bg() {
    const g = ctx.createRadialGradient(width * 0.7, height * 0.22, 40, width * 0.52, height * 0.45, width * 0.85);
    g.addColorStop(0, "#14263b");
    g.addColorStop(0.48, colors.bg1);
    g.addColorStop(1, colors.bg0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "rgba(94,231,255,0.11)";
    for (let x = -height * 0.3; x < width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height * 0.28, height);
      ctx.stroke();
    }
    for (let y = 24; y < height; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y - width * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  function box(x, y, w, h, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke || colors.line;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawText(str, x, y, size, color, weight, align) {
    ctx.save();
    ctx.fillStyle = color || colors.text;
    ctx.font = (weight || 700) + " " + (size || 14) + "px Inter, system-ui, -apple-system, sans-serif";
    ctx.textAlign = align || "center";
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function arrow(x1, y1, x2, y2, color, lw) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.strokeStyle = color || "rgba(94,231,255,0.5)";
    ctx.fillStyle = color || "rgba(94,231,255,0.5)";
    ctx.lineWidth = lw || 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - 0.55) * 9, y2 - Math.sin(a - 0.55) * 9);
    ctx.lineTo(x2 - Math.cos(a + 0.55) * 9, y2 - Math.sin(a + 0.55) * 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function mel(x, y, w, h, alpha) {
    const a = alpha == null ? 1 : alpha;
    box(x, y, w, h, "rgba(5,9,16,0.72)", "rgba(255,198,109," + (0.18 + a * 0.34) + ")");
    ctx.save();
    ctx.globalAlpha = a;
    const rows = 18;
    const cols = 32;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const band = clamp(Math.sin(c * 0.42 + r * 0.55) * 0.28 + Math.sin(c * 0.15) * 0.48 + 0.34, 0, 1);
        ctx.fillStyle = "rgba(255," + Math.floor(122 + 110 * band) + ",92," + (0.16 + band * 0.58) + ")";
        ctx.fillRect(x + 10 + c * (w - 20) / cols, y + 10 + r * (h - 20) / rows, (w - 24) / cols, (h - 24) / rows);
      }
    }
    ctx.restore();
  }

  function noise(cx, cy, rx, ry, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    for (let i = 0; i < 120; i++) {
      const a = seed(i + 11) * Math.PI * 2;
      const r = Math.pow(seed(i + 37), 0.55);
      ctx.fillStyle = i % 3 ? "rgba(94,231,255,0.42)" : "rgba(182,156,255,0.5)";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * rx, cy + Math.sin(a) * r * ry, 1.5 + seed(i + 70) * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function title(str) {
    drawText(str, width * 0.5, 34, 16, colors.text, 780);
  }

  function drawPipeline(p, now) {
    title("四步理解：噪声 -> 速度模型 -> Mel -> 波形");
    const y = height * 0.52;
    const xs = [width * 0.16, width * 0.4, width * 0.64, width * 0.86];
    noise(xs[0], y, width * 0.075, height * 0.12, 0.9);
    drawText("x0 noise", xs[0], y - height * 0.18, 13, colors.cyan);
    box(xs[1] - 72, y - 52, 144, 104, "rgba(94,231,255,0.1)", "rgba(94,231,255,0.45)");
    drawText("vθ", xs[1], y - 16, 26, colors.cyan, 820);
    drawText("velocity", xs[1], y + 16, 13, colors.muted, 620);
    mel(xs[2] - 78, y - 58, 156, 116, clamp(p * 1.2, 0.22, 1));
    drawText("Mel", xs[2], y - height * 0.18, 13, colors.amber);
    box(xs[3] - 58, y - 44, 116, 88, "rgba(255,198,109,0.09)", "rgba(255,198,109,0.38)");
    drawText("Vocoder", xs[3], y - 12, 14, colors.amber, 760);
    ctx.strokeStyle = "rgba(255,198,109,0.65)";
    ctx.beginPath();
    for (let i = 0; i <= 78; i++) {
      const x = xs[3] - 39 + i;
      const yy = y + 22 + Math.sin(i * 0.35 + now * 0.006) * 11 * clamp((p - 0.72) / 0.28, 0, 1);
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
    arrow(xs[0] + 76, y, xs[1] - 84, y);
    arrow(xs[1] + 84, y, xs[2] - 94, y, "rgba(255,198,109,0.5)");
    arrow(xs[2] + 92, y, xs[3] - 70, y, "rgba(255,198,109,0.42)");
    drawStepper(p, "Euler / ODE 多步采样");
  }

  function drawField(p, now) {
    title("速度场：每个箭头都是 vθ 给出的局部方向");
    const left = width * 0.13;
    const right = width * 0.82;
    const top = height * 0.22;
    const bottom = height * 0.78;
    mel(width * 0.74, height * 0.32, width * 0.16, height * 0.3, 0.86);
    drawText("target Mel", width * 0.82, height * 0.26, 13, colors.amber);
    for (let x = left; x < right; x += width * 0.095) {
      for (let y = top; y < bottom; y += height * 0.11) {
        const a = Math.atan2(height * 0.48 - y, width * 0.78 - x) + Math.sin(x * 0.02 + y * 0.02 + now * 0.001) * 0.18;
        const len = 18 + 16 * p;
        arrow(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, "rgba(94,231,255,0.28)", 1.2);
      }
    }
    const x = mix(width * 0.18, width * 0.72, ease(p));
    const y = height * 0.58 + Math.sin(now * 0.002) * 18 * (1 - p);
    ctx.fillStyle = "rgba(255,111,145,0.95)";
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    drawText("xt", x, y - 22, 13, colors.rose);
    drawStepper(p, "当前位置沿速度场移动");
  }

  function drawCondition(p) {
    title("Conditional Flow Matching：速度由条件共同决定");
    const chips = [["Text", "文本"], ["Speech token", "内容/韵律"], ["Speaker", "音色"], ["Masked Mel", "上下文"]];
    const modelX = width * 0.55;
    const modelY = height * 0.55;
    box(modelX - 92, modelY - 62, 184, 124, "rgba(94,231,255,0.1)", "rgba(94,231,255,0.46)");
    drawText("vθ(xt,t,cond)", modelX, modelY - 12, 16, colors.cyan, 800);
    drawText("预测条件速度", modelX, modelY + 20, 13, colors.muted, 620);
    chips.forEach((chip, i) => {
      const x = width * 0.16;
      const y = height * (0.24 + i * 0.16);
      const on = p > i * 0.18;
      box(x - 76, y - 28, 152, 56, on ? "rgba(255,198,109,0.12)" : "rgba(255,255,255,0.035)", on ? "rgba(255,198,109,0.48)" : colors.line);
      drawText(chip[0], x, y - 7, 13, on ? colors.amber : colors.muted, 760);
      drawText(chip[1], x, y + 13, 12, colors.muted, 560);
      if (on) arrow(x + 84, y, modelX - 104, modelY - 34 + i * 22, "rgba(255,198,109,0.34)", 1.5);
    });
    mel(width * 0.75, modelY - 58, width * 0.16, 116, clamp(p, 0.18, 1));
    arrow(modelX + 104, modelY, width * 0.74, modelY, "rgba(94,231,255,0.5)");
  }

  function drawStreaming(p) {
    title("Chunk-aware CFM：分块渲染，减少等待");
    const y0 = height * 0.25;
    const chunkW = width * 0.12;
    const gap = width * 0.025;
    for (let i = 0; i < 5; i++) {
      const x = width * 0.12 + i * (chunkW + gap);
      const active = p * 5 > i;
      box(x, y0, chunkW, 64, active ? "rgba(94,231,255,0.12)" : "rgba(255,255,255,0.035)", active ? "rgba(94,231,255,0.5)" : colors.line);
      drawText("token " + (i + 1), x + chunkW / 2, y0 + 32, 13, active ? colors.cyan : colors.muted);
      if (i <= Math.floor(p * 5)) {
        arrow(x + chunkW / 2, y0 + 74, x + chunkW / 2, height * 0.48, "rgba(94,231,255,0.38)", 1.5);
        mel(x, height * 0.5, chunkW, 78, 0.35 + i * 0.12);
      }
      if (i < 4) {
        ctx.strokeStyle = active ? "rgba(255,198,109,0.42)" : "rgba(174,214,255,0.12)";
        ctx.setLineDash([5, 6]);
        ctx.strokeRect(x + chunkW + 5, y0 + 7, gap - 10, 50);
        ctx.setLineDash([]);
      }
    }
    drawText("causal mask: 当前 chunk 主要看过去和少量 lookahead", width * 0.5, height * 0.78, 14, colors.amber, 720);
    drawStepper(p, "chunk-by-chunk 输出");
  }

  function drawStepper(p, caption) {
    const n = 10;
    const y = height - 48;
    const start = width * 0.16;
    const end = width * 0.84;
    drawText(caption, width * 0.5, y - 24, 13, colors.muted, 620);
    for (let i = 0; i < n; i++) {
      const x = mix(start, end, i / (n - 1));
      const on = i <= Math.floor(p * (n - 1));
      ctx.fillStyle = on ? "rgba(94,231,255,0.95)" : "rgba(174,214,255,0.22)";
      ctx.beginPath();
      ctx.arc(x, y, on ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (i < n - 1) {
        ctx.strokeStyle = on ? "rgba(94,231,255,0.45)" : "rgba(174,214,255,0.12)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 8, y);
        ctx.lineTo(mix(start, end, (i + 1) / (n - 1)) - 8, y);
        ctx.stroke();
      }
    }
  }

  function updateMeta() {
    const pct = Math.round(t * 100);
    if (label) label.textContent = "t = " + pct + "%";
    if (modeTitle) modeTitle.textContent = modes[activeMode].title;
    modes[activeMode].steps.forEach((item, i) => {
      if (!steps[i]) return;
      steps[i].innerHTML = "<strong>" + item[0] + "</strong><br>" + item[1];
      steps[i].classList.toggle("active", i === Math.min(3, Math.floor(t * 4)));
    });
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.flowMode === activeMode));
  }

  function draw(now) {
    const p = ease(t);
    ctx.clearRect(0, 0, width, height);
    bg();
    if (activeMode === "pipeline") drawPipeline(p, now);
    if (activeMode === "field") drawField(p, now);
    if (activeMode === "condition") drawCondition(p);
    if (activeMode === "streaming") drawStreaming(p);
  }

  function frame(now) {
    const dt = Math.min(48, now - last);
    last = now;
    if (playing) {
      t += dt / 7200;
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

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activeMode = tab.dataset.flowMode;
      playing = true;
      if (play) play.textContent = "暂停";
      updateMeta();
    });
  });
}
