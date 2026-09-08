# dsh-plugin-academic-paper 接口文档

本文档面向插件二次开发者与 Harness 集成方，描述：

1. 插件注册给大模型的 7 个工具（参数 / 返回 / 行为）
2. 插件 Web UI 数据路由
3. 内部模块导出（测试与复用入口）
4. 异常语义与错误码

---

## 1. 工具接口（注册给大模型的 Tool）

所有工具均通过 `ctx.tools.register()` 注册，参数 JSON Schema 校验由 Harness 工具注册表完成。
未启用插件（`enable=false`）时，所有工具抛出 `DISABLED` 错误。

### 1.1 academic_search

按关键词检索学术文献。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| keyword | string | ✅ | 检索关键词 |
| source | string | - | `arxiv` / `semantic_scholar` / `both`；缺省取配置 `default_source` |
| yearFrom | number | - | 起始年份（含） |
| yearTo | number | - | 截止年份（含） |
| author | string | - | 作者姓名过滤 |
| maxResults | number | - | 最大返回条数（1-50）；缺省取配置 `max_results` |
| sort | string | - | `relevance` / `date` / `citations`；缺省 relevance。arXiv 不支持按引用数排序，自动回退相关性 |

返回：

```jsonc
{
  "papers": [ /* Paper，见 1.8 */ ],
  "query": "transformer",
  "source": "semantic_scholar",
  "total": 10,
  "errors": [] // 仅 source=both 且单源失败时非空，如 ["arXiv 检索失败：…"]
}
```

行为细节：

- 缓存命中（同关键词+过滤+源，TTL 内）直接返回，不重复请求网络
- `source=both` 双源并行，结果按 arXiv ID / DOI / 标题去重（arXiv 优先）
- 单源失败不致命：both 模式下降级到另一源并在 `errors` 中说明
- 每次成功检索记录到当前会话的检索历史

### 1.2 academic_paper_detail

获取单篇文献完整详情。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| paperId | string | - | 内部 ID（`arxiv:xxx` / `s2:xxx`），也可直接传 arXiv ID / DOI / S2 paperId |
| doi | string | - | DOI（如 `10.48550/arXiv.1706.03762`） |
| arxivId | string | - | arXiv ID（如 `1706.03762`） |

三个参数至少提供一个。解析顺序：会话索引 → paperId 启发式 → doi → arxivId（详见 1.7）。
返回单个 `Paper` 对象（见 1.8），解析成功后写入会话索引（后续 `academic_cite` / `academic_library_add` 可直接引用）。

### 1.3 academic_cite

生成标准引用格式。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| paperId | string | - | 同上，推荐 |
| doi | string | - | 备选标识 |
| arxivId | string | - | 备选标识 |
| format | string | - | `gb_t_7714` / `apa` / `bibtex`；缺省取配置 `default_cite_format` |

返回：`{ citation: string, format: string, paperId: string }`

格式细节（本地确定性生成）：

- **GB/T 7714（2015）**：作者（>3 人取前 3 + `, 等`，中文姓名不拆分）；有期刊 → `作者. 题名[J]. 刊名, 年.`（附 DOI）；无期刊 → `作者. 题名[EB/OL]. (年)[引用日期]. URL.`
- **APA（第 7 版）**：作者（≤20 全列，>20 前 19 + `…` + 末位）；无年份 → `(n.d.)`；arXiv 预印本 → `arXiv preprint arXiv:xxxx`
- **BibTeX**：`@article{key, ...}`，key = `姓氏+年份+题名首词`（如 `vaswani2017attention`）；arXiv 条目含 `eprint` + `archivePrefix={arXiv}`；LaTeX 特殊字符自动转义

字段缺失时占位/省略；任何意外错误回退到基础格式 `作者. 题名. 年份.`（PRD §6.2.5）。

### 1.4 academic_library_add

将文献加入当前会话文献库。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| paperId | string | ✅ | 内部 ID 或 arXiv ID / DOI |
| doi | string | - | 备选标识 |
| arxivId | string | - | 备选标识 |

返回：`{ success: boolean, msg: string }`

去重规则：同一 DOI（忽略大小写）/ 同一 arXiv ID / 同一标题（忽略大小写+空白）均判定为已存在，不重复加入。文献库达到 `max_library_size` 上限时拒绝并提示。

### 1.5 academic_library_list

查看当前会话文献库。无入参。

返回：`{ papers: Paper[], session: string }`

### 1.6 academic_library_remove

从文献库删除单篇。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| paperId | string | ✅ | 要删除的文献内部 ID（见 academic_library_list 返回） |

返回：`{ success: boolean, msg: string }`

### 1.7 academic_library_export

批量导出文献库。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| format | string | - | `bibtex`（默认）/ `markdown` |

返回：`{ content: string, format: string, count: number }`

- bibtex：多条目 `@article` 拼接，可直接保存为 `.bib` 文件
- markdown：带编号的参考文献列表，可直接粘贴到论文

### 1.8 Paper 统一结构

```ts
interface Paper {
  id: string              // 内部唯一 ID：arxiv:<arxivId> | s2:<s2PaperId>
  source: 'arxiv' | 'semantic_scholar'
  title: string
  authors: string[]
  abstract: string
  year: number
  doi?: string
  arxivId?: string
  journal?: string
  citationCount?: number
  pdfUrl?: string
  officialUrl?: string
  addedAt?: number        // 仅文献库条目有值
}
```

### 1.9 paperId 解析顺序（detail / cite / add 共用）

1. 会话索引（本次会话已检索/已看过/已在文献库的论文）
2. `paperId` 启发式：
   - `arxiv:xxx` → arXiv 详情，失败回落 Semantic Scholar
   - `s2:xxx` → Semantic Scholar paperId
   - 形如 `\d{4}\.\d{4,5}` → arXiv ID，失败回落 Semantic Scholar
   - 形如 `10.xxxx` → Semantic Scholar DOI，失败回落 arXiv 按 DOI 检索
   - 其他 → 视为 S2 paperId / CorpusId 直查
3. `doi` → Semantic Scholar DOI → arXiv 按 DOI 检索
4. `arxivId` → arXiv 详情 → Semantic Scholar arXiv

---

## 2. Web UI 数据路由

由插件宿主在 web profile 下注册（`ctx.webServer`），供侧边面板（`src/client.js`）调用。所有路径前缀 `/academic/ui`。

| 方法 | 路径 | 参数 | 返回 |
|---|---|---|---|
| GET | `/academic/ui/state` | - | `{ sessions: [{ id, paperCount, historyCount, updatedAt }] }`，按最近活动降序 |
| GET | `/academic/ui/library` | `?session=<id>` | `{ session, library: Paper[], history: [{ keyword, timestamp, resultCount }] }` |
| POST | `/academic/ui/remove` | `{ session, paperId }` | `{ success, msg }` |
| POST | `/academic/ui/clear` | `{ session }` | `{ success, msg }` |
| GET | `/academic/ui/export` | `?session=<id>&format=bibtex\|markdown` | `text/plain` / `text/markdown` 导出内容 |

会话 id 缺省为 `default`。会话隔离与工具侧一致（按 session id）。

## 3. 内部模块导出（测试与二次开发）

插件入口 `lib/index.js` 额外导出：

- `formatCitation(paper, format)` / `formatGbT7714` / `formatApa` / `formatBibtex` / `bibtexKey` / `splitName` / `escapeLatex`
- `AcademicStore`（`addPaper` / `removePaper` / `clear` / `list` / `exportBibtex` / `exportMarkdown` / `overview` / `snapshot` / `clearAll` / `cacheGet` / `cacheSet` / `findKnown` / `remember` / `recordSearch`）
- `cacheKeyOf` / `buildFilter`
- `searchArxiv` / `arxivDetail` / `arxivSearchByDoi` / `searchSemanticScholar` / `semanticScholarDetail`
- `parseXml` / `findChild` / `findAllChildren` / `findAllDescendants` / `textOf` / `textOfCollapsed`
- 类型：`Paper` / `CitationFormat` / `PaperSource` / `ResolvedConfig`

## 4. 异常语义与错误码

工具执行抛出 `AcademicSourceError`（Harness 工具注册表将其标记为 `isError`，模型可见友好 message）：

| code | 场景 | 可重试 |
|---|---|---|
| `DISABLED` | 插件未启用 | 否 |
| `INVALID_ARG` | 参数缺失/格式错误/年份范围倒置/DOI 非法 | 否 |
| `NOT_FOUND` | 论文标识无法解析到任何文献 | 否 |
| `TIMEOUT` | API 请求超时（配置 `request_timeout`） | 是 |
| `NETWORK` | 网络不可达/DNS 失败 | 是 |
| `HTTP_429` | 数据源限流 | 是（已自动退避重试一次） |
| `HTTP_4xx/5xx` | 数据源其他错误 | 5xx 可重试 |
| `BAD_RESPONSE` | 数据源返回无法解析内容 | 是 |
| `SEARCH_FAILED` | 检索整体失败 | 是 |

行为保证（PRD §6.2）：任何单点失败都不抛致命异常、不导致 Harness 崩溃；429 自动退避重试一次；`both` 模式单源失败自动降级。

## 5. 安全边界（PRD §6.1）

- 不访问本地文件、不调用 shell
- 网络请求仅访问固定公开 API 域名（`export.arxiv.org`、`api.semanticscholar.org`），不接受任意用户输入 URL
- 检索缓存有条目数与 TTL 上限，防止内存膨胀
- 文献库/历史/缓存全部内存态，卸载即清空，无磁盘残留
