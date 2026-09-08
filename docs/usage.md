# dsh-plugin-academic-paper 使用教程

> DeepSeek Harness（Web 桌面端）学术文献助手插件。插件负责真实数据源检索与引用格式生成，
> 大模型只做解读与综述，杜绝编造论文、作者、DOI（详见 [PRD.md](PRD.md)）。

## 1. 安装与生效

```bash
# 方式 A（推荐）：npm 已发布，一行直装
dsh plugin --profile web add dsh-plugin-academic-paper

# 方式 B：本地源码安装（开发 / 调试）
#   git clone https://github.com/zhaoxuejie/dsh-plugin-academic-paper.git
#   cd dsh-plugin-academic-paper && pnpm install
#   dsh plugin --profile web add file:./dsh-plugin-academic-paper

# 重启后生效
dsh web
```

- 加载成功后，页面右下角出现「📚 文献」胶囊入口，点击展开侧边文献库面板。
- **修改过插件代码后必须重启应用**（live 热插拔只会增删插件行，不会刷新已加载的模块缓存）。
- 插件数据全部保存在内存：重启/卸载后文献库、检索历史与缓存自动清空。

## 2. 检索文献

直接用自然语言对模型说，例如：

| 你想做的事 | 说一句 |
|---|---|
| 关键词检索 | 「帮我检索关于 **transformer** 的论文」 |
| 指定来源 | 「检索 **LoRA** 的论文，来源 arXiv」 |
| 指定年份范围 | 「检索 2020–2024 的 **diffusion model** 综述」 |
| 按作者查 | 「查一下 **Yann LeCun** 关于对比学习的文献」 |
| 按引用数排序 | 「检索 **vision transformer**，按引用数排序」 |
| 双源合并 | 「同时搜 arXiv 和 Semantic Scholar，最近 5 年」 |

底层为 `academic_search` 工具，支持过滤条件：来源（arxiv / semantic_scholar / both）、
年份范围、作者、排序（相关性/日期/引用数）、返回条数。

## 3. 单篇详情

- 「获取那篇 *Attention Is All You Need* 的完整信息」
- 「查一下 DOI 为 `10.48550/arXiv.1706.03762` 的论文详情」
- 「按 arXiv ID `1706.03762` 取详情」

底层为 `academic_paper_detail`，返回完整摘要、全部作者、期刊/会议、引用数、PDF 与官方链接。

## 4. 生成引用（禁止模型自行拼格式）

- 「把这篇用 **GB/T 7714** 生成引用」
- 「换 **APA** 格式再来一条」
- 「给我它的 **BibTeX**，我要存进 .bib 文件」

底层为 `academic_cite`，格式由插件本地确定性生成，不依赖大模型：

- **GB/T 7714（2015）**：中文论文常用；>3 作者取前 3 +「, 等」；无期刊退化为电子文献 `[EB/OL]`。
- **APA（第 7 版）**：社科常用；≤20 作者全列；arXiv 预印本标注。
- **BibTeX**：LaTeX 用户常用；key = `姓氏+年份+题名首词`（如 `vaswani2017attention`）。

## 5. 文献库管理

| 操作 | 说一句 |
|---|---|
| 加入文献库 | 「把刚才那两篇加入文献库」（自动去重） |
| 查看文献库 | 「看看我文献库里有什么」 |
| 删除单篇 | 「删掉第 2 篇」 |
| 批量导出 | 「把文献库导出成 BibTeX」/「导出成 Markdown 参考文献列表」 |

- 去重规则：同一 DOI / arXiv ID / 标题（忽略大小写与空白）不重复加入。
- 文献库按会话隔离：每个会话独立维护。

## 6. 侧边面板（右下角「📚 文献」）

- **文献库 tab**：逐条展示标题/作者/年份/来源，可展开详情、移除；
- **检索历史 tab**：查看本会话最近的检索关键词与命中数；
- **底部按钮**：清空、导出 BibTeX、导出 Markdown；
- **导出区**：导出内容以等宽字体展示；可「复制到剪贴板」（复制全文），也可点「下载文件」直接保存 `.bib` / `.md`（文件名带日期）；
- **主题**：面板自动跟随 GUI 浅色/深色主题，切换主题时实时换肤。

## 7. 配置项

在 profile 的插件行 `config` 中配置（对应默认值见下），支持热更新：

| key | 类型 | 默认值 | 说明 |
|---|---|---|---|
| enable | boolean | true | 插件总开关 |
| default_source | string | semantic_scholar | 默认数据源 |
| max_results | number | 10 | 单次检索最大条数 |
| default_cite_format | string | gb_t_7714 | 默认引用格式 |
| request_timeout | number | 15 | API 超时（秒） |
| enable_cache | boolean | true | 检索结果缓存开关 |
| max_cache_entries | number | 50 | 单会话缓存上限 |
| cache_ttl_seconds | number | 300 | 缓存有效期（秒） |
| max_library_size | number | 500 | 单会话文献库上限 |

## 8. 常见问题

- **模型说学术工具不可用**：该会话的预设可能限制了工具，请用默认/普通预设的新会话。
- **检索报错或很慢**：Semantic Scholar 未鉴权共享限流较紧（429 时插件自动退避重试一次），
  频繁失败请改用 `arxiv` 或 `both` 数据源。
- **修改代码后行为没变**：需要**完全重启**应用，热插拔不会刷新已加载的模块代码。
- **检索无结果**：插件会如实告知；请更换关键词/调整年份或作者过滤。
- **面板样式不更新**：硬刷新页面（Ctrl+F5）；仍不行则重启应用。

## 9. 数据与安全边界

- 仅访问公开学术 API：arXiv、Semantic Scholar；不下载付费文献全文（版权）。
- 不访问本地文件、不调用 shell；检索/详情/引用均由工具完成，模型禁止编造文献信息。
- 全部数据仅存内存，卸载即清空，无磁盘残留。

更多接口细节见 [api.md](api.md)。
