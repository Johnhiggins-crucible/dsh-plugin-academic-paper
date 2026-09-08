# dsh-plugin-academic-paper

DeepSeek Harness 学术文献插件：**插件负责真实数据源检索与引用格式生成，大模型负责解读与综述**，从机制上杜绝模型编造论文、作者、DOI 等文献信息。

- 检索：arXiv（公开 API）＋ Semantic Scholar（公开 API），支持关键词、作者、年份范围过滤与相关性/日期/引用数排序
- 详情：单篇论文完整元数据（全文摘要、全部作者、期刊/会议、引用数、PDF 链接、官方链接）
- 引用：GB/T 7714 / APA / BibTeX 三种格式，本地确定性生成，不依赖大模型
- 文献库：按会话隔离，内存保存，DOI/arXiv ID/标题自动去重，支持删除、清空、批量导出（BibTeX / Markdown）
- 侧边面板：文献库列表 + 检索历史 + 一键清空/导出（可复制或下载 `.bib`/`.md` 文件）/复制，自动适配浅/深主题
- 防幻觉：system prompt 强制要求学术文献必须经工具检索，禁止编造

## 安装

需要 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（Node.js 22+，Web profile）。

```bash
# 本地开发目录安装
dsh plugin --profile web add file:./dsh-plugin-academic-paper

# 重启 web 生效
dsh web
```

插件加载后，网页右下角出现「📚 文献」侧边面板；模型即可使用 `academic_*` 工具。

## 快速开始

对模型说：

- 「帮我检索关于 transformer 的论文，最近 5 年，来源 arXiv」
- 「检索 Vaswani 2017 那篇 Attention Is All You Need 的详细信息」
- 「把这篇文献加入文献库，然后用 GB/T 7714 生成引用」
- 「导出文献库为 BibTeX 和 Markdown」

## 工具清单

| 工具 | 用途 |
|---|---|
| `academic_search` | 按关键词/作者/年份范围检索文献，支持数据源与排序 |
| `academic_paper_detail` | 按 paperId / DOI / arXiv ID 获取单篇完整详情 |
| `academic_cite` | 生成 GB/T 7714 / APA / BibTeX 引用 |
| `academic_library_add` | 将文献加入当前会话文献库（自动去重） |
| `academic_library_list` | 查看当前会话文献库 |
| `academic_library_remove` | 从文献库删除单篇 |
| `academic_library_export` | 导出文献库为 BibTeX / Markdown |

完整参数与返回值见 [docs/api.md](docs/api.md)，上手用法见 [docs/usage.md](docs/usage.md)。

## 配置

插件行配置（对应 `cordis.yml` 配置 schema，默认值见下）：

```yaml
- id: dsh-plugin-academic-paper
  name: dsh-plugin-academic-paper
  config:
    enable: true
    default_source: semantic_scholar   # arxiv | semantic_scholar | both
    max_results: 10                    # 单次检索最大返回条数（1-50）
    default_cite_format: gb_t_7714     # gb_t_7714 | apa | bibtex
    request_timeout: 15                # API 请求超时（秒）
    enable_cache: true                 # 检索结果缓存开关
    max_cache_entries: 50              # 单会话缓存条目上限（防内存膨胀）
    cache_ttl_seconds: 300             # 缓存有效期（秒）
    max_library_size: 500              # 单会话文献库上限
```

配置支持热更新（`applies: live`），修改后立即生效，无需重启。

## 数据源说明

- **arXiv**：`https://export.arxiv.org/api/query`，Atom XML。返回标题/作者/摘要/发布日期/PDF 链接；不提供引用数（按引用数排序自动回退相关性）。
- **Semantic Scholar**：`https://api.semanticscholar.org/graph/v1`，JSON。返回引用数、DOI、期刊信息；**未鉴权的共享限流较紧**，插件已内置 429 自动退避重试；`source=both` 时单源失败自动降级到另一源。

本插件**不提供付费文献全文下载**（版权原因），仅返回元数据与公开摘要；不内置文献数据库，所有检索实时调用公开 API（PRD §2.3）。

## 会话隔离与数据生命周期

- 文献库/检索历史/缓存**按会话隔离**，每个 session 独立维护
- 全部数据**仅保存在内存**：插件卸载或 Harness 重启后自动清空，无磁盘残留（PRD §4.1/§4.2）
- 插件为纯工具型，不监听会话事件，不调用时完全不介入会话流程

## 目录结构

```
dsh-plugin-academic-paper/
├── package.json            # bundle 声明（Node + client 双 half）
├── cordis.patch.yml        # 组合包配置层（PRD「cordis.yml」在 Harness 中的形态）
├── tsconfig.json / tsdown.config.ts
├── src/
│   ├── index.ts            # 插件入口：7 个工具 + 配置 + systemPrompt + UI 路由 + 清理
│   ├── types.ts            # 类型定义
│   ├── xml.ts              # 严格 XML 解析器（arXiv Atom，实体转义）
│   ├── http.ts             # 共享 HTTP：超时/取消/429 退避重试
│   ├── citation.ts         # 引用格式生成器（GB/T 7714 / APA / BibTeX）
│   ├── library.ts          # 文献库管理（会话隔离/去重/缓存/导出）
│   ├── sources/
│   │   ├── arxiv.ts        # arXiv 数据源
│   │   └── semantic-scholar.ts  # Semantic Scholar 数据源
│   └── client.js           # 浏览器侧边面板（__ModuleLoader__ 挂载）
├── docs/
│   ├── PRD.md              # 产品需求文档
│   └── api.md              # 接口文档
├── test/run-tests.mjs      # 单元测试 + 集成冒烟
├── README.md
├── CHANGELOG.md
└── LICENSE
```

## 开发

```bash
pnpm install        # 安装依赖
pnpm run build      # tsdown 构建 src/*.ts → lib/
pnpm run typecheck  # 类型检查
pnpm test           # 运行测试（网络用例失败自动跳过，不阻塞）
```

## License

MIT
