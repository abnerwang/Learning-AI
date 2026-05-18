const canvas = document.querySelector("[data-flow-canvas]");
const progress = document.querySelector("[data-flow-progress]");
const play = document.querySelector("[data-flow-play]");
const prev = document.querySelector("[data-flow-prev]");
const next = document.querySelector("[data-flow-next]");
const replay = document.querySelector("[data-flow-replay]");
const label = document.querySelector("[data-flow-label]");
const steps = Array.from(document.querySelectorAll("[data-flow-step]"));
const tabs = Array.from(document.querySelectorAll("[data-flow-mode]"));
const speedChips = Array.from(document.querySelectorAll("[data-flow-speed]"));
const modeTitle = document.querySelector("[data-flow-mode-title]");

if (canvas) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let t = Number((progress && progress.value) || 0.04);
  let playing = true;
  let activeMode = "guided";
  let speed = 1;
  let last = performance.now();

  const modes = {
    guided: {
      title: "逐步生成：x0 -> xt -> Mel -> waveform",
      steps: [
        ["01 采样噪声 x0", "先在 Mel 空间里放入没有语音结构的随机噪声。"],
        ["02 给定目标/参考", "目标 Mel 和 prompt Mel 提供训练或推理时的声学锚点。"],
        ["03 构造中间态 xt", "xt 位于 x0 与 x1 之间，不是最终答案。"],
        ["04 注入条件 cond", "speech token、speaker、mask 和时间步汇聚成条件上下文。"],
        ["05 估计速度场 vθ", "模型预测当前位置应该往哪里移动。"],
        ["06 Euler / ODE 多步更新", "反复沿速度方向前进，逐步形成 Mel 结构。"],
        ["07 流式 chunk 展开", "生成可以按 chunk 推进，减少首包等待。"],
        ["08 Vocoder 输出波形", "最终 Mel 交给 vocoder，转换成可播放 waveform。"]
      ]
    },
    field: {
      title: "速度场：每个位置该往哪里走",
      steps: [
        ["01 网格位置", "把 Mel 空间里的许多位置同时拿出来看。"],
        ["02 局部箭头", "每个箭头表示 vθ 在该位置预测的 velocity。"],
        ["03 样本轨迹", "一个 xt 沿着局部箭头一步步靠近目标 Mel。"],
        ["04 分布收束", "很多样本同时移动，最终靠近真实 Mel 分布。"]
      ]
    },
    condition: {
      title: "条件约束：内容、音色、mask 先汇聚再影响速度",
      steps: [
        ["01 内容条件", "speech token 决定说什么。"],
        ["02 声学参考", "prompt Mel / speaker embedding 决定像谁说。"],
        ["03 可见性约束", "mask / streaming 决定能看见多少上下文。"],
        ["04 条件速度", "vθ(xt,t,cond) 在这些约束下更新 Mel。"]
      ]
    },
    streaming: {
      title: "流式 chunk：边生成边播放",
      steps: [
        ["01 token 分块", "LLM 按 chunk 产生 speech token。"],
        ["02 causal mask", "当前 chunk 主要依赖过去和少量 lookahead。"],
        ["03 CFM 渲染", "每个 chunk 被逐步渲染成 Mel 片段。"],
        ["04 连续输出", "Vocoder 接住 Mel chunk，连续吐出 waveform。"]
      ]
    },
    trajectory: {
      title: "采样轨迹：把一次生成拆成多次小更新",
      steps: [
        ["01 x0", "随机起点。"],
        ["02 x0.2", "开始出现弱频带。"],
        ["03 x0.4", "局部结构被速度场拉直。"],
        ["04 x0.6", "能量带逐渐稳定。"],
        ["05 x0.8", "细节开始清晰。"],
        ["06 x1", "得到可送入 vocoder 的 Mel。"]
      ]
    }
  };

  const colors = {
    bg0: "#050910",
    bg1: "#0d1724",
    panel: "rgba(8, 14, 22, 0.78)",
    line: "rgba(174, 214, 255, 0.18)",
    lineStrong: "rgba(174, 214, 255, 0.34)",
    text: "rgba(241, 247, 255, 0.94)",
    muted: "rgba(199, 214, 232, 0.74)",
    faint: "rgba(199, 214, 232, 0.42)",
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
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const mix = (a, b, p) => a + (b - a) * p;
  const ease = (x) => x * x * (3 - 2 * x);
  const phaseAmount = (phase, index, span = 0.88) => clamp((phase - index) / span, 0, 1);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(340, Math.floor(rect.width));
    height = Math.max(520, Math.floor(rect.height));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bg() {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, colors.bg0);
    g.addColorStop(0.46, colors.bg1);
    g.addColorStop(1, "#070a0f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = "rgba(94,231,255,0.08)";
    ctx.lineWidth = 1;
    for (let x = -height * 0.35; x < width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height * 0.28, height);
      ctx.stroke();
    }
    for (let y = 32; y < height; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y - width * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  function panel(x, y, w, h, fill, stroke, radius = 10) {
    ctx.save();
    roundedRect(x, y, w, h, radius);
    ctx.fillStyle = fill || colors.panel;
    ctx.fill();
    ctx.strokeStyle = stroke || colors.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function drawText(str, x, y, size = 14, color = colors.text, weight = 700, align = "center") {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = weight + " " + size + "px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function drawFittedText(str, x, y, size = 14, color = colors.text, weight = 700, maxWidth = width - 40) {
    ctx.save();
    let fitted = size;
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    while (fitted > 10) {
      ctx.font = weight + " " + fitted + "px Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      if (!ctx.measureText || ctx.measureText(str).width <= maxWidth) break;
      fitted -= 1;
    }
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function arrow(x1, y1, x2, y2, color = "rgba(94,231,255,0.5)", lw = 2) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
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

  function curvedArrow(x1, y1, x2, y2, bend = 0, color = "rgba(94,231,255,0.48)", lw = 2) {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2 + bend;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
    const a = Math.atan2(y2 - cy, x2 - cx);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - 0.55) * 9, y2 - Math.sin(a - 0.55) * 9);
    ctx.lineTo(x2 - Math.cos(a + 0.55) * 9, y2 - Math.sin(a + 0.55) * 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function tag(x, y, w, text, color, active = true) {
    panel(x, y, w, 34, active ? color.replace("1)", "0.13)") : "rgba(255,255,255,0.035)", active ? color.replace("1)", "0.48)") : colors.line, 8);
    drawText(text, x + w / 2, y + 17, 12, active ? color : colors.muted, 740);
  }

  function title(str, sub) {
    drawFittedText(str, width * 0.5, 30, 16, colors.text, 780, width - 36);
    if (sub && width > 620) drawFittedText(sub, width * 0.5, 55, 12, colors.muted, 560, width - 56);
  }

  function drawSpectrogram(x, y, w, h, alpha = 1, detail = 1) {
    panel(x, y, w, h, "rgba(5,9,16,0.76)", "rgba(255,198,109," + (0.18 + alpha * 0.34) + ")", 8);
    ctx.save();
    ctx.globalAlpha = alpha;
    const rows = Math.max(10, Math.floor(16 * detail));
    const cols = Math.max(18, Math.floor(34 * detail));
    const cellW = (w - 20) / cols;
    const cellH = (h - 20) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const harmonic = Math.sin(c * 0.38 + r * 0.55) * 0.25 + Math.sin(c * 0.12) * 0.38;
        const formant = Math.exp(-Math.abs(r - (rows * 0.25 + Math.sin(c * 0.18) * rows * 0.12)) / rows * 8);
        const pulse = Math.max(0, Math.sin(c * 0.62 + r * 0.17));
        const v = clamp(0.18 + harmonic + formant * 0.55 + pulse * 0.18, 0, 1);
        ctx.fillStyle = "rgba(255," + Math.floor(112 + 122 * v) + ",92," + (0.12 + v * 0.68) + ")";
        ctx.fillRect(x + 10 + c * cellW, y + 10 + r * cellH, Math.max(1, cellW - 1), Math.max(1, cellH - 1));
      }
    }
    ctx.restore();
  }

  function drawNoiseCloud(cx, cy, rx, ry, alpha = 1, now = 0, count = 120) {
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = 0; i < count; i++) {
      const a = seed(i + 11) * Math.PI * 2 + Math.sin(now * 0.0007 + i) * 0.18;
      const r = Math.pow(seed(i + 37), 0.55);
      ctx.fillStyle = i % 3 ? "rgba(94,231,255,0.42)" : "rgba(182,156,255,0.5)";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r * rx, cy + Math.sin(a) * r * ry, 1.5 + seed(i + 70) * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawMorphField(x, y, w, h, p, now, alpha = 1) {
    panel(x, y, w, h, "rgba(5,9,16,0.62)", "rgba(94,231,255,0.22)", 10);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.rect(x + 8, y + 8, w - 16, h - 16);
    ctx.clip();
    for (let i = 0; i < 240; i++) {
      const nx = x + 16 + seed(i + 1) * (w - 32);
      const ny = y + 16 + seed(i + 2) * (h - 32);
      const band = Math.floor(seed(i + 9) * 18);
      const tx = x + 18 + ((i * 17) % 110) / 110 * (w - 36);
      const ty = y + 18 + (band / 17) * (h - 36) + Math.sin(i * 0.37 + now * 0.003) * 4;
      const q = ease(p);
      const px = mix(nx, tx, q) + Math.sin(now * 0.0016 + i) * (1 - q) * 4;
      const py = mix(ny, ty, q);
      const energy = clamp(0.25 + Math.sin(tx * 0.025 + band) * 0.25 + q * 0.5, 0, 1);
      ctx.fillStyle = q < 0.45
        ? "rgba(94,231,255," + (0.18 + energy * 0.35) + ")"
        : "rgba(255," + Math.floor(138 + energy * 92) + ",92," + (0.18 + energy * 0.58) + ")";
      ctx.beginPath();
      ctx.arc(px, py, 1.2 + energy * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWave(x, y, w, amp, alpha = 1, now = 0) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(255,198,109,0.82)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= w; i++) {
      const yy = y + Math.sin(i * 0.13 + now * 0.008) * amp * Math.sin(i * 0.018);
      if (i === 0) ctx.moveTo(x + i, yy);
      else ctx.lineTo(x + i, yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawTopTimeline(p, count, labels) {
    const start = width * 0.08;
    const end = width * 0.92;
    const y = 78;
    const active = Math.min(count - 1, Math.floor(p * count));
    for (let i = 0; i < count; i++) {
      const x = mix(start, end, i / Math.max(1, count - 1));
      const on = i <= active;
      if (i < count - 1) {
        const nx = mix(start, end, (i + 1) / Math.max(1, count - 1));
        ctx.strokeStyle = i < active ? "rgba(94,231,255,0.5)" : "rgba(174,214,255,0.14)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + 8, y);
        ctx.lineTo(nx - 8, y);
        ctx.stroke();
      }
      ctx.fillStyle = on ? "rgba(94,231,255,0.95)" : "rgba(174,214,255,0.2)";
      ctx.beginPath();
      ctx.arc(x, y, on ? 6 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (width > 780 && labels && labels[i]) drawText(labels[i], x, y + 22, 10, on ? colors.muted : colors.faint, 620);
    }
  }

  function drawGuided(p, now) {
    const phase = p * 8;
    title("Flow Matching 逐步生成", "每个阶段逐层出现：条件不是装饰，速度场才是采样时真正执行的动作");
    drawTopTimeline(p, 8, ["x0", "x1", "xt", "cond", "vθ", "step", "chunk", "wave"]);

    const sourceX = width * 0.15;
    const centerX = width * 0.5;
    const targetX = width * 0.84;
    const midY = height * 0.43;
    const cardW = clamp(width * 0.19, 116, 190);
    const cardH = clamp(height * 0.18, 92, 132);
    const stageW = clamp(width * 0.34, 230, 430);
    const stageH = clamp(height * 0.28, 150, 230);

    const showNoise = phaseAmount(phase, 0);
    const showTarget = phaseAmount(phase, 1);
    const showXt = phaseAmount(phase, 2, 1.2);
    const showCond = phaseAmount(phase, 3);
    const showVelocity = phaseAmount(phase, 4);
    const showEuler = phaseAmount(phase, 5);
    const showChunk = phaseAmount(phase, 6);
    const showWave = phaseAmount(phase, 7);

    if (showNoise > 0) {
      panel(sourceX - cardW / 2, midY - cardH / 2, cardW, cardH, "rgba(94,231,255,0.06)", "rgba(94,231,255,0.24)", 10);
      drawNoiseCloud(sourceX, midY, cardW * 0.34, cardH * 0.34, showNoise, now, 130);
      drawText("x0 noise", sourceX, midY - cardH * 0.62, 12, colors.cyan, 760);
    }

    if (showTarget > 0) {
      drawSpectrogram(targetX - cardW / 2, midY - cardH / 2, cardW, cardH, showTarget, 0.75);
      drawText("x1 target Mel", targetX, midY - cardH * 0.62, 12, colors.amber, 760);
      if (showNoise > 0.3) {
        arrow(sourceX + cardW * 0.54, midY, centerX - stageW * 0.54, midY, "rgba(94,231,255,0.2)", 1.4);
        arrow(targetX - cardW * 0.54, midY, centerX + stageW * 0.54, midY, "rgba(255,198,109,0.22)", 1.4);
      }
    }

    if (showXt > 0) {
      drawMorphField(centerX - stageW / 2, midY - stageH / 2, stageW, stageH, showXt, now);
      drawText("xt: noisy Mel on the path", centerX, midY - stageH * 0.64, 12, colors.text, 760);
      const xt = clamp(showXt, 0, 1);
      drawText("xt = (1 - t)x0 + t x1", centerX, midY + stageH * 0.64, 12, colors.muted, 620);
      panel(centerX - stageW / 2, midY + stageH / 2 + 24, stageW * xt, 5, "rgba(94,231,255,0.72)", "rgba(94,231,255,0.0)", 3);
    }

    if (showCond > 0) {
      const condY = height * 0.2;
      const chipW = clamp(width * 0.14, 92, 150);
      const gap = clamp(width * 0.018, 10, 22);
      const total = chipW * 4 + gap * 3;
      const x0 = centerX - total / 2;
      [["speech token", colors.cyan], ["speaker", colors.violet], ["prompt Mel", colors.amber], ["mask", colors.teal]].forEach((item, i) => {
        const local = phaseAmount(phase, 3 + i * 0.12, 0.45);
        tag(x0 + i * (chipW + gap), condY, chipW, item[0], item[1], local > 0.02);
        if (local > 0.02) curvedArrow(x0 + i * (chipW + gap) + chipW / 2, condY + 38, centerX - 48 + i * 32, midY - stageH / 2 - 8, 18, item[1].replace("1)", (0.25 + local * 0.32) + ")"), 1.4);
      });
    }

    if (showVelocity > 0) {
      const x = centerX - stageW * 0.42;
      const y = midY - stageH * 0.34;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 7; c++) {
          const px = x + c * stageW * 0.14;
          const py = y + r * stageH * 0.17;
          const a = Math.atan2(midY + stageH * 0.25 - py, centerX + stageW * 0.35 - px) + Math.sin(now * 0.001 + r + c) * 0.16;
          const len = (12 + showVelocity * 18) * (0.75 + seed(r * 10 + c) * 0.45);
          arrow(px, py, px + Math.cos(a) * len, py + Math.sin(a) * len, "rgba(94,231,255," + (0.16 + showVelocity * 0.34) + ")", 1.1);
        }
      }
      panel(centerX - 66, midY + stageH / 2 + 48, 132, 54, "rgba(94,231,255,0.1)", "rgba(94,231,255,0.42)", 8);
      drawText("vθ(xt,t|c)", centerX, midY + stageH / 2 + 68, 14, colors.cyan, 820);
      drawText("predict velocity", centerX, midY + stageH / 2 + 88, 11, colors.muted, 560);
    }

    if (showEuler > 0) {
      const y = height * 0.77;
      const start = width * 0.13;
      const end = width * 0.72;
      drawText("Euler / ODE rollout: x ← x + Δt · vθ", width * 0.42, y - 30, 13, colors.muted, 650);
      for (let i = 0; i < 9; i++) {
        const local = clamp(showEuler * 9 - i, 0, 1);
        const x = mix(start, end, i / 8);
        const yy = y + Math.sin(i * 0.9) * 18 * (1 - i / 10);
        ctx.fillStyle = local > 0 ? "rgba(255,198,109," + (0.25 + local * 0.65) + ")" : "rgba(174,214,255,0.14)";
        ctx.beginPath();
        ctx.arc(x, yy, 4 + local * 3, 0, Math.PI * 2);
        ctx.fill();
        if (i > 0) {
          const px = mix(start, end, (i - 1) / 8);
          const py = y + Math.sin((i - 1) * 0.9) * 18 * (1 - (i - 1) / 10);
          arrow(px + 8, py, x - 8, yy, "rgba(255,198,109," + (0.1 + local * 0.36) + ")", 1.4);
        }
      }
    }

    const chunkY = height * 0.66;
    if (showChunk > 0) {
      const chunkW = clamp(width * 0.065, 42, 70);
      for (let i = 0; i < 5; i++) {
        const local = clamp(showChunk * 5 - i, 0, 1);
        const x = targetX - cardW * 0.55 + i * (chunkW + 6);
        panel(x, chunkY, chunkW, 46, local > 0 ? "rgba(88,240,196,0.12)" : "rgba(255,255,255,0.035)", local > 0 ? "rgba(88,240,196,0.44)" : colors.line, 7);
        drawText("c" + (i + 1), x + chunkW / 2, chunkY + 23, 11, local > 0 ? colors.teal : colors.faint, 760);
      }
      drawText("streaming chunks", targetX, chunkY + 70, 12, colors.teal, 720);
    }

    if (showWave > 0) {
      const waveX = width * 0.62;
      const waveY = height * 0.86;
      panel(waveX, waveY - 28, width * 0.28, 56, "rgba(255,198,109,0.06)", "rgba(255,198,109,0.28)", 8);
      drawWave(waveX + 18, waveY, width * 0.28 - 36, 18 * showWave, showWave, now);
      drawText("waveform", waveX + width * 0.14, waveY - 44, 12, colors.amber, 760);
      arrow(targetX, chunkY + 51, waveX + 22, waveY - 8, "rgba(255,198,109,0.42)", 1.5);
    }
  }

  function drawField(p, now) {
    title("速度场：局部方向累积成生成路径", "模型不是一次性画出 Mel，而是在每个 xt 上预测 velocity");
    drawTopTimeline(p, 4, ["grid", "arrows", "sample", "distribution"]);
    const left = width * 0.11;
    const right = width * 0.82;
    const top = height * 0.22;
    const bottom = height * 0.76;
    drawSpectrogram(width * 0.74, height * 0.31, width * 0.17, height * 0.28, 0.82, 0.7);
    drawText("target Mel", width * 0.825, height * 0.26, 12, colors.amber, 740);
    for (let x = left; x < right; x += width * 0.09) {
      for (let y = top; y < bottom; y += height * 0.1) {
        const delay = clamp((p * 4 - 1) / 1.4, 0, 1);
        const a = Math.atan2(height * 0.49 - y, width * 0.78 - x) + Math.sin(x * 0.02 + y * 0.02 + now * 0.001) * 0.18;
        const len = 12 + 20 * delay;
        arrow(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, "rgba(94,231,255," + (0.12 + delay * 0.22) + ")", 1.1);
      }
    }
    const sampleP = ease(clamp((p * 4 - 2) / 2, 0, 1));
    const points = [];
    for (let i = 0; i < 12; i++) {
      const q = i / 11;
      points.push({
        x: mix(width * 0.18, width * 0.72, q),
        y: height * 0.6 + Math.sin(q * Math.PI * 2.2) * 38 * (1 - q)
      });
    }
    ctx.strokeStyle = "rgba(255,111,145,0.38)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else if (i / 11 <= sampleP) ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();
    const idx = Math.min(points.length - 1, Math.floor(sampleP * (points.length - 1)));
    const dot = points[idx];
    ctx.fillStyle = colors.rose;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 8, 0, Math.PI * 2);
    ctx.fill();
    drawText("xt", dot.x, dot.y - 22, 12, colors.rose, 760);
  }

  function drawCondition(p) {
    title("条件先汇聚，再控制速度", "减少所有线直接挤向 CFM，先形成 conditional context");
    drawTopTimeline(p, 4, ["content", "acoustic", "mask", "velocity"]);
    const modelX = width * 0.57;
    const modelY = height * 0.5;
    const bundleX = width * 0.34;
    panel(bundleX - 76, modelY - 58, 152, 116, "rgba(255,198,109,0.08)", "rgba(255,198,109,0.38)", 10);
    drawText("cond", bundleX, modelY - 12, 23, colors.amber, 820);
    drawText("context bundle", bundleX, modelY + 18, 12, colors.muted, 560);
    panel(modelX - 94, modelY - 62, 188, 124, "rgba(94,231,255,0.1)", "rgba(94,231,255,0.46)", 10);
    drawText("vθ(xt,t|c)", modelX, modelY - 12, 16, colors.cyan, 820);
    drawText("conditioned velocity", modelX, modelY + 20, 12, colors.muted, 560);

    [["speech token μ", "内容", colors.cyan], ["prompt Mel", "音色/韵律", colors.amber], ["speaker style", "风格", colors.violet], ["mask / streaming", "可见性", colors.teal]].forEach((chip, i) => {
      const local = clamp(p * 4 - i, 0, 1);
      const x = width * 0.12;
      const y = height * (0.23 + i * 0.16);
      panel(x - 72, y - 29, 144, 58, local > 0 ? chip[2].replace("1)", "0.12)") : "rgba(255,255,255,0.035)", local > 0 ? chip[2].replace("1)", "0.42)") : colors.line, 8);
      drawText(chip[0], x, y - 8, 12, local > 0 ? chip[2] : colors.muted, 760);
      drawText(chip[1], x, y + 12, 11, colors.muted, 560);
      if (local > 0) arrow(x + 82, y, bundleX - 86, modelY - 36 + i * 24, chip[2].replace("1)", (0.2 + local * 0.34) + ")"), 1.4);
    });
    arrow(bundleX + 88, modelY, modelX - 106, modelY, "rgba(255,198,109,0.48)", 2);
    drawSpectrogram(width * 0.75, modelY - 58, width * 0.16, 116, clamp(p, 0.2, 1), 0.75);
    arrow(modelX + 106, modelY, width * 0.74, modelY, "rgba(94,231,255,0.5)", 2);
  }

  function drawStreaming(p) {
    title("Chunk-aware CFM：把完整生成拆成可播放片段", "重点不是少画几帧，而是让每个 chunk 有明确的依赖范围");
    drawTopTimeline(p, 4, ["tokens", "mask", "CFM", "audio"]);
    const y0 = height * 0.24;
    const chunkW = clamp(width * 0.105, 56, 104);
    const gap = clamp(width * 0.018, 10, 20);
    const startX = width * 0.08;
    for (let i = 0; i < 6; i++) {
      const x = startX + i * (chunkW + gap);
      const local = clamp(p * 6 - i, 0, 1);
      panel(x, y0, chunkW, 58, local > 0 ? "rgba(94,231,255,0.12)" : "rgba(255,255,255,0.035)", local > 0 ? "rgba(94,231,255,0.48)" : colors.line, 8);
      drawText("S" + (i + 1), x + chunkW / 2, y0 + 29, 13, local > 0 ? colors.cyan : colors.muted, 760);
      if (i > 0) {
        ctx.save();
        ctx.setLineDash([5, 6]);
        ctx.strokeStyle = local > 0 ? "rgba(255,198,109,0.34)" : "rgba(174,214,255,0.12)";
        ctx.strokeRect(x - gap + 4, y0 + 6, gap - 8, 46);
        ctx.restore();
      }
      const melY = height * 0.47;
      if (local > 0) {
        arrow(x + chunkW / 2, y0 + 68, x + chunkW / 2, melY - 10, "rgba(94,231,255,0.34)", 1.4);
        drawSpectrogram(x, melY, chunkW, 82, 0.35 + local * 0.55, 0.45);
        drawWave(x + 2, height * 0.73, chunkW - 4, 11 * local, local, performance.now());
      }
    }
    panel(width * 0.1, height * 0.84, width * 0.8, 52, "rgba(255,198,109,0.06)", "rgba(255,198,109,0.22)", 8);
    drawText("causal mask + small lookahead：少等未来，chunk 间仍保持连贯", width * 0.5, height * 0.866, 13, colors.amber, 720);
  }

  function drawTrajectory(p, now) {
    title("采样轨迹：一次生成被拆成多次小更新", "每个小面板都是一个 xt，越往右越接近目标 Mel");
    drawTopTimeline(p, 6, ["x0", ".2", ".4", ".6", ".8", "x1"]);
    const cols = width > 820 ? 6 : 3;
    const rows = width > 820 ? 1 : 2;
    const gap = 14;
    const cardW = (width * 0.84 - gap * (cols - 1)) / cols;
    const cardH = width > 820 ? height * 0.34 : height * 0.22;
    const startX = width * 0.08;
    const startY = width > 820 ? height * 0.36 : height * 0.25;
    for (let i = 0; i < 6; i++) {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const x = startX + c * (cardW + gap);
      const y = startY + r * (cardH + 58);
      const local = clamp(p * 6 - i, 0, 1);
      const q = i / 5;
      drawMorphField(x, y, cardW, cardH, clamp(q + local * 0.12, 0, 1), now, local > 0 ? 1 : 0.28);
      drawText("x" + (i === 0 ? "0" : i === 5 ? "1" : q.toFixed(1)), x + cardW / 2, y - 18, 12, local > 0 ? colors.cyan : colors.faint, 760);
      if (i < 5 && local > 0.2 && width > 820) arrow(x + cardW + 4, y + cardH / 2, x + cardW + gap - 4, y + cardH / 2, "rgba(94,231,255,0.28)", 1.3);
    }
    drawText("更新公式：xᵢ₊₁ = xᵢ + Δt · vθ(xᵢ, tᵢ | cond)", width * 0.5, height * 0.84, 14, colors.muted, 680);
  }

  function updateMeta() {
    const pct = Math.round(t * 100);
    if (label) label.textContent = "进度 " + pct + "%";
    if (modeTitle) modeTitle.textContent = modes[activeMode].title;
    const list = modes[activeMode].steps;
    const active = Math.min(list.length - 1, Math.floor(t * list.length));
    steps.forEach((node, i) => {
      if (!node) return;
      if (i >= list.length) {
        node.hidden = true;
        return;
      }
      node.hidden = false;
      node.innerHTML = "<strong>" + list[i][0] + "</strong><br>" + list[i][1];
      node.classList.toggle("active", i === active);
      node.classList.toggle("done", i < active);
    });
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.flowMode === activeMode));
    speedChips.forEach((chip) => chip.classList.toggle("active", Number(chip.dataset.flowSpeed) === speed));
  }

  function draw(now) {
    const p = ease(t);
    ctx.clearRect(0, 0, width, height);
    bg();
    if (activeMode === "guided") drawGuided(p, now);
    if (activeMode === "field") drawField(p, now);
    if (activeMode === "condition") drawCondition(p);
    if (activeMode === "streaming") drawStreaming(p);
    if (activeMode === "trajectory") drawTrajectory(p, now);
  }

  function frame(now) {
    const dt = Math.min(48, now - last);
    last = now;
    if (playing) {
      const base = activeMode === "guided" ? 15000 : 9500;
      t += (dt / base) * speed;
      if (t > 1) t = 0;
      if (progress) progress.value = t.toFixed(3);
      updateMeta();
    }
    draw(now);
    requestAnimationFrame(frame);
  }

  function jumpToStep(delta) {
    const count = modes[activeMode].steps.length;
    const current = Math.min(count - 1, Math.floor(t * count));
    const nextStep = clamp(current + delta, 0, count - 1);
    t = (nextStep + 0.04) / count;
    if (progress) progress.value = t.toFixed(3);
    playing = false;
    if (play) play.textContent = "播放";
    updateMeta();
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

  if (prev) prev.addEventListener("click", () => jumpToStep(-1));
  if (next) next.addEventListener("click", () => jumpToStep(1));
  if (replay) {
    replay.addEventListener("click", () => {
      t = 0;
      playing = true;
      if (progress) progress.value = "0";
      if (play) play.textContent = "暂停";
      updateMeta();
    });
  }

  speedChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      speed = Number(chip.dataset.flowSpeed || 1);
      updateMeta();
    });
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activeMode = tab.dataset.flowMode;
      t = activeMode === "guided" ? 0 : Math.min(t, 0.98);
      playing = true;
      if (progress) progress.value = t.toFixed(3);
      if (play) play.textContent = "暂停";
      updateMeta();
    });
  });
}
