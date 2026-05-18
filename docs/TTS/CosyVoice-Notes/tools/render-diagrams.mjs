import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../assets");
mkdirSync(outDir, { recursive: true });

const W = 1536;
const H = 1024;
const C = {
  bg: "#f8fafc",
  ink: "#162033",
  muted: "#5f6f86",
  faint: "#d8e0ea",
  panel: "#ffffff",
  blue: "#2f6feb",
  cyan: "#0ea5b7",
  green: "#1f9d67",
  amber: "#b7791f",
  rose: "#c2415a",
  violet: "#6d5bd0",
};

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const attrs = (o) => Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}="${esc(v)}"`).join(" ");

function wrap(text, max = 18) {
  const s = String(text);
  const parts = s.includes(" ") ? s.split(/\s+/) : Array.from(s);
  const lines = [];
  let line = "";
  for (const p of parts) {
    const next = s.includes(" ") ? (line ? `${line} ${p}` : p) : line + p;
    if ([...next].length > max && line) {
      lines.push(line);
      line = p;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

class Svg {
  constructor(title, subtitle = "") {
    this.parts = [];
    this.parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    this.parts.push(`<defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#14213d" flood-opacity="0.10"/></filter>
      <marker id="arrow" markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto"><path d="M2,2 L12,7 L2,12 Z" fill="#64748b"/></marker>
      <marker id="arrowBlue" markerWidth="14" markerHeight="14" refX="11" refY="7" orient="auto"><path d="M2,2 L12,7 L2,12 Z" fill="${C.blue}"/></marker>
      <linearGradient id="hero" x1="0" x2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="0.55" stop-color="#12324a"/><stop offset="1" stop-color="#075985"/></linearGradient>
    </defs>`);
    this.parts.push(`<rect width="1536" height="1024" fill="${C.bg}"/>`);
    this.parts.push(`<path d="M0 210 C230 145 370 260 570 180 C850 70 1120 110 1536 18 L1536 0 L0 0 Z" fill="#eaf4ff"/>`);
    this.parts.push(`<path d="M0 1024 L1536 1024 L1536 830 C1260 890 980 800 720 874 C450 950 240 870 0 930 Z" fill="#f0f7f4"/>`);
    if (title) {
      this.text(title, 88, 82, { size: 44, weight: 760, fill: C.ink });
      if (subtitle) this.text(subtitle, 90, 132, { size: 22, fill: C.muted });
    }
  }
  raw(s) { this.parts.push(s); return this; }
  text(s, x, y, opt = {}) {
    const { size = 20, fill = C.ink, weight = 500, anchor = "start", max = 36, lh = 1.28 } = opt;
    const lines = opt.wrap === false ? [s] : wrap(s, max);
    this.parts.push(`<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">`);
    lines.forEach((line, i) => this.parts.push(`<tspan x="${x}" dy="${i === 0 ? 0 : size * lh}">${esc(line)}</tspan>`));
    this.parts.push(`</text>`);
    return this;
  }
  box(x, y, w, h, title, body = "", opt = {}) {
    const fill = opt.fill || C.panel;
    const stroke = opt.stroke || "#cbd5e1";
    const band = opt.band || opt.accent || C.blue;
    this.parts.push(`<g filter="url(#shadow)">`);
    this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`);
    this.parts.push(`<rect x="${x}" y="${y}" width="8" height="${h}" rx="4" fill="${band}"/>`);
    this.parts.push(`</g>`);
    this.text(title, x + 28, y + 42, { size: opt.titleSize || 24, weight: 750, fill: opt.titleFill || C.ink, max: Math.floor((w - 56) / 24) });
    if (body) this.text(body, x + 28, y + 82, { size: opt.bodySize || 18, fill: opt.bodyFill || C.muted, max: Math.floor((w - 56) / 17) });
    return this;
  }
  pill(x, y, w, text, color = C.blue) {
    this.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="42" rx="21" fill="${color}" opacity="0.10" stroke="${color}" stroke-width="1.2"/>`);
    this.text(text, x + w / 2, y + 27, { size: 17, fill: color, weight: 720, anchor: "middle", wrap: false });
  }
  line(x1, y1, x2, y2, opt = {}) {
    const color = opt.color || "#64748b";
    const dash = opt.dash ? `stroke-dasharray="${opt.dash}"` : "";
    const marker = opt.arrow === false ? "" : `marker-end="url(#${opt.blue ? "arrowBlue" : "arrow"})"`;
    this.parts.push(`<path d="M${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${opt.width || 2.2}" ${dash} ${marker}/>`);
  }
  straight(x1, y1, x2, y2, opt = {}) {
    const color = opt.color || "#64748b";
    const marker = opt.arrow === false ? "" : `marker-end="url(#${opt.blue ? "arrowBlue" : "arrow"})"`;
    this.parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${opt.width || 2.2}" ${marker}/>`);
  }
  end(name) {
    this.parts.push(`</svg>`);
    writeFileSync(join(outDir, name), this.parts.join("\n"));
  }
}

function pipeline(name, title, subtitle, nodes, opt = {}) {
  const s = new Svg(title, subtitle);
  const y = opt.y || 360, x0 = 90, gap = 28, w = (1356 - gap * (nodes.length - 1)) / nodes.length, h = opt.h || 210;
  nodes.forEach((n, i) => {
    const x = x0 + i * (w + gap);
    s.pill(x, y - 62, 130, String(i + 1).padStart(2, "0"), n.color);
    s.box(x, y, w, h, n.title, n.body, { accent: n.color, titleSize: 23 });
    if (i < nodes.length - 1) s.straight(x + w + 8, y + h / 2, x + w + gap - 8, y + h / 2, { color: "#94a3b8" });
  });
  if (opt.footer) s.box(250, 760, 1036, 122, opt.footer.title, opt.footer.body, { accent: C.cyan, fill: "#f8fffd" });
  s.end(name);
}

function matrix(name, title, subtitle, cols, rows) {
  const s = new Svg(title, subtitle);
  const x = 100, y = 230, cw = 330, ch = 184, gap = 28;
  cols.forEach((c, i) => s.pill(x + i * (cw + gap), y - 62, 220, c, [C.blue, C.green, C.amber, C.rose][i] || C.violet));
  rows.forEach((row, r) => row.forEach((cell, c) => {
    s.box(x + c * (cw + gap), y + r * (ch + gap), cw, ch, cell.title, cell.body, { accent: cell.color || [C.blue, C.green, C.amber, C.rose][c], titleSize: 22, bodySize: 17 });
  }));
  s.end(name);
}

function centralHub(name, title, subtitle, groups, hub) {
  const s = new Svg(title, subtitle);
  const leftX = 90, rightX = 1060, top = 230, bw = 360, bh = 126, gap = 26;
  groups.slice(0, 4).forEach((g, i) => {
    const y = top + i * (bh + gap);
    s.box(leftX, y, bw, bh, g.title, g.body, { accent: g.color, titleSize: 22, bodySize: 16 });
    s.line(leftX + bw + 12, y + bh / 2, 720, 512, { color: g.color, blue: g.color === C.blue, width: 2 });
  });
  groups.slice(4).forEach((g, i) => {
    const y = top + i * (bh + gap);
    s.box(rightX, y, bw, bh, g.title, g.body, { accent: g.color, titleSize: 22, bodySize: 16 });
    s.line(rightX - 12, y + bh / 2, 816, 512, { color: g.color, width: 2 });
  });
  s.raw(`<circle cx="768" cy="512" r="122" fill="#ffffff" stroke="${C.blue}" stroke-width="2.4" filter="url(#shadow)"/>`);
  s.text(hub.title, 768, 492, { size: 30, weight: 800, anchor: "middle", wrap: false, fill: C.ink });
  s.text(hub.body, 768, 532, { size: 18, anchor: "middle", max: 12, fill: C.muted });
  s.end(name);
}

function flowLandscape() {
  const s = new Svg("Flow Matching：从噪声到 Mel", "读图顺序：起点 x0 → 中间态 xt → 条件速度场 → 目标 Mel x1");
  const xs = [120, 430, 750, 1080], y = 320;
  [["x0 噪声 Mel", "随机采样，没有语音结构", C.rose], ["xt 中间状态", "路径上的某个时刻", C.amber], ["vθ 条件速度场", "预测下一步方向", C.blue], ["x1 / 生成 Mel", "形成可送入 vocoder 的声学图", C.green]].forEach((n, i) => {
    s.box(xs[i], y, 250, 170, n[0], n[1], { accent: n[2], titleSize: 23 });
    if (i < 3) s.straight(xs[i] + 260, y + 85, xs[i + 1] - 12, y + 85, { color: "#718096" });
  });
  for (let i = 0; i < 42; i++) {
    const x = 130 + (i % 14) * 85;
    const yy = 650 + Math.floor(i / 14) * 68 + ((i * 13) % 18);
    const dx = 42 + ((i * 17) % 46);
    s.raw(`<path d="M${x} ${yy} q${dx} ${-30 + (i % 5) * 12} ${dx + 38} ${-4 + (i % 7) * 4}" fill="none" stroke="#94a3b8" stroke-width="1.4" opacity="0.7" marker-end="url(#arrow)"/>`);
  }
  s.box(1050, 642, 370, 150, "CosyVoice 条件", "speech token / prompt Mel / speaker / mask 共同约束速度场", { accent: C.cyan, fill: "#f7fffd" });
  s.end("flow-matching-landscape-gpt.svg");
}

const commonPipeline = [
  { title: "Text / Instruction", body: "目标文本、发音提示、风格指令", color: C.blue },
  { title: "Speech Tokenizer", body: "把参考语音压成离散 speech token", color: C.green },
  { title: "LLM", body: "生成目标 speech token 序列", color: C.violet },
  { title: "Flow Matching", body: "把 token 渲染成连续 Mel", color: C.cyan },
  { title: "Vocoder", body: "Mel → waveform，可播放音频", color: C.amber },
];

pipeline("cosyvoice-system-pipeline-gpt-v3.svg", "CosyVoice 系统主路径", "LLM 管离散语义，Flow Matching 管连续声学，Vocoder 管最终波形", commonPipeline, { h: 190, footer: { title: "关键分工", body: "不要把 speech token、Mel 和 waveform 混成一层：三者分别对应离散语义、连续声学表示和最终音频。" } });
pipeline("cosyvoice-site-system-gpt.svg", "CosyVoice 学习地图", "先抓模块职责，再看版本演进和 Flow Matching 细节", commonPipeline.slice(1), { h: 210, y: 350, footer: { title: "学习主线", body: "Tokenizer 定义语音中间语言；LLM 负责生成；CFM 渲染声学；Vocoder 输出声音。" } });

pipeline("cosyvoice-series-evolution-gpt2.svg", "CosyVoice 1 → 2 → 3", "每一代解决一个更接近真实产品的问题", [
  { title: "CosyVoice 1", body: "监督语义 S3 token；建立 zero-shot TTS 骨架", color: C.blue },
  { title: "CosyVoice 2", body: "FSQ + streaming LM；降低首包延迟", color: C.green },
  { title: "CosyVoice 3", body: "MinMo + DiffRO；多语种、长尾和后训练", color: C.rose },
], { y: 360, h: 240, footer: { title: "演进逻辑", body: "从内容一致性，到实时交互，再到真实复杂输入的鲁棒性。" } });
pipeline("cosyvoice-site-versions-gpt.svg", "三代能力演进", "不是堆参数，而是逐步打开更真实的使用场景", [
  { title: "V1：可用", body: "监督 token 解决内容对齐", color: C.blue },
  { title: "V2：实时", body: "流式 LM + chunk-aware CFM", color: C.green },
  { title: "V3：真实场景", body: "多语种、后训练、复杂文本", color: C.rose },
], { y: 370, h: 220 });

centralHub("cosyvoice-flowmatching-conditions-gpt-v3.svg", "Conditional Flow Matching 条件结构", "把条件先汇聚为上下文，再约束速度场，避免所有线直接挤向 CFM", [
  { title: "内容条件", body: "speech token μ：决定说什么", color: C.blue },
  { title: "参考声学", body: "prompt Mel：提供音色与韵律线索", color: C.green },
  { title: "风格条件", body: "speaker / style：说话人和表达方式", color: C.violet },
  { title: "当前状态", body: "noisy y / x_t：当前 Mel 位置", color: C.rose },
  { title: "时间步", body: "t：生成路径上的位置", color: C.amber },
  { title: "可见性约束", body: "mask / streaming：限制上下文范围", color: C.cyan },
], { title: "vθ(x,t|c)", body: "预测速度场" });

pipeline("cosyvoice-flowmatching-evolution-gpt2.svg", "Flow Matching 在 CosyVoice 中的演进", "从离线 token-to-mel 到可流式、再到更大容量 DiT-CFM", [
  { title: "V1 CFM", body: "完整上下文渲染 Mel，质量优先", color: C.blue },
  { title: "V2 Chunk-aware CFM", body: "同一模型支持 non-streaming / streaming", color: C.green },
  { title: "V3 DiT-CFM", body: "更大容量 backbone，服务多语种复杂场景", color: C.rose },
], { y: 360, h: 230 });

matrix("cosyvoice-prerequisites-map-gpt-v2.svg", "CosyVoice 前置知识地图", "按理解阻塞点分组，而不是按术语表堆叠", ["表示层", "生成层", "流式层", "后训练层"], [
  [
    { title: "Speech Tokenizer", body: "语音的离散中间语言" },
    { title: "Autoregressive LM", body: "像文本一样生成 speech token" },
    { title: "Streaming TTS", body: "边读文本边输出语音" },
    { title: "DiffRO", body: "token 级可微奖励优化" },
  ],
  [
    { title: "VQ / FSQ / MinMo", body: "从 codebook 到多任务 tokenizer" },
    { title: "Flow Matching", body: "从噪声 Mel 走向目标 Mel" },
    { title: "Chunk Mask", body: "控制未来信息可见性" },
    { title: "TN / Pronunciation", body: "处理真实文本和发音控制" },
  ],
]);

pipeline("cosyvoice-learning-path-gpt-v3.svg", "推荐学习路径", "先补阻塞概念，再进入论文细节，最后用卡片复习", [
  { title: "01 TTS 目标", body: "zero-shot / 内容一致性 / speaker similarity", color: C.blue },
  { title: "02 表示层", body: "speech token、VQ、FSQ、MinMo", color: C.green },
  { title: "03 生成链路", body: "LLM → CFM → Vocoder", color: C.violet },
  { title: "04 工程扩展", body: "streaming、TN、DiffRO、多语种评测", color: C.rose },
], { y: 350, h: 230 });

matrix("cosyvoice-vq-fsq-comparison-gpt-v3.svg", "VQ 与 FSQ 对比", "核心区别：VQ 依赖 learned codebook；FSQ 用标量量化改善利用率和训练稳定性", ["VQ", "FSQ", "对 TTS 的影响"], [
  [
    { title: "Codebook lookup", body: "向量映射到最近的可学习 code" },
    { title: "Scalar levels", body: "每个维度独立离散化，再组合成 token" },
    { title: "内容一致性", body: "token 利用率越高，越少丢失上下文变化" },
  ],
  [
    { title: "风险", body: "codebook collapse，部分 code 长期不用" },
    { title: "收益", body: "更高 codebook utilization，结构更简单" },
    { title: "CosyVoice 2", body: "用 FSQ 替换 VQ 是质量和流式化基础之一" },
  ],
]);

centralHub("cosyvoice-prereq-relation-gpt-v3.svg", "前置概念之间的关系", "这些概念不是并列清单，而是围绕 TTS 生成链路分工", [
  { title: "Zero-shot TTS", body: "目标：像谁说、说什么", color: C.blue },
  { title: "Tokenizer", body: "连续语音 → 离散 token", color: C.green },
  { title: "LLM", body: "文本条件 → speech token", color: C.violet },
  { title: "Flow Matching", body: "token 条件 → Mel", color: C.cyan },
  { title: "Streaming", body: "限制未来上下文", color: C.amber },
  { title: "Post-training", body: "用 reward 修正长尾错误", color: C.rose },
], { title: "CosyVoice", body: "模块化 TTS 系统" });

pipeline("cosyvoice-tokenizer-evolution-gpt-v3.svg", "Tokenizer 演进", "从语义 token 到多任务音频理解 token", [
  { title: "V1：S3 token", body: "ASR encoder + VQ，突出语义和文本对齐", color: C.blue },
  { title: "V2：FSQ token", body: "提高 codebook 利用率，支持更稳序列生成", color: C.green },
  { title: "V3：MinMo token", body: "ASR/LID/SER/AED/SA 多任务监督", color: C.rose },
], { y: 360, h: 230 });

pipeline("cosyvoice1-architecture-gpt2.svg", "CosyVoice 1 架构", "核心贡献：用监督语义 token 建立高质量 zero-shot TTS 骨架", [
  { title: "Prompt Speech", body: "参考语音提供音色和上下文", color: C.green },
  { title: "S3 Tokenizer", body: "ASR encoder + VQ 得到语义 token", color: C.blue },
  { title: "Text-to-token LLM", body: "目标文本 → speech token", color: C.violet },
  { title: "Conditional FM", body: "speech token + prompt 条件 → Mel", color: C.cyan },
  { title: "Vocoder", body: "Mel → waveform", color: C.amber },
], { y: 340, h: 220 });

pipeline("cosyvoice2-streaming-gpt2.svg", "CosyVoice 2 流式链路", "把离线 TTS 改造成低首包延迟的实时系统", [
  { title: "Text chunks", body: "文本按块进入统一 LM", color: C.blue },
  { title: "Streaming LM", body: "边读文本边生成 speech token", color: C.green },
  { title: "Chunk-aware CFM", body: "mask 控制可见上下文", color: C.cyan },
  { title: "Incremental Mel", body: "分块生成声学特征", color: C.violet },
  { title: "Audio output", body: "持续送入 vocoder 播放", color: C.amber },
], { y: 340, h: 220, footer: { title: "关键取舍", body: "流式模式降低延迟，但可见上下文更少；复杂文本上内容一致性风险更高。" } });

pipeline("cosyvoice3-diffro-gpt2.svg", "CosyVoice 3：DiffRO 与真实场景", "在 token 级优化奖励，避免完整音频级 RL 的高成本", [
  { title: "LM logits", body: "生成 speech token 分布", color: C.blue },
  { title: "Gumbel-Softmax", body: "让采样近似可微", color: C.green },
  { title: "Token2Text reward", body: "约束内容可还原", color: C.violet },
  { title: "KL constraint", body: "限制偏离 reference model", color: C.rose },
  { title: "Better tokens", body: "改善长尾文本和多语种鲁棒性", color: C.amber },
], { y: 340, h: 220 });

pipeline("cosyvoice-anki-overview-gpt-v2.svg", "Anki 复习卡片结构", "把系统理解拆成可检索、可复习的单知识点", [
  { title: "模块职责", body: "Tokenizer / LLM / CFM / Vocoder", color: C.blue },
  { title: "版本差异", body: "V1 / V2 / V3 解决的问题", color: C.green },
  { title: "关键机制", body: "FSQ、CFM、DiffRO、streaming mask", color: C.violet },
  { title: "风险边界", body: "reward balance、speaker similarity、长尾文本", color: C.rose },
], { y: 350, h: 230 });

function hero() {
  const s = new Svg("", "");
  s.raw(`<rect width="1536" height="1024" fill="url(#hero)"/>`);
  s.raw(`<g opacity="0.18">${Array.from({ length: 16 }, (_, i) => `<line x1="${80 + i * 95}" y1="120" x2="${30 + i * 95}" y2="900" stroke="#ffffff" stroke-width="1"/>`).join("")}</g>`);
  s.text("CosyVoice", 100, 180, { size: 94, weight: 820, fill: "#ffffff", wrap: false });
  s.text("从 speech token 到 Flow Matching 的系统学习图谱", 106, 250, { size: 34, fill: "#dbeafe", max: 34 });
  const nodes = [
    ["Text", 150, 430, C.blue], ["Tokenizer", 420, 340, C.green], ["LLM", 690, 430, C.violet], ["CFM", 960, 340, C.cyan], ["Waveform", 1230, 430, C.amber]
  ];
  nodes.forEach(([t, x, y, col], i) => {
    s.raw(`<rect x="${x}" y="${y}" width="190" height="110" rx="18" fill="#ffffff" opacity="0.94"/><rect x="${x}" y="${y}" width="8" height="110" rx="4" fill="${col}"/>`);
    s.text(t, x + 95, y + 66, { size: 25, weight: 760, fill: C.ink, anchor: "middle", wrap: false });
    if (i < nodes.length - 1) s.straight(x + 205, y + 55, nodes[i + 1][1] - 15, nodes[i + 1][2] + 55, { color: "#bfdbfe", width: 3 });
  });
  s.text("LLM 生成离散语义，Flow Matching 渲染连续声学，Vocoder 还原声音。", 108, 820, { size: 30, fill: "#e0f2fe", max: 34 });
  s.end("cosyvoice-site-hero-gpt.svg");
}
hero();
flowLandscape();
