# 第 08 课：为什么需要 Chunk？—— 切分粒度、重叠窗口与语义边界工程

> **核心目标**：攻克检索体系最后一个未被审视的根本前提 —— **“整篇文档（Document）作为检索与注入的不可分割原子”**。深入剖析万字巨型长文档下双塔均值池化（Pooling Amnesia）的二次失效与单塔 Cross-Encoder 注意力窗口物理超限；从第一性原理推导**“定位精度（Precision）与上下文完整性（Integrity）的不可调和博弈”**；严密论证定长滑窗、Markdown 结构感知分割与连续句向量语义切分（Semantic Valley Detection）的几何优劣；量化 Overlap 重叠窗口的补救率与索引膨胀代价；从零手写工业级 **Chunking 语料变换层**与 **Small-to-Big（Parent-Child）两级展开架构**，最终确立黄金法则 —— **检索的原子单位与注入的原子单位，绝不必相同。**

---

## 1. 承前启后：一个从未被审视的根本前提

在 Context Engineering 前 7 课的体系演化中，我们由浅入深构建起了一条日益精密的知识检索通道：

```text
C0/C1 (私有知识注入) ➔ 确立 Prompt 注入 Context 是解决大模型知识真空的唯一物理途径
     │
     ▼
C2 (Sufficient Context) ➔ 揭示全部塞满会导致注意力稀释与成本失控，确立“刚刚好”原则与信噪比（SNR）概念
     │
     ▼
C3 (词法检索 Grep) ➔ 倒排索引实现离散精确代码符号检索，但陷入“同义词汇鸿沟”
     │
     ▼
C4 (语义检索 Dense Vector) ➔ 高维连续空间捕捉口语化模糊意图，但遭遇“向量万能论”幻觉
     │
     ▼
C5 (向量失真边界) ➔ 均值池化与 BPE 分词切碎导致错误码（ERR_9021）与专有符号惨烈脱靶
     │
     ▼
C6 (双轨融合 Hybrid RRF) ➔ 并联 Lexical 与 Semantic 漏斗，手写 RRF 算法，召回率跃升至 100%
     │
     ▼
C7 (Cross-Encoder 精排) ➔ 引入两阶段漏斗，全量 Token 交叉注意力攻克特例覆盖与时效版本冲突
     │
     ▼
【第 8 课 本课核心】：整篇文档动辄上万字怎么办？
  整篇文档原子假设破裂 ➔ 三重物理撞墙 ➔ 语料切片与 Small-to-Big 检索与注入解耦！
```

### 1.1 “整篇文档”假设的崩塌

在 C0 到 C7 的所有实验中，整套检索体系都默默遵循着一个不言自明的假设：

> **检索、重排与注入的最小原子单位，始终是“整篇文档（Document）”。**

在早期的小微基准语料库中，这个假设完美成立：每篇文档仅有 $200 \sim 500$ Token（约 $1\text{KB}$），文档与单一技术概念天然重合，“文档”本身就是一个自洽的信息单元。

然而，一旦进入真实的企业级生产环境，我们在第 7 课结尾埋下的伏笔立刻迎面撞上残酷的现实：

```text
现实世界中的真实企业文档：
┌────────────────────────────────────────────────────────────────────────┐
│ 《企业级云平台运维与故障排查规约 (docs/ops-handbook.md)》               │
│   —— 全文包含 16 个章节，共计 5,688 Tokens，详述数百条参数与流程；      │
│   —— 而回答用户故障问题的“决定性事实”，仅仅占其中的 60 个 Tokens！      │
└────────────────────────────────────────────────────────────────────────┘
```

当用户提问：*“遇到配额风暴 ERR_QUOTA_STORM_4417 时，CloudQuotaGuard 的 maxInflight 应该调到多少？”*

如果仍然以“整篇文档”为单位进行处理，检索体系的三大核心组件将**同时撞上物理死墙**：

| 环节 | 物理死墙与失效机理 |
| :--- | :--- |
| **Bi-Encoder 双塔向量** | **均值池化（Mean Pooling）的二次记忆遗忘**：5,688 Token 的全篇特征被强行压缩成一个 512 维向量。全篇 16 个章节涉及网络、审计、鉴权、备份等海量主题，仅占 60 Token 的配额参数在全局向量中被稀释了近 100 倍，余弦相似度惨遭淹没。 |
| **Cross-Encoder 交叉重排** | **注意力窗口物理超限**：工业级单塔重排器（如 BGE-Reranker、ms-marco）的注意力窗口通常被严格限制在 $512 \sim 1024$ Token。面对 5,688 Token 的巨型文档，单塔前向计算的 $O((L_q + L_d)^2)$ 显存开销直接爆仓，文本被粗暴截断，后半部分的章节甚至连参与打分的机会都没有！ |
| **LLM 最终生成** | **极端稀释与中间迷失（Lost in the Middle）**：即使检索器幸运命中了这篇文档，把整篇 5,688 Token 灌入 Prompt，**有效信息浓度仅占 $0.46\%$**！大模型面对 $99.5\%$ 的无关噪声，极易触发注意力漂移甚至产生幻觉，单次问答的 Token 成本与延迟更成倍暴涨。 |

### 1.2 本课使命与边界划分

本课的核心使命是**打碎“文档即原子”的教条**：
1. 从第一性原理推导**文档切分粒度（Chunk Size）**与**重叠窗口（Overlap）**的数学博弈；
2. 剖析**朴素定长滑窗**、**结构感知分割**与**连续语义波谷探测**三大切分范式；
3. 从零手写可即插即用的 **Chunking 语料变换层**；
4. 实现工业级 **Small-to-Big（父子块展开）两级架构**，达成“小粒度切片建索引求精度，大窗口父文档进 Prompt 保完整”的完美平衡。

> **边界声明（本课严格不做的事，留给第 9 课）**：
> 本课聚焦于**物理切分边界与粒度**。对于切片自身因脱离上下文而丢失主语（如以“这种情况下……”开头的孤岛切片）的问题，我们将在基准用例 `ck-05` 中作为**已知未解问题（Known Unsolved Problem）**显式记录，并在第 9 课《Contextual Chunk / Metadata 注入与邻接扩展》中彻底攻关。

---

## 2. 核心第一性原理：切分粒度与信息密度的数学与几何博弈

很多初学者容易产生一个直觉倾向：“既然大文档会导致稀释，那切片是不是越小越好？”

答案是否定的。在信息论与自然语言工程中，**切分粒度（Chunk Size）与检索效果呈现出非常显著的 U 形博弈关系**。

### 2.1 信噪比（SNR）与上下文完整性的数学表达

定义某一切片 $C$，其 Token 长度为 $L(C)$。设回答问题所需的黄金关键事实集合为 $\mathcal{F}_{\text{gold}}$，其包含的 Token 长度为 $|\mathcal{F}_{\text{gold}}|$。

1. **切片信噪比（Signal-to-Noise Ratio, SNR）**：
   $$\text{SNR}(C) = \frac{|\mathcal{F}_{\text{gold}} \cap C|}{L(C)}$$

2. **可回答性与完整性概率（Context Integrity Probability）**：
   $$P_{\text{answerable}}(C) = P(\mathcal{F}_{\text{gold}} \subseteq C)$$

我们考察两个极限情形：

$$\text{极端大（整篇文档）：} \lim_{L \to \infty} P_{\text{answerable}} = 1, \quad \lim_{L \to \infty} \text{SNR} = 0 \quad (\text{中间迷失、计算浪费})$$

$$\text{极端小（单个单词/短语）：} \lim_{L \to 0} \text{SNR} = 1, \quad \lim_{L \to 0} P_{\text{answerable}} = 0 \quad (\text{上下文割裂、语义瓦解})$$

```text
  信息指标
    ▲
100%│                  上下文完整性 P(answerable)
    │                  /─────────────────────────── (整篇文档: 100% 完整)
    │                 /
    │                /
    │               /
    │              /
    │  信噪比 SNR /
    │    \       /
    │     \     /
    │      \   /
    │       \ /
    │        X
    │       / \
    │      /   \
    │     /     \
    │    /       \──────────────────────────────── (整篇文档: SNR < 0.5%)
  0%└──────────────────────────────────────────────► 切片粒度 (Token 预算)
      64      256        512         1024     2048+
    (切碎)  (语义失真) (黄金平衡点) (开始稀释) (巨型文档)
```

### 2.2 实测数据给出的 U 形实证

在我们的实测基准库（`docs/ops-handbook.md`，5,688 Token，16 章节，6 条黄金用例平均值）上，切分粒度呈现出惊人的真实表现：

| 切分策略与粒度 | 切片总数 | 平均单次注入 Token | 平均信噪比（SNR） | 注入完整率 | 核心缺陷表征 |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **整篇文档（基线）** | 1 | 7,825 | **$0.46\%$** | $100\%$ | 答案被 99.5% 的无关文本淹没，模型面临注意力迷失 |
| `fixed-2048` | 13 | 5,239 | **$0.73\%$** | $100\%$ | **切大没用**：信噪比几乎没有提升，稀释依然严重 |
| `fixed-512` | 25 | 1,509 | **$2.39\%$** | $66.7\%$ | 信噪比提升 5 倍，但部分跨边界事实开始被切断 |
| `fixed-256` | 40 | **755** | **$4.83\%$** | **$50.0\%$** | **切碎崩塌**：信噪比虽高，但**一半的用例丢失完整上下文**，模型无法作答 |

> **核心结论**：
> “定位精度（Precision）”与“上下文完整性（Integrity）”是同一根滑杆的两端。
> 单纯追求极小的切片，换来的只是把一整件逻辑自洽的事情切成了谁也无法单独理解的语法碎片！

---

## 3. 三大切分范式全景剖析与边界几何学

决定切片质量的不仅是**“切多大（Size）”**，更是**“刀切在哪里（Boundary）”**。
工业界主要存在三大经典切分范式：

```text
文档内容流 ─────────────────────────────────────────────────────────────►
[范式 1: 朴素定长]   |  Window 1  |  Window 2  |  Window 3  | (盲目等长下刀)
[范式 2: 结构感知]   [ # Chapter 1 ][ Paragraph A ][ Paragraph B ][ # Chapter 2 ] (依 AST/Markdown)
[范式 3: 语义波谷]   [ S1 S2 S3 (主题 A) ] ──[相似度骤降]──► [ S4 S5 S6 (主题 B) ] (依向量流变化)
```

### 3.1 范式一：朴素定长滑窗（Fixed-Size Sliding Window）

定长滑窗是最基础的切分方案：设定固定 Token 窗口 $L$ 与步长 $S$（滑动步长 $S = L - O$，其中 $O$ 为重叠 Token 数）。

```text
【定长滑窗断句灾难示意】
原文：任何生产变更必须在变更窗口开启前 24 小时提交 RFC-8842 审批单。
               ▲
               │ 定长窗口恰好在此处用尽 Token 预算（强制下刀！）
               ▼
Chunk 1: "……任何生产变更必须在变更窗口开启前 24"
Chunk 2: "小时提交 RFC-8842 审批单，否则自动驳回……"
```

#### 致命缺陷：断裂的随机性（Stochastic Fracture）

定长滑窗完全无视人类语言的语法边界与排版语义。在 `ops-handbook.md` 上扫描 18 组不同的 `chunkSize`（64 ~ 2048）：
- **fixed 策略**：关键句子被硬性切断的概率高达 **$38.9\%$（7/18 组参数全部切坏）**；
- **核心风险**：它切不切坏**完全取决于前文长度的偶然性**。一旦前文增加了一行注释，原本完整的句子可能立刻被劈成两半！

更为严重的是对复杂 Markdown 语法的破坏：
1. **表格腰斩（Table Decapitation）**：表头在 Chunk A，数据行在 Chunk B。Chunk B 失去了列名定义，大模型读取后完全不知道每个单元格的数值含义；
2. **代码围栏撕裂（Code Block Rupture）**：YAML 或 Python 脚本在中间被截断，反引号未闭合，缩进语义丧失，代码逻辑完全失效。

### 3.2 范式二：结构感知递归切分（Recursive Structure-Aware Splitter）

为了消除定长硬切的随机性，结构感知切分利用文档的自然排版层级，采用**分层递归降级策略（Hierarchical Fallback）**：

```text
                       输入文档待切分文本块
                               │
                [ 尝试 Level 0: Markdown 顶级标题 ] ──(超长?)──►
                               │ (未超长，保留完整结构)
                [ 尝试 Level 1: Markdown 二/三级标题 ] ──(超长?)──►
                               │
                [ 尝试 Level 2: 双换行空行（段落边界）] ──(超长?)──►
                               │
                [ 尝试 Level 3: 中英文句末标点（。！？；）] ──(超长?)──►
                               │
                [ Level 4: 强制定长硬切兜底 (Hard Cut) ]
```

#### 分隔符优先队列与贪心打包算法

在我们的实现中，定义了严格的递归分隔符矩阵：
```typescript
const SEPARATOR_LEVELS = [
  { pattern: /\n(?=#{1,6}\s)/, type: "heading", label: "Markdown 标题边界" },
  { pattern: /\n\s*\n/, type: "paragraph", label: "空行（段落）边界" },
  { pattern: /(?<=[。！？；])/, type: "sentence", label: "句末标点边界" },
];
```

**贪心打包规则（Greedy Packing）**：
1. 将文本递归下钻分解为原子单元（Unit）；
2. 顺序累加单元，只要当前切片累积长度不超过 `chunkSize`，就绝不提前断开；
3. 一旦下一个单元加入会导致预算溢出，则在**前一个单元的合法边界处平滑收刀**。

#### 实测表现与“预算依赖”原则

在同一份 `ops-handbook.md` 上测试递归切分的边界分布：

| 配置 | 切片数 | 标题边界断开 | 段落边界断开 | 句子边界断开 | 硬切兜底 | 几何破坏总数 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `recursive-128` | 58 | 36 | 18 | 0 | **4** | **4** |
| `recursive-256` | 28 | 23 | 5 | 0 | 0 | **1** |
| `recursive-512` | 13 | **12** | **1** | 0 | 0 | **0** |
| `recursive-1024` | 6 | 5 | 1 | 0 | 0 | **0** |

> **重要原则：结构边界不是免费的，它必须依赖足够的 Token 预算！**
> 观察 `recursive-128`：当设定预算仅有 128 Token 时，文档中一段完整的表格或长段落本身就超过了 128 Token，算法无奈触发了 4 处硬切兜底。
> **而在 512 Token 预算下，所有切点 100% 精准落在大标题或自然段落边缘，几何破坏降为绝对零！**

### 3.3 范式三：语义流突变与波谷探测（Semantic Valley Chunking）

如果面对的不是格式严谨的 Markdown，而是缺乏排版格式的纯文本、法律判决书、会议录音转写，该怎么切？

**核心思想**：语言的内在逻辑转移伴随着语义特征的突变。我们不必依赖任何排版标记，直接计算**相邻句子之间的向量空间余弦相似度**。

```text
余弦相似度
  1.0┌──────────────────────────────────────────────────────────────┐
     │  S1~S2 (讨论集群故障)      S5~S7 (讨论告警指标)               │
  0.8│     /\                      /\                               │
     │    /  \                    /  \                              │
  0.6│───/────\──────────────────/────\────────────────── 阈值线 0.62 │
     │         \                /      \                            │
  0.4│          \              /        \                           │
     │           \            /          \                          │
  0.2│            ▼          /            ▼                         │
     │      【波谷 1: 0.1374】      【波谷 2: 0.1182】              │
  0.0└───────(此处切开！)─────────────(此处切开！)──────────────────┘
       Sentence 1 ────► Sentence 4 ────► Sentence 8 ────► Sentence 12
```

#### 相似度突变公式与算法流转

对于连续句子序列 $S_1, S_2, \dots, S_n$，利用第 4 课的稠密向量编码器生成表征向量 $\mathbf{v}_i = \text{Embed}(S_i)$。
计算连续句对的余弦转移度：
$$\text{sim}(S_i, S_{i+1}) = \cos(\mathbf{v}_i, \mathbf{v}_{i+1}) = \frac{\mathbf{v}_i \cdot \mathbf{v}_{i+1}}{\|\mathbf{v}_i\| \|\mathbf{v}_{i+1}\|}$$

当 $\text{sim}(S_i, S_{i+1}) < \theta_{\text{semantic}}$（阈值通常设定在 $0.55 \sim 0.65$ 之间），且当前切片已积累了充足的最小填充量（$\ge 50\% \text{Budget}$），算法判定发生**主题断裂（Topic Shift）**，在此处平滑断刀。

#### 实测惊艳证据：无监督语义自对齐

在完全不给算法提供任何 Markdown 语法解析器的情况下，纯依靠句向量余弦扫描 `ops-handbook.md`，算法自动捕捉到的相似度最低点（Top 5 波谷）：

| 句对偏移 | 余弦相似度 | 算法断开决策 | 文本原文片段与真实语义属性 |
| :---: | :---: | :---: | :--- |
| **Offset 1** | **$0.1182$** |  断开 | `## 15. 演练与复盘` —— **章节大标题突变** |
| **Offset 2** | **$0.1374$** |  断开 | ` ``` ` —— **代码围栏起止边界** |
| **Offset 3** | **$0.1544$** |  断开 | `备份不等于容灾。` —— **正文核心论述转折** |
| **Offset 4** | **$0.2052$** |  断开 | `## 12. 网络安全基线` —— **章节大标题突变** |
| **Offset 5** | **$0.2222$** |  断开 | `\| :--- \| :--- \|` —— **Markdown 表格分隔行** |

**算法在对语法结构一无所知的前提下，仅凭几何空间向量余弦，将章节标题、代码块、论述转折和表格精准定位为断点！** 这是第 4 课语义向量机制在文本切分上的一次优美正向回收。

---

## 4. Overlap 重叠窗口的工程账本：用空间换边界鲁棒性

既然切分容易斩断边界，工业界最广泛采用的补救手段就是引入 **Overlap（滑动重叠窗口）**。

### 4.1 重叠窗口的运作机制

让切片 $N+1$ 的起始位置向前回退 $O$ 个 Token，使得相邻切片共享一段公共文本：

```text
Chunk 1: [ ────── 文本前部 ────── ][ 共享重叠区 Overlap ]
Chunk 2:                         [ 共享重叠区 Overlap ][ ────── 文本后部 ────── ]
```

这一机制使得原本落在 Chunk 1 边缘被腰斩的短语，能够在 Chunk 2 的起始部分得到完整保留。

### 4.2 Overlap 的双刃剑：制造破坏与补救破坏

在评测统计中，我们必须建立一个严密的工程口径：
- **原始几何破坏数（Boundary Damage Raw）**：切点落在句子中间、代码块内或表格内的绝对次数；
- **被重叠补救数（Overlap Repaired）**：虽然本切片起点落在了半句中，但前一个切片已经完整覆盖了整句；
- **净破坏数（Structural Violations）**：$\text{净破坏} = \text{原始几何破坏} - \text{被重叠补救}$。

实测 `ops-handbook.md` 在定长 512 窗口下的重叠表现：

| 配置参数 | 原始破坏数 | 被重叠补救数 | **净破坏数** | 索引冗余率（Redundancy） |
| :--- | :---: | :---: | :---: | :---: |
| `fixed-512`（无重叠 ov=0） | 12 | 0 | **12** | $0.1\%$ |
| `fixed-512` + ov=32 | 12 | 12 | **0** | $6.0\%$ |
| `fixed-512` + ov=64 | 13 | 13 | **0** | $13.5\%$ |
| `fixed-512` + ov=128 | 15 | 15 | **0** | $30.9\%$ |
| `fixed-512` + ov=256 | 22 | 22 | **0** | **$94.4\%$** |

两个极为深刻的工程事实：
1. **重叠本身会“制造”更多表面的几何切口**（破坏数从 12 上升到 22）：因为切片起点强制回退，必然更容易落入上一句的字里行间；但由于相邻切片已完整覆盖，这种破坏被 $100\%$ 补全，净破坏清零；
2. **重叠的本质是用索引体积换边界可答性**：
   $$\text{Redundancy} \approx \frac{O}{L - O}$$
   当 $L=512, O=256$ 时，索引冗余率飙升至 **$94.4\%$** —— 整个知识库的切片数和向量存储开销翻了一倍！

### 4.3 Overlap 无法解决的三大死结

很多工程师迷信“只要重叠开得大，边界问题全不怕”。实测揭示出 Overlap 的三大物理极限：

1. **表格结构彻底解体**：
   重叠只能带入几行纯文本。若表头不在切片内，带入几行数据行根本无法复原表格的二维列定义；
2. **长语法块跨度超限**：
   一段 300 Token 的复杂 SQL 或 Python 函数，128 Token 的重叠窗口根本无法完整包裹，截断不可避免；
3. **孤岛代词与主语丢失（The Orphan Trap）**：
   重叠能够补全句子，但补不全逻辑因果。如果切片以“*此项操作必须在 15 分钟内完成*”开头，即使往前重叠 64 Token，上一段如果还在罗列日志参数，“*此项操作*”具体指代什么依然扑朔迷离。

---

## 5. 切片工程五大高危陷阱与实测反例

基于我们搭建的 6 大黄金评测基准，以下五类高危陷阱是生产环境切片中最致命的“翻车点”：

### 陷阱 1：边界肢解与决定性事实断裂（Boundary Fracture Trap）
- **基准案例（`ck-02`）**：*“生产变更需要提前多久提交审批单？审批单的单号规则是什么？”*
- **黄金事实**：*“必须在变更窗口开启前 **24 小时**提交 **RFC-8842** 审批单，否则自动驳回。”*
- **踩坑现象**：在定长切分下，`24 小时` 落在 Chunk 1 尾部，而 `RFC-8842` 落在 Chunk 2 首部。任何一个切片都只包含半句，导致无一单元能够自足回答问题。

### 陷阱 2：语法围栏与表格剥离（Structure Mutilation Trap）
- **基准案例（`ck-03`）**：*“按故障分级标准，P2 级故障的响应时限是多少？”*
- **踩坑现象**：故障分级标准以 Markdown 表格排版。定长下刀将表头列名留在上一片，切片内仅有 `| P2 | 15分钟 | 3工作日 |`。模型因为缺失表头中的“响应时限”与“复盘报告时限”列定义，把“15分钟”与“3工作日”彻底混淆。

### 陷阱 3：孤岛代词与主语失窃（Orphan Anaphora Trap）
- **基准案例（`ck-05`，已知未解挂账点）**：
  ```text
  原文：……当主备切换在 90 秒内未能完成时，视为跨可用区切换失败。
       [切片边界下刀处]
       这种情况下，须在 15 分钟内触发全局熔断并进入只读模式。
  ```
- **踩坑现象**：切片开头赫然写着“*这种情况下*”。检索器检索“*熔断条件*”时命中了后一片，但后一片里压根没有“*跨可用区切换失败*”这八个字！切片成为语义孤岛。

### 陷阱 4：等权融合稀释陷阱（Equally Weighted Fusion Dilution）
- **基准案例（`ck-04`，主题漂移）**：*“演练复盘要求多久组织一次？由谁主持？”*
- **踩坑实测**：
  - **词法通道（Lexical）**：精准匹配“演练复盘”、“主持”，目标切片以 **Score = 33 分**压倒性拿下第一（第二名仅 12 分）；
  - **融合阶段（RRF）**：由于采用等权倒数排名融合，语义弱向量给出了低名次（Rank 15），RRF 等权折算后，目标切片直接被**挤出候选池 Top 12**！
  - **教训**：切片粒度变小后，词法信号的极端尖峰极易被等权 RRF 平滑稀释。

### 陷阱 5：脆弱性反噬与张冠李戴幻觉（Fragility Escalation Trap）
这是切片工程中最隐蔽、后果最严重的恶性缺陷。对比端到端三种注入方式：

```text
用户提问：“演练复盘要求多久组织一次？由谁主持？” (ck-04)

【路径 A: 文档级注入（5,688 Token）】
  模型回复：“演练复盘要求每两周组织一次，由平台工程部主持。”  ──► 正确！
  机理：虽然信噪比只有 0.46%，文档很长，但证据 100% 在里面，模型硬找找到了。

【路径 B: 切片精排注入（748 Token，检索脱靶）】
  模型回复：“资料中并未明确指出复盘的具体频率和由谁主持……”    ──► 答不出！

【路径 C: Small-to-Big 展开注入（748 Token，展开了错误邻域）】
  模型回复：“容灾切换演练每半年至少一次……演练复盘要求每半年组织一次。” ──► 严重幻觉！
  机理：切片检索把第 9 章的“容灾切换演练”当成了目标，模型为了强行答题，
       把“半年”张冠李戴嫁接到了“演练复盘”上！
```

> **高危警示：切片工程的终极法则**
> 切片化把检索质量从**“影响答案好坏”**升级成了**“影响答案有无与真伪”**。
> 整篇文档注入的最坏情况是“模型答得啰嗦”，而切片脱靶的最坏情况是“模型言之凿凿地编造伪证”。

---

## 6. 从零手写工业级 Chunking 语料变换层与 Small-to-Big 架构

在架构设计上，必须厘清一个根本原则：
**Chunking 是位于检索栈之下的“语料变换层（Corpus Transformation Layer）”，而不是一套新的检索算法。**

```text
CorpusDocument[] (原始大文档)
       │
       ▼  chunkDocument()                   ← 本课唯一新增的底层能力
Chunk[] (切片数据结构)
       │
       ▼  toChunkDocument()                 ← 零改动投影层：title = "文档名 > 章节路径"
CorpusDocument[] (投影切片文档)
       │
       ├──► searchInDocs()                  ← C3 词法检索（零改动复用）
       ├──► searchSemanticInDocs()          ← C4 向量检索（零改动复用）
       ├──► reciprocalRankFusion()          ← C6 混合融合（零改动复用）
       └──► rerankDocuments()               ← C7 Cross-Encoder 精排（零改动复用）
       │
       ▼  Top-K 命中切片
expandToParent()                            ← Small-to-Big 向上展开父窗口
       │
       ▼
Golden Context 注入 Prompt
```

### 6.1 核心数据接口契约

在 `app/core/context-bench/chunker.ts` 中，我们定义了严密的强类型契约：

```typescript
export type ChunkStrategy = "document" | "fixed" | "recursive" | "semantic";
export type BoundaryType = "heading" | "paragraph" | "sentence" | "hard_cut";

export interface StructuralIntegrity {
  breaksCodeBlock: boolean; // 切点是否破坏了代码围栏
  breaksTable: boolean;     // 切点是否斩断了 Markdown 表格且丢失表头
  breaksSentence: boolean;  // 切点是否切断了自然语言句子
}

export interface OrphanRisk {
  isOrphanHead: boolean;    // 是否以代词或逻辑连词开头（如“这种情况下”）
  anaphoraTerm?: string;    // 触发风险的代词词项
  explanation: string;
}

export interface Chunk {
  id: string;               // 格式：`${docId}#c${index}`
  docId: string;            // 所属源文档 ID
  docTitle: string;         // 源文档标题
  index: number;            // 在文档内的顺序编号
  content: string;          // 切片纯文本内容
  tokenCount: number;       // Token 预估计数
  charStart: number;        // 原文起始字符偏移
  charEnd: number;          // 原文结束字符偏移
  sectionPath: string[];    // Markdown 面包屑路径，如 ["运维总则", "变更审批"]
  headingLevel: number;     // 所在最低层级标题级别
  boundaryType: BoundaryType;
  overlapPrevChars: number; // 向前重叠字符量
  overlapNextChars: number; // 向后重叠字符量
  structuralIntegrity: StructuralIntegrity;
  orphanRisk: OrphanRisk;
  strategy: ChunkStrategy;
}
```

### 6.2 零侵入投影层实现

通过 `toChunkDocument`，我们将切片无缝伪装成 `CorpusDocument`，使其天然兼容上层全部检索管线：

```typescript
export function toChunkDocument(chunk: Chunk): CorpusDocument {
  // 将章节面包屑拼接入标题，使得 BM25 与向量检索能天然获得祖先上下文表征！
  const sectionTitle = chunk.sectionPath.join(" > ");
  return {
    id: chunk.id,
    path: `${chunk.docId}#${chunk.index}`,
    category: "docs",
    title: sectionTitle ? `${chunk.docTitle} > ${sectionTitle}` : chunk.docTitle,
    content: chunk.content,
    tokenCount: chunk.tokenCount,
    authority: "active",
  };
}
```

### 6.3 递归结构感知切分算法实现

递归切分的核心在于：**分层下钻 + 边界回退贪心打包**。

```typescript
export function chunkRecursive(
  doc: CorpusDocument,
  options?: { chunkSize?: number; overlap?: number }
): ChunkingResult {
  const text = doc.content;
  const chunkSize = Math.max(16, options?.chunkSize ?? 512);
  const overlap = Math.max(0, options?.overlap ?? 0);
  const ctx = makeContext(text);
  const maxChars = tokensToChars(text, chunkSize);

  const units: Unit[] = [];
  // 按照 heading -> paragraph -> sentence 分层递归分解
  splitRecursive(text, 0, 0, maxChars, units);

  const spans: RawSpan[] = [];
  let currentStart = units.length > 0 ? units[0].start : 0;
  let currentEnd = currentStart;
  let cursor = 0;

  for (const unit of units) {
    const unitEnd = unit.start + unit.text.length;
    // 预算溢出检查：贪心打包至最大限度，但绝不切断 unit 自身
    if (cursor > 0 && unitEnd - currentStart > maxChars) {
      spans.push({
        charStart: overlappingStart(ctx.text, currentStart, overlap),
        charEnd: currentEnd,
        boundaryType: spans.length === 0 ? "heading" : unit.boundaryType,
        overlapPrevChars: spans.length === 0 ? 0 : overlapChars(currentStart, overlap),
      });
      currentStart = unit.start;
      cursor = 0;
    }
    currentEnd = unitEnd;
    cursor += unit.text.length;
  }
  // 尾部剩余闭合收尾...
  return finalizeResult(doc, "recursive", chunkSize, overlap, spans.map((s, i) => buildChunk(doc, ctx, s, i, "recursive")));
}
```

### 6.4 Small-to-Big（父子块展开）两级架构

本课最重要的架构创新就在这里：**解耦检索与注入的原子单位**。

```text
               建索引 / 向量搜索阶段                       命中后 Prompt 组装阶段
         ─────────────────────────────────           ─────────────────────────────────
         [ 小切片 Child Chunk (256 Token) ]  ──────► [ 展开父窗口 Parent Window (1400 Token) ]
               - 信号高度集中                              - 包含完整前因后果与主语
               - 向量表征清晰，零均值稀释                   - 代码块、表格完整闭合
               - Cross-Encoder 精排算力极小                - 彻底解决“断章取义”与指代丢失
```

在 `expandToParent` 中，我们以命中切片为锚点，在**严格尊重章节边界（不跨越 Section）**的前提下，双向贪心吞吐相邻切片：

```typescript
export function expandToParent(
  allChunks: Chunk[],
  hit: Chunk,
  options: { parentSize: number }
): Chunk[] {
  const budget = Math.max(hit.tokenCount, options.parentSize);
  const sameDoc = allChunks
    .filter((c) => c.docId === hit.docId)
    .sort((a, b) => a.index - b.index);
  const pos = sameDoc.findIndex((c) => c.id === hit.id);
  if (pos === -1) return [hit];

  const hitSection = hit.sectionPath.join(" > ");
  let left = pos;
  let right = pos;
  let usedTokens = hit.tokenCount;

  // 交替向两侧吞吐扩展，保持命中的 Child Chunk 始终居于中心
  while (true) {
    const prevOk = left - 1 >= 0 &&
      sameDoc[left - 1].sectionPath.join(" > ") === hitSection &&
      usedTokens + sameDoc[left - 1].tokenCount <= budget;

    const nextOk = right + 1 < sameDoc.length &&
      sameDoc[right + 1].sectionPath.join(" > ") === hitSection &&
      usedTokens + sameDoc[right + 1].tokenCount <= budget;

    if (!prevOk && !nextOk) break;

    if (prevOk) {
      left--;
      usedTokens += sameDoc[left].tokenCount;
    }
    if (nextOk) {
      right++;
      usedTokens += sameDoc[right].tokenCount;
    }
  }

  return sameDoc.slice(left, right + 1);
}
```

---

## 7. 实测全景对决：9 种配置与 6 大基准场景大比武

在包含两篇超长文档（`ops-handbook.md`、`compliance-manual.md`）的 11 篇基准语料库（9,014 Token）及 6 条黄金陷阱测试用例上，我们对 9 种切分与检索配置展开了严密的控制变量评测：

### 7.1 全景评测数据总表

| 策略与配置编号 | 策略名称 | 切片数 | 索引冗余% | 净破坏数 | 定位率% | 单元自足% | 注入完整% | 高信噪比完整% | 平均注入 Token | 平均信噪比% |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Conf 01** | **整篇文档（退化基线）** | 11 | $0.0\%$ | 0 | $100\%$ | $100\%$ | $100\%$ | **$0.0\%$** | 7,825 | $0.46\%$ |
| **Conf 02** | `fixed-256`（过碎） | 40 | $0.1\%$ | 31 | $50.0\%$ | $16.7\%$ | $50.0\%$ | $50.0\%$ | 755 | $4.83\%$ |
| **Conf 03** | `fixed-512`（无重叠） | 25 | $0.1\%$ | 16 | $66.7\%$ | $50.0\%$ | $66.7\%$ | $66.7\%$ | 1,509 | $2.39\%$ |
| **Conf 04** | `fixed-512 + ov128` | 29 | $25.3\%$ | **0** | $83.3\%$ | $66.7\%$ | $100\%$ | $66.7\%$ | 1,321 | $2.75\%$ |
| **Conf 05** | `fixed-2048`（过大） | 13 | $0.0\%$ | 3 | $100\%$ | $50.0\%$ | $100\%$ | **$0.0\%$** | 5,239 | $0.73\%$ |
| **Conf 06** | `recursive-512`（无重叠） | 26 | $0.1\%$ | **0** | $50.0\%$ | $50.0\%$ | $50.0\%$ | $50.0\%$ | 1,368 | $2.73\%$ |
| **Conf 07** | `recursive-512 + ov64` | 26 | $11.3\%$ | **0** | $100\%$ | $100\%$ | $100\%$ | $66.7\%$ | 1,492 | $2.55\%$ |
| **Conf 08** | `semantic-512 + ov64` | 34 | $16.6\%$ | **0** | $100\%$ | $66.7\%$ | $100\%$ | **$100\%$** | 1,095 | $3.40\%$ |
| **Conf 09** | **`small-to-big (256➔1400)`** | 47 | $13.4\%$ | **0** | **$100\%$** | $83.3\%$ | **$100\%$** | **$100\%$** | **751** | **$5.03\%$** |

> **工程定义（高信噪比完整率）**：
> 满足两个硬性条件判定为有效：① 注入内容 $100\%$ 覆盖黄金事实关键词（不发生断章取义）；② 信噪比 $\ge 2.0\%$。
> 换言之，它要求系统**既不能答错，也不能靠注水 8000 Token 蒙混过关**。

### 7.2 关键对比结论与现象溯源

1. **`fixed-2048` 宣判了“切大没用”**：
   注入量仅从 7,825 降到了 5,239，信噪比依然只有 $0.73\%$，高信噪比完整率为 **0%**。单纯把文档切成 2000 字的大坨，依然逃不脱注意力被稀释的宿命。
2. **净破坏一列展现了边界工程的绝对价值**：
   `fixed-512` 留下了 16 处致命的句子与结构腰斩；加上 `ov128` 重叠后，净破坏被彻底平抑为 **0**，代价是 $25.3\%$ 的索引冗余；而 `recursive` 递归切分则依靠语言结构的天然边界，在仅付出 $11.3\%$ 冗余的情况下达成了零破坏。
3. **Small-to-Big 实现了不可思议的双赢突破**：
   观察 Conf 09：它以 256 Token 的微粒度建索引，单次最终注入仅消耗 **751 Tokens**（相比文档级暴省 **$90.4\%$** 的上下文空间！），信噪比直接冲到 **$5.03\%$**（文档级的 **10.9 倍**），同时注入完整率保持 **$100\%$**！
   它在工程上完美跨越了“小切片精度高但断章取义，大切片语境全但注意力稀释”的百年鸿沟。

---

## 8. 工业界生产落地与架构选型全景指南

在真实的大模型 Agent 基础设施与知识库搭建中，如何制定落地架构与工程防线？

### 8.1 切分算法选型决策树

```text
文档输入
  │
  ├── 是否包含源代码（Python, TS, Go, Rust）？
  │     └── 是 ──► 使用 Tree-sitter AST 解析器（按 Class / Function AST 节点切分）
  │
  ├── 是否具备强 Markdown / HTML / Docx 排版结构？
  │     └── 是 ──► 递归结构感知切分（Recursive Splitter, 512 Token, Overlap 10%~15%）
  │
  ├── 是否为纯文本、客服工单、法务合同无格式流水？
  │     └── 是 ──► 语义波谷切分（Semantic Valley Splitter, 动态余弦阈值 0.62）
  │
  └── 是否为密集二维表格（财务报表、产品矩阵）？
        └── 是 ──► 表格独立封箱提取（Markdown Table 整体作为独立 Chunk，禁止横向切分）
```

### 8.2 存储拓扑解耦：Vector Store 与 Document Store

在工业级生产架构中，绝不能将切片的全文直接堆在向量数据库里。标准实践是**存储解耦**：

```text
                       [ 用户查询 Query ]
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
       [ 向量数据库 VectorStore ]       [ 倒排索引 Lexical Index ]
       - 存储 Child Chunks 向量       - 存储 Child Chunks 文本词频
       - 极高维度，小 Payload         - 快速符号倒排
                │                             │
                └──────────────┬──────────────┘
                               ▼
                       Top-K 命中 Child ID
                               │
                               ▼
                  [ 文档数据库 DocStore / KV ]
                  - Key: Child ID
                  - Value: 向上展开的 Parent Chunk (1400 Token)
                  - 存储成本极低，极速读取大段文本
                               │
                               ▼
                       注入 LLM 上下文
```

### 8.3 向量集生命周期与维度安全防护

在切分系统迭代过程中，必须严格执行三项工程防御铁律（这也是本项目工作台的工程实践）：

1. **切分配置与向量集强哈希绑定**：
   切分配置一旦改变（如从 512 变 256），`doc#c1` 指向的文本将发生彻底位移。向量集文件名必须编码切分参数：
   ```text
   data/context-benchmark/c8/
   ├── chunk-recursive-512-ov64.json
   ├── chunk-fixed-512-ov128.json
   └── chunk-semantic-512-ov64.json
   ```
2. **异维余弦静默降级熔断**：
   当查询向量（如远端 API 返回 1536 维）与切片向量（本地确定性 512 维）发生维度错配时，**坚决不能强行计算截断点积**（这会导致所有切片得分被系统性压低引发静默失效），必须直接触发熔断并干净回退至纯本地向量通道。
3. **整篇兜底与强否定约束**：
   当切片检索的最高分低于动态置信度阈值，或词法通道与语义通道分歧过大时，系统应触发回退机制，直接调取源文档整篇注入；同时在 System Prompt 中加入强硬约束：*“当提供的内容不足以推导出答案时，必须明确回答未知，严禁根据部分词汇臆造答案。”*

---

## 9. 思考题与第 9 课预告

### 9.1 第一性原理思考题

1. **粒度膨胀的极限**：为什么 `fixed-2048` 的 Token 注入量（5,239）仅比整篇文档（7,825）减少了三分之一？如果继续放大到 4,096，注入量会趋近什么值？这在数学上说明了什么？
2. **召回与切片的辩证关系**：实测中 `recursive-512` 的定位率仅为 $50\%$，低于整篇文档的 $100\%$。这是否说明“切片必然损害召回”？请结合“注入完整率与信噪比的综合权衡”给出你的架构评判。
3. **重叠的几何诡论**：重叠窗口明明使原始几何切口数量增加了（从 12 次增加到 22 次），为什么净破坏数反而变成了 0？请解释为什么这两个数字可以并存。
4. **无监督语义识别的边界**：语义波谷算法在零语法知识下成功找到了标题与表格。它是凭借什么几何特征做到的？在什么特定语料下，这种算法会发生严重过切（Over-chunking）？
5. **两级维度的物理本质**：Small-to-Big 的“切片单元自足率”只有 $83.3\%$，但“最终注入完整率”却达到了 $100\%$。请用一句话解释这两个指标分别在衡量系统哪个阶段的能力。

---

### 9.2 已知未解与第 9 课预告：Chunk 自己没有意义怎么办？

通过本课，我们把检索原子从文档下沉到了切片，并用 Small-to-Big 解耦了精度与完整性。
但是，基准用例 `ck-05` 像一根刺一样留在了评测报表里：

```text
某切片开头写着：“这种情况下，须在 15 分钟内触发全局熔断并进入只读模式。”
用户提问：“什么情况下需要触发全局熔断？”
```

面对这个切片，即使将其父窗口扩大一倍，由于主语“跨可用区切换失败”远在上一节的综述里，切片本身依然是一个**主语失窃的孤岛**！

> **切片在解决了信息过载的同时，不可避免地剥离了全局语境。**
> **如果一个 Chunk 脱离了文档就失去了语义，检索器该怎么搜到它？**

这正是下一课要彻底破局的终极 Context 增强工程：
👉 **第 09 课：Chunk 自己可能没有意义怎么办？—— Contextual Retrieval / Metadata 注入与跨切片邻接扩展**
