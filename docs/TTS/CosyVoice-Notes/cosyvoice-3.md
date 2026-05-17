---
title: "CosyVoice 3：面向真实场景的多语种语音生成"
layout: default
---

# CosyVoice 3 - 面向真实场景的多语种语音生成

## 一句话总结

CosyVoice 3 在 CosyVoice 2 的 streaming LLM + CFM 架构上，通过 MinMo 派生的多任务监督 tokenizer、DiffRO 后训练、百万小时多语种数据和 1.5B/300M 模型 scaling，提升真实场景下的多语种、跨语种、情绪和复杂文本生成能力。

## 图解

![cosyvoice3 diffro gpt2](assets/cosyvoice3-diffro-gpt2.png)

- 这张图重点看 DiffRO 的优化位置：它不反复生成完整音频再打分，而是在 speech token logits 层做可微 reward optimization。
- CFM 和 vocoder 在 DiffRO 图中被弱化，是因为它们主要是下游渲染链路，不是 DiffRO 直接优化的核心对象。
- 这张流程图由 gpt-image-2 生成，用于辅助建立直觉；精确术语和链路以正文描述为准。

## 研究问题

- CosyVoice 2 已经低延迟且质量高，但在语言覆盖、领域多样性、文本格式、数据规模、后训练方法上仍不足。
- 多语种 zero-shot voice cloning 需要在内容一致性、speaker similarity、韵律自然度之间平衡。
- TTS 的 RL / post-training 难点在于：离散 token 后面还要经过 CFM 和 vocoder，直接在音频上做偏好优化代价高且反馈不稳定。
- 真实场景包含稀有词、绕口令、方言、跨语种、情绪、文本规范化、特殊符号等长尾问题。

## 核心贡献

- 提出基于 MinMo 大型音频理解模型的多任务监督 speech tokenizer，任务包括 ASR、LID、SER、AED、Speaker Analysis。
- 提出 Differentiable Reward Optimization（DiffRO），直接优化 speech token logits，而不是完整音频。
- 将训练数据扩展到约 100 万小时，覆盖 9 种语言和 18/19 个中文口音或方言；论文不同位置写法略有差异，按原文标注为“论文表述不完全一致”。
- 将 text-to-speech LM 从 0.5B 扩到 1.5B，CFM 从 100M 扩到 300M，并采用 DiT backbone。
- 引入 pronunciation inpainting、self-training for text normalization、能力迁移式 SFT。
- 发布 CV3-Eval，用于多语种、跨语种、情绪、表达性、中文口音等更贴近真实场景的评测。

## 方法框架

## 模型结构

- Speech Tokenizer：从 MinMo 派生，用 53 万小时多任务监督数据训练，输出 FSQ-MinMo token，兼顾 ASR、语言识别、情绪识别、音频事件检测、说话人分析。
- Text-to-Speech LM：保持 CosyVoice 2 的 LLM-based speech token generation 范式；模型规模从 0.5B 扩展到 1.5B；支持 raw text / TN 后文本 / 指令文本 / phoneme 混合输入。
- CFM：使用 DiT 作为 backbone；参数从 100M 扩到 300M；用简单 interpolation 解决 speech token 与 Mel frame rate mismatch。
- Vocoder：仍作为 CFM 后的波形重建模块；具体 vocoder 细节论文未明确说明。
- DiffRO Reward Models：Token2Text ASR-like model 作为内容 reward，还可加入 SER、MOS、AED 等多任务 reward。

## 训练与推理流程

- 用 53 万小时多任务数据训练 FSQ-MinMo tokenizer。
- 构建约 100 万小时多语种、多领域、多风格、多文本格式训练集。
- 训练 text-to-speech LM 与 DiT-based CFM。
- 使用 DiffRO 做 token-level 后训练：Gumbel-Softmax 采样可微 speech token，Token2Text 计算 ASR posterior reward，并用 token-level KL 约束模型不要偏离 reference model。
- 用 pronunciation inpainting 支持词 / 音素混合输入，解决多音字、稀有词、人为纠音。
- 用 self-training 生成 raw text / normalized text / inverse-normalized text 数据，增强文本规范化鲁棒性。
- SFT 阶段通过 speaker prompt、language prompt、style prompt 转移多语种和指令能力。
- 推理时可覆盖普通 zero-shot、多语种 zero-shot、跨语种 cloning、pronunciation inpainting 和 instructed generation。

## 实验结果

- SEED-TTS-Eval：CosyVoice 3-1.5B RL 的 test-zh CER 为 0.71%，test-en WER 为 1.45%；CosyVoice 3-0.5B RL 的 test-hard CER 为 5.09%，优于 CosyVoice 2 的 6.83%。
- 相比 CosyVoice 2，论文报告 test-zh / test-en 分别有约 44% / 51% 内容一致性相对提升。
- CV3-Eval 多语种：CosyVoice 3 是表中唯一覆盖 zh/en/ja/ko/de/es/fr/it/ru 全部语言的系统。
- DiffRO 在多语种 voice cloning 上普遍降低 CER/WER，例如 ko 从 12.8 降到 4.02（0.5B）。
- Cross-lingual voice cloning：CosyVoice 3-1.5B 在 zh2en / en2zh 上 WER 优于 CosyVoice 2、F5-TTS、Spark-TTS。
- Emotion cloning：text-related 情绪更容易；text-unrelated 情绪准确率明显下降，说明系统仍强依赖文本情感线索。
- Tokenizer 消融：监督 tokenizer 明显优于 SoundStream 这类纯声学 token；数据从 3000 小时增至 17 万小时后，内容一致性和 speaker similarity 大幅提升。
- Pronunciation inpainting：RepMono + MixPhn 在中英文错误样本上 correction rate 达到 100%。
- Instructed generation：CosyVoice 3 在 style similarity 上相对 CosyVoice 2 约有 11% 提升；Expresso 上 WER 反而更高，论文指出这与 ASR 对标准发音的偏置有关。

## 工程价值

- 更接近真实生产：覆盖多语言、方言、口音、特殊符号、稀有词、跨语种 cloning 和表达性风格。
- DiffRO 比完整音频级 RL 更适合 LLM-based TTS，因为它绕过 CFM/vocoder 的高成本采样，把优化目标放在 speech token 上。
- Pronunciation inpainting 给生产系统提供可控纠音入口，适合人名、地名、品牌名、多音字。
- 自训练 TN 降低手写规则覆盖不足的问题，让 raw text 到 speech 的链路更统一。
- CV3-Eval 暴露传统 SEED 类评测覆盖不足的问题，提示工程系统要建设自己的长尾评测集。

## 局限性

- 文本指令仍不能控制 timbre 等声学特征。
- 唱歌生成效果仍不好，需要在 tokenizer 和 LM 训练阶段加入 singing data。
- DiffRO 可能出现 reward hacking：内容 reward 变好但 speaker similarity 或情绪/发音受损。
- hard samples 中的稀有词、绕口令、重复词仍然困难，reward model 对这些样本的帮助有限。
- 日语、韩语仍存在一定错误率：日语受 kanji/kana 和多读音影响，韩语受数据量和质量限制。
- 论文未明确给出所有 vocoder 细节，也未充分展开在线部署延迟指标。

## prerequisite / related / confusing_with

### prerequisite

- [CosyVoice 2 - 可流式的大语言模型 TTS](cosyvoice-2.md)
- [MinMo](prerequisites.md)
- [Differentiable Reward Optimization](prerequisites.md)
- [Gumbel-Softmax](prerequisites.md)
- [Text Normalization](prerequisites.md)
- [Pronunciation Inpainting](prerequisites.md)
- [Diffusion Transformer](prerequisites.md)

### related

- <code>CV3-Eval</code>
- <code>Seed-TTS</code>
- <code>F5-TTS</code>
- <code>Spark-TTS</code>
- <code>Qwen2.5-Omni</code>

### confusing_with

- DiffRO vs DPO/RLHF：DiffRO 用可微 speech token 和 reward model 直接反传，不是对完整音频做偏好采样训练。
- Tokenizer scaling vs model scaling：前者提升中间表示质量，后者提升生成模型容量。
- 多语种 cloning vs 跨语种 cloning：多语种是目标语言覆盖；跨语种是参考语音语言和目标文本语言不同。
- TN self-training vs pronunciation inpainting：TN 解决 raw text 规范化；inpainting 解决局部发音可控。

## 我需要重点掌握的知识点

- CosyVoice 3 的关键词是 in-the-wild：多语种、长尾文本、方言、情绪、跨语种和后训练。
- DiffRO 是 CosyVoice 3 最值得掌握的后训练方法：它把 TTS reward 优化从音频级下沉到 token 级。
- 多任务 tokenizer 不是只为 ASR，而是为了让 speech token 承载更丰富的副语言和音频理解信息。
- Scaling 对 TTS 有效，但百万小时后边际收益变小，数据质量和长尾覆盖同样重要。
- 生产级 TTS 需要显式纠音机制，不能只依赖 raw text + BPE。
