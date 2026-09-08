# PRD：dsh-plugin-academic-paper 学术文献插件

> 在 DeepSeek-Harness 会话中提供学术文献检索、摘要解析、引用格式生成能力，插件封装学术数据源接口，大模型仅负责整理与解读，避免模型编造文献信息。

元信息
- 作者：自定义
- 版本：V1.0
- 状态：开发中
- 更新日期：2026-09-06

---

## 1. 背景与痛点

### 1.1 用户痛点
- 直接让大模型检索学术文献，模型经常**幻觉编造不存在的论文、作者、DOI**，引用不可靠。
- 手动去 Google Scholar / arXiv / 知网 检索，再复制粘贴摘要到 Harness，流程割裂，效率低。
- 引用格式不统一：GB/T 7714、APA、MLA、BibTeX 多种格式手动转换容易出错。
- 大量文献需要批量管理，缺少统一的文献库与去重机制。
- 论文 PDF 解析困难，表格、公式经常乱码，无法直接喂给 Agent 做深度解读。

### 1.2 目标用户
科研工作者、研究生、学术写作者、需要做文献综述的技术博主。

### 1.3 插件定位
一句话定位：Harness 学术文献助手插件，**插件负责真实数据源检索与引用格式生成**；大模型负责文献解读、综述整理、对比分析；所有文献数据可追溯来源，杜绝幻觉。

---

## 2. 范围界定

### 2.1 ✅ V1.0 必须实现（P0）
- [ ] 支持 arXiv 公开 API 论文检索（标题、作者、摘要、发布日期、PDF链接）
- [ ] 支持 Semantic Scholar 公开 API 论文检索（含引用数、DOI、期刊信息）
- [ ] 文献检索工具：按关键词、作者、年份范围检索
- [ ] 单篇文献详情获取工具：获取完整摘要、元数据
- [ ] 引用格式生成工具：支持 GB/T 7714、APA、BibTeX 三种格式
- [ ] 本地文献库管理：保存已检索文献，支持去重、查看、删除
- [ ] 侧边 UI 面板：展示当前文献库列表、检索历史
- [ ] 批量导出文献库为 BibTeX / Markdown 参考文献列表
- [ ] 插件卸载时清空本地文献库缓存，无残留

### 2.2 ⭕ V1.1 后续迭代（P1，本期不做）
- [ ] 知网 / 万方 中文文献检索（需要账号鉴权，复杂度高）
- [ ] 论文 PDF 上传解析与全文摘要
- [ ] 文献综述自动生成（基于文献库批量整理）
- [ ] 引用网络可视化（某篇论文的引用/被引用关系图）
- [ ] 文献影响因子、JCR 分区查询

### 2.3 ❌ 不在本版本做（明确边界）
- ❌ 不提供付费文献的全文下载（版权问题），仅提供元数据与公开摘要
- ❌ 不做论文查重、降重功能
- ❌ 不内置大型文献本地数据库，所有检索实时调用公开 API

---

## 3. 功能详细需求

### 3.1 用户触发方式
- 自然语言触发：`帮我检索关于 XXX 的论文`、`查找 XXX 作者的文献`、`生成引用格式`
- 工具调用触发：`academic_search()`、`academic_paper_detail()`、`academic_cite()`、`academic_library_list()`
- 事件自动触发：无（纯工具型插件，不监听会话事件自动执行）

### 3.2 全部功能列表

#### 功能1：文献检索
- 调用 arXiv API / Semantic Scholar API，按关键词检索
- 支持过滤条件：年份范围、作者、排序方式（相关性/日期/引用数）
- 返回结果列表：标题、作者、摘要预览、发布日期、来源、DOI、PDF链接
- 默认返回 top 10，可配置最大返回数量

#### 功能2：单篇文献详情
- 根据论文 ID / DOI / arXiv ID 获取完整元数据
- 包含：完整摘要、作者列表、期刊/会议、发布日期、引用数、PDF链接、官方链接

#### 功能3：引用格式生成
- 输入论文标识（DOI / arXiv ID / 文献库索引），输出指定格式引用
- 支持格式：
  - **GB/T 7714**（国家标准，中文论文常用）
  - **APA**（美国心理学会格式，社科常用）
  - **BibTeX**（LaTeX 用户常用）
- 格式生成由插件本地完成，不依赖大模型，确保格式准确

#### 功能4：本地文献库
- 检索到的文献可一键加入本地文献库
- 文献库按会话隔离，每个会话独立维护
- 支持去重：同一 DOI / arXiv ID 不重复加入
- 支持查看全部文献、删除单篇、清空文献库
- 文献库数据保存在内存，插件卸载 / Harness 重启后清空

#### 功能5：批量导出
- 将当前文献库全部文献导出为：
  - BibTeX 文件内容（可直接复制到 .bib 文件）
  - Markdown 参考文献列表（带编号、可直接粘贴到论文）
- 导出结果输出到聊天流，同时提供复制按钮

#### 功能6：侧边 UI 面板
- 展示当前会话文献库：论文标题、作者、年份、来源
- 点击可查看详情
- 按钮：【清空文献库】【导出 BibTeX】【导出 Markdown】
- 不污染主聊天流

### 3.3 配置项（对应 cordis.yml schema）

| 配置key | 类型 | 默认值 | 说明 |
|---|---|---|---|
| enable | boolean | true | 插件总开关 |
| default_source | string | "semantic_scholar" | 默认检索数据源：arXiv / semantic_scholar / both |
| max_results | number | 10 | 单次检索最大返回结果数 |
| default_cite_format | string | "gb_t_7714" | 默认引用格式：gb_t_7714 / apa / bibtex |
| request_timeout | number | 15 | API 请求超时秒数 |
| enable_cache | boolean | true | 是否启用检索结果缓存（同关键词短时间内不重复请求） |

### 3.4 UI 表现
- 侧边面板：文献库列表 + 操作按钮
- 检索结果以结构化卡片形式输出到聊天流（标题、作者、摘要、链接）
- 引用格式输出为代码块，方便复制
- 不修改主聊天流的模型回答内容

---

## 4. 状态与数据设计

### 4.1 内存状态结构

```typescript
interface Paper {
  id: string;              // 内部唯一ID
  source: "arxiv" | "semantic_scholar";
  title: string;
  authors: string[];
  abstract: string;
  year: number;
  doi?: string;
  arxivId?: string;
  journal?: string;
  citationCount?: number;
  pdfUrl?: string;
  officialUrl?: string;
  addedAt: number;         // 加入文献库时间戳
}

interface SessionState {
  library: Paper[];        // 本地文献库
  searchHistory: Array<{  // 检索历史
    keyword: string;
    timestamp: number;
    resultCount: number;
  }>;
  cache: Map<string, Paper[]>;  // 检索结果缓存，key=关键词+数据源
}
```

- 会话隔离：✅ 每个 session 独立文献库与缓存
- 持久化：仅内存保存，不落地磁盘

### 4.2 生命周期行为

1. **插件加载 apply(ctx)**
   - 注册学术检索相关工具
   - 注册侧边 UI 面板
   - 初始化配置

2. **插件卸载 plugin:unload**
   - 清空所有会话的文献库与缓存
   - 取消所有未完成的 API 请求（AbortController）
   - 移除事件监听与 UI 面板
   - 卸载后无任何残留状态

### 4.3 自动休眠逻辑
- 本插件为纯工具型，不监听会话事件，无需自动休眠
- 当用户不调用学术工具时，插件完全不介入会话流程

---

## 5. 工具与事件清单

### 5.1 注册给大模型调用的 Tool 列表

| tool名称 | 入参 | 返回 | 用途 |
|---|---|---|---|
| academic_search | keyword:string, source?:"arxiv"\|"semantic_scholar"\|"both", yearFrom?:number, yearTo?:number, author?:string, maxResults?:number | {papers: Paper[]} | 按关键词检索学术文献 |
| academic_paper_detail | paperId:string 或 doi:string 或 arxivId:string | Paper | 获取单篇文献完整详情 |
| academic_cite | paperId:string, format?:"gb_t_7714"\|"apa"\|"bibtex" | {citation:string} | 生成指定格式的引用文本 |
| academic_library_add | paperId:string | {success:boolean, msg:string} | 将文献加入本地文献库 |
| academic_library_list | 无入参 | {papers: Paper[]} | 查看当前文献库全部文献 |
| academic_library_remove | paperId:string | {success:boolean} | 从文献库删除单篇文献 |
| academic_library_export | format?:"bibtex"\|"markdown" | {content:string} | 批量导出文献库 |

### 5.2 监听 Harness 事件列表

| 事件名 | 用途 |
|---|---|
| `plugin:unload` | 资源清理，清空文献库缓存、取消未完成请求 |

> 本插件不监听 `user:message`、`turn:before/after`、`tool:before` 等会话事件，为纯工具型插件。

---

## 6. 安全约束 & 异常处理

### 6.1 安全规则
- 本插件不访问本地文件、不调用 shell，无高危操作
- 所有网络请求仅访问公开学术 API（arxiv.org、api.semanticscholar.org），不访问任意用户输入 URL
- API 请求设置超时，避免长时间阻塞
- 检索结果缓存有大小上限，防止内存膨胀

### 6.2 异常场景处理

1. **API 请求失败 / 超时**：返回友好错误提示，告知用户数据源暂时不可用，建议换数据源或稍后重试；不抛出致命异常导致 Harness 崩溃
2. **API 限流（429）**：自动退避重试一次，仍失败则提示用户稍后再试
3. **检索无结果**：返回空列表 + 提示，建议更换关键词
4. **论文详情获取失败**：提示该论文标识无效或数据源不支持
5. **引用格式生成失败**：回退到基础格式，确保至少输出标题+作者+年份
6. **文献库加入重复文献**：提示已存在，不重复加入

---

## 7. 手工测试用例

- [ ] 用例1：关键词检索 arXiv，验证返回结果包含标题、作者、摘要、PDF链接
- [ ] 用例2：关键词检索 Semantic Scholar，验证返回引用数、DOI、期刊信息
- [ ] 用例3：获取单篇文献详情，验证字段完整
- [ ] 用例4：生成 GB/T 7714 / APA / BibTeX 三种格式引用，验证格式准确
- [ ] 用例5：将文献加入文献库，验证去重逻辑（同一 DOI 不重复加入）
- [ ] 用例6：查看文献库列表，验证侧边面板同步展示
- [ ] 用例7：导出文献库为 BibTeX 和 Markdown，验证内容正确
- [ ] 用例8：模拟 API 超时，验证插件不崩溃，返回友好提示
- [ ] 用例9：插件卸载，验证文献库清空、缓存清除、无残留

---

## 8. 风险与待解决问题

| 风险 | 缓解方案 |
|---|---|
| Semantic Scholar API 有速率限制，高频调用会被封 | 启用缓存 + 请求间隔控制 + 超时降级到 arXiv |
| arXiv API 返回 XML 格式，解析可能遇到特殊字符乱码 | 使用严格 XML 解析器，处理 HTML 实体转义 |
| 部分论文元数据不完整（缺 DOI、缺期刊） | 引用格式生成时做字段容错，缺失字段用占位符或省略 |
| 大模型可能编造文献信息绕过插件直接回答 | 在 system prompt 中明确要求：学术文献必须通过工具检索，禁止编造 |

---

## 9. 交付物清单

- cordis.yml
- src/index.ts（插件入口）
- src/sources/arxiv.ts（arXiv 数据源封装）
- src/sources/semantic-scholar.ts（Semantic Scholar 数据源封装）
- src/citation.ts（引用格式生成器）
- src/library.ts（文献库管理）
- src/types.ts（类型定义）
- package.json / tsconfig.json
- docs/PRD.md（本文档）
- docs/api.md（接口文档）
- README.md 用户文档
- CHANGELOG.md
- LICENSE
