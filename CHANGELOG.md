# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 语义化版本约定。

## [0.1.2] - 2026-09-09

### 变更

- README 安装章节补充 **npm 直装方式**（方式 A，推荐）与 GitHub 源码安装（方式 B），并附验证/卸载说明
- `package.json` 补充 npm 发布元数据（`repository` / `homepage` / `bugs`）
- 使用教程 `docs/usage.md` 安装章节同步 npm 直装命令
- README 新增界面预览截图（`docs/screenshot/` 浅/深主题）

## [0.1.1] - 2026-09-08

### 修复

- 工具输出边界去除值为 `undefined` 的字段，符合宿主「无损 JSON」校验（修复 `academic_search` 等的 `value is not lossless JSON` 报错）
- 渲染回调签名对齐宿主约定 `render(args, value)`，修复检索结果渲染报错
- 客户端面板样式表未挂载导致的「全白/裸样式」问题

### 变更

- 侧边面板整体重排（统一字体与字阶、留白/对齐/按钮规范化），自动判定浅/深主题并实时跟随切换
- 导出区新增「下载文件」（`.bib` / `.md`，文件名带日期）；「复制」改用 Clipboard API 复制全文
- 新增使用教程 `docs/usage.md`，README 补充入口与导出说明
- README 新增界面预览（`docs/screenshot/` 浅/深主题截图）并修正目录结构文档

## [0.1.0] - 2026-09-06

### 新增（对应 PRD V1.0）

- **检索（功能 1）**：`academic_search` 工具，支持 arXiv / Semantic Scholar / 双源合并三种模式；关键词、作者、年份范围过滤；相关性/日期/引用数排序；真实数据源返回标题、作者、摘要、年份、DOI、期刊、引用数、PDF 链接
- **详情（功能 2）**：`academic_paper_detail` 工具，按 paperId / DOI / arXiv ID 解析单篇完整元数据，含全文摘要与全部作者
- **引用（功能 3）**：`academic_cite` 工具，本地确定性生成 GB/T 7714 / APA / BibTeX 三种格式；字段缺失占位/省略，异常回退基础格式
- **文献库（功能 4/5）**：`academic_library_add / list / remove / export` 工具；按会话隔离、内存保存；DOI/arXiv ID/标题自动去重；上限保护；BibTeX 与 Markdown 批量导出
- **侧边 UI 面板（功能 6）**：浏览器 half（`src/client.js`）经 `__ModuleLoader__` 挂载，展示文献库列表（可展开详情、移除）、检索历史、清空/导出/复制
- **防幻觉（PRD §8）**：system prompt 注入「学术文献必须经工具检索、禁止编造」约束段；检索无结果时如实告知
- **工程化**：TypeScript 源码 + tsdown 构建；严格 XML 解析器（arXiv Atom，实体转义）；HTTP 层统一超时/取消/429 退避重试；`both` 模式单源失败自动降级；配置热更新（`applies: live`）；卸载清理全部会话状态

### 修复

- 无（首版）

### 变更

- 无（首版）

## 未发布

### 规划（后续版本）

- [ ] `academic_paper_refs`：论文参考文献提取
- [ ] 文献库持久化（可选存储后端）
- [ ] 检索结果分页加载
