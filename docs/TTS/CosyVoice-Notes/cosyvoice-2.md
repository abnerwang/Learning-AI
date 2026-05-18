---
title: "CosyVoice 2：可流式的大语言模型 TTS"
layout: default
---

# CosyVoice 2 - 可流式的大语言模型 TTS

## 一句话总结

CosyVoice 2 在 CosyVoice 1 的两阶段范式上，改用 FSQ speech tokenizer、预训练文本 LLM backbone、统一流式/非流式 text-speech LM 和 chunk-aware causal Flow Matching，实现低延迟且近乎无损的流式零样本 TTS。

## 图解

![CosyVoice 2 流式链路图](assets/cosyvoice2-streaming-gpt2.png)

- 这张图重点看“流式”不是单点能力：LM 要边生成 speech token，CFM 要按 chunk 渲染 Mel，vocoder 要持续输出音频。
- T 表示 text token，S 表示 speech token；交错生成是降低首包延迟的关键。
- 这张流程图已按统一信息图规范重绘，用于辅助建立直觉；精确术语和链路以正文描述为准。

## 研究问题

- CosyVoice 1 质量较高，但主要是离线合成，不适合实时语音聊天等低延迟交互。
- 传统 hybrid TTS 中，LM + diffusion / flow 的组合很强，但流式方案不成熟。
- 原始 CosyVoice 的 text encoder 和 speaker embedding 让架构复杂，也不利于直接复用预训练文本 LLM。
- VQ tokenizer 存在 codebook 利用率问题，可能限制语义信息容量。

## 核心贡献

- 提出统一流式和非流式合成框架：同一个 text-speech LM 和 chunk-aware Flow Matching 支持两种模式。
- 移除 text encoder 和 LM 侧 speaker embedding，使 Qwen2.5-0.5B 等预训练文本 LLM 可直接作为 backbone。
- 用 FSQ 替代 VQ，提高 codebook 利用率和内容一致性。
- 提出 chunk-aware causal Flow Matching，用不同 attention mask 在质量和延迟之间切换。
- 扩展 instructed TTS：支持 emotion、accent、role style、fine-grained vocal burst 等控制。
- 分析 streaming 首包延迟，为 LLM voice chat 场景提供工程公式。

## 方法框架

## 模型结构

- Text Tokenizer：直接使用 raw text，不再显式使用 text encoder；为流式合成屏蔽 BPE 中的多字符 token。
- FSQ Speech Tokenizer：基于 SenseVoice-large encoder；token rate 为 25 Hz；目标是更充分利用 codebook，并减少说话人信息泄漏。
- Unified Text-Speech LM：使用预训练 Qwen2.5-0.5B 初始化；非流式先给完整文本 token，再生成 speech token；流式按预设 N:M 比例混合 text token 和 speech token。
- Chunk-aware Flow Matching：speech token 为 25 Hz，Mel 为 50 Hz，需要 upsampling；支持 non-causal、full-causal、chunk-M、chunk-2M 等 mask。
- Vocoder：论文说明使用预训练 vocoder 将 Mel 转 waveform，但具体 vocoder 架构未在核心方法中详细展开，标注为论文未明确说明。

## 训练与推理流程

- 用 20 万小时数据训练 speech tokenizer，其中中英数据用于 tokenizer 训练，后续显示有跨语种 zero-shot 能力。
- 构造统一 text-speech 序列，同时训练 streaming 和 non-streaming 模式。
- 训练 chunk-aware Flow Matching，让同一 CFM 适配不同 mask 和延迟需求。
- 用约 17 万小时多语种数据训练 CosyVoice 2，覆盖中英粤日韩等。
- 加入 instruction 数据训练情绪、口音、角色、细粒度控制。
- ICL 非流式：输入参考文本、参考 speech token、完整待合成文本，LM 生成完整 speech token，CFM 一次性生成。
- ICL 流式：待合成文本已知，LM 按文本/speech token 比例逐步输出，CFM 按 chunk 渲染。
- SFT 场景：目标说话人已 fine-tune，输入文本即可生成目标说话人语音；流式时同样交错输出。

## 实验结果

- LibriSpeech test-clean：CosyVoice 2 WER 2.47%，NMOS 3.96，SS 0.745；相比 CosyVoice 1 的 2.89% / 3.93 / 0.743 有提升。
- CosyVoice 2-S 流式版本 WER 2.45%，SS 0.751，基本无损。
- SEED test-zh：CosyVoice 2 CER 1.45%，SS 0.748 / 0.806。
- SEED test-en：WER 2.57%，SS 0.652 / 0.736。
- SEED test-hard：WER/CER 6.83%，SS 0.724 / 0.776；流式 hard set 退化到 8.08。
- 模块消融：LLM 初始化、删除 speaker embedding、FSQ 均提升内容一致性；FSQ 将 test-zh CER 从 2.56 降到 1.45，test-en WER 从 3.81 降到 2.57。
- 日语/韩语：test-ja CER 18.79%，test-ko CER 7.98%；日语明显更难，原因是日中字符重叠导致发音混淆。
- 指令控制：CosyVoice 2 MOS-I 4.06，高于 CosyVoice-Instruct 的 3.09；去掉 instruction 后 MOS-I 降到 2.28。
- SFT + RL：目标说话人 SFT 提升 speaker similarity 和 NMOS，但 WER 可能变差；ASR reward 和 DPO 可改善 WER，ASR posterior reward 泛化更稳。

## 工程价值

- 解决低延迟 TTS 的核心工程问题：边生成 speech token，边渲染 Mel，边 vocoder 出音频。
- 同一模型兼容 streaming 和 offline，减少维护两套模型的成本。
- 可直接利用预训练 LLM，降低从零训练 text-speech LM 的成本。
- FSQ 提升 tokenizer 稳定性和 codebook 利用率，对生产系统的内容一致性很关键。
- chunk mask 提供质量 / 延迟旋钮，适合语音助手、实时对话、长文本播报等不同场景。

## 局限性

- 语言覆盖仍有限，尤其日语等与中文存在字符重叠的语言会出现发音混淆。
- 文本指令仍不能控制 timbre 等声学特征。
- 唱歌生成效果不好。
- 流式在 hard set 会出现内容一致性退化。
- speaker similarity 自动评测依赖不同 SV 模型，指标一致性仍是开放问题。

## prerequisite / related / confusing_with

### prerequisite

- [CosyVoice 1 - 监督语义 Token 的可扩展零样本 TTS](cosyvoice-1.md)
- [Finite Scalar Quantization](prerequisites.md)
- [Streaming TTS](prerequisites.md)
- [Chunked Attention](prerequisites.md)
- [Conditional Flow Matching](flow-matching.md)
- [Qwen](prerequisites.md)

### related

- [CosyVoice 3 - 面向真实场景的多语种语音生成](cosyvoice-3.md)
- <code>Seed-TTS</code>
- <code>F5-TTS</code>
- <code>E2 TTS</code>
- <code>MaskGCT</code>

### confusing_with

- Streaming LM vs Streaming FM：前者决定 token 何时生成，后者决定 Mel 何时渲染。
- FSQ vs VQ：FSQ 用有限标量组合构造 codebook，强调利用率；VQ 从向量 codebook 最近邻取 index。
- Non-causal / Full-causal / Chunk mask：不是不同模型，而是同一 CFM 的不同注意力可见范围。
- Instruction control vs speaker cloning：instruction 控制风格和副语言，speaker cloning 主要来自参考语音 / CFM 条件。

## 我需要重点掌握的知识点

- CosyVoice 2 的本质升级是生产可用的流式化、架构简化和 tokenizer 改良。
- 预训练文本 LLM 能用于 TTS 的前提，是输入输出序列形式被设计成 text-speech token 混合序列。
- 流式 TTS 的难点不只是 LLM 逐 token 输出，还包括 Flow Matching 如何 chunk-aware 地渲染声学特征。
- FSQ 对内容一致性很关键，因为它缓解 VQ codebook 利用率不足。
- 指令能力需要数据显式训练，不应假设自然涌现。
