/**
 * arXiv 数据源封装。
 *
 * 接口：http://export.arxiv.org/api/query（Atom XML，公开 API，无需鉴权）。
 * - searchArxiv：按关键词/作者/年份范围检索，支持相关性与日期排序（arXiv 不提供引用数，citations 排序回退相关性）。
 * - arxivDetail：按 arXiv ID 获取单篇元数据。
 *
 * 解析使用本插件自带的严格 XML 解析器（src/xml.ts），处理 HTML 实体转义与命名空间标签（arxiv:doi 等）。
 */

import { httpText, httpTextWithRetry } from '../http'
import { AcademicSourceError } from '../types'
import type { HttpOptions, Paper, SearchFilter } from '../types'
import { attrOf, findChild, findAllDescendants, findAllChildren, parseXml, textOfCollapsed } from '../xml'

const ARXIV_API = 'https://export.arxiv.org/api/query'
const ARXIV_ABS = 'https://arxiv.org/abs'
const ARXIV_PDF = 'https://arxiv.org/pdf'

/** arXiv ID 规范形：`\d{4}\.\d{4,5}`（去除版本后缀 vN）。 */
export const ARXIV_ID_RE = /^\d{4}\.\d{4,5}(?:v\d+)?$/

/** 从 arXiv 论文 URL / ID 中提取规范 ID（去版本）。 */
export function normalizeArxivId(raw: string): string | null {
  const trimmed = raw.trim()
  if (ARXIV_ID_RE.test(trimmed)) return trimmed.replace(/v\d+$/, '')
  const match = /arxiv\.org\/(?:abs|pdf)\/([^v?#\s]+?)(?:v\d+)?(?:\?|#|$)/.exec(trimmed)
  if (match) {
    const id = match[1]!.replace(/\.pdf$/, '')
    return ARXIV_ID_RE.test(id) ? id : null
  }
  return null
}

/** 转义 arXiv search_query 中的用户输入（引号与反斜杠）。 */
function escapeQueryToken(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** 构建 arXiv search_query（关键词 + 作者 + 年份范围）。 */
export function buildArxivQuery(filter: SearchFilter): string {
  const parts: string[] = []
  const keyword = filter.keyword.trim()
  if (!keyword) {
    throw new AcademicSourceError('INVALID_ARG', 'academic_search: keyword 不能为空')
  }
  parts.push(`all:"${escapeQueryToken(keyword)}"`)
  if (filter.author && filter.author.trim() !== '') {
    parts.push(`AND au:"${escapeQueryToken(filter.author.trim())}"`)
  }
  if (filter.yearFrom !== undefined || filter.yearTo !== undefined) {
    const from = filter.yearFrom ?? 1991
    const to = filter.yearTo ?? new Date().getFullYear()
    if (from > to) {
      throw new AcademicSourceError('INVALID_ARG', `academic_search: 年份范围无效（${from} > ${to}）`)
    }
    parts.push(`AND submittedDate:[${from}0101 TO ${to}1231]`)
  }
  return parts.join(' ')
}

/** arXiv 排序参数。 */
function sortParam(sort: SearchFilter['sort']): { sortBy: string; sortOrder: string } {
  switch (sort) {
    case 'date':
      return { sortBy: 'submittedDate', sortOrder: 'descending' }
    case 'citations':
      // arXiv 公开 API 不提供引用数，回退相关性（上层 render 会注明）。
      return { sortBy: 'relevance', sortOrder: 'descending' }
    case 'relevance':
    default:
      return { sortBy: 'relevance', sortOrder: 'descending' }
  }
}

/** 从 Atom <entry> 解析为 Paper。 */
function entryToPaper(entry: ReturnType<typeof findChild>): Paper | null {
  if (!entry) return null
  const idText = textOfCollapsed(findChild(entry, 'id'))
  const arxivId = normalizeArxivId(idText)
  if (!arxivId) return null
  const title = textOfCollapsed(findChild(entry, 'title'))
  const summary = textOfCollapsed(findChild(entry, 'summary'))
  const published = textOfCollapsed(findChild(entry, 'published'))
  const yearMatch = /^\d{4}/.exec(published)
  const doi = textOfCollapsed(findChild(entry, 'arxiv:doi')) || undefined
  const journal = textOfCollapsed(findChild(entry, 'arxiv:journal_ref')) || undefined
  const authors = findAllChildren(entry, 'author')
    .map((author) => textOfCollapsed(findChild(author, 'name')))
    .filter((name) => name !== '')
  // 优先取 rel="alternate"（官方页面）；PDF 由固定规则生成，避免解析 rel 失误。
  const alternate = entry.children.find(
    (child) => child.tag === 'link' && attrOf(child, 'rel') === 'alternate',
  )
  const officialUrl = attrOf(alternate, 'href')?.trim() || `${ARXIV_ABS}/${arxivId}`

  return {
    id: `arxiv:${arxivId}`,
    source: 'arxiv',
    title: title || '(无标题)',
    authors,
    abstract: summary,
    year: yearMatch ? Number.parseInt(yearMatch[0], 10) : 0,
    doi,
    arxivId,
    journal: journal && journal !== '' ? journal : undefined,
    pdfUrl: `${ARXIV_PDF}/${arxivId}`,
    officialUrl,
  }
}

/** 解析 arXiv Atom feed 根节点，返回全部条目（条目位于 <feed> 文档元素下）。 */
function parseFeed(xml: string): Paper[] {
  const root = parseXml(xml)
  const docElement = root.children[0] ?? root
  const entries = findAllDescendants(docElement, 'entry')
  const papers: Paper[] = []
  for (const entry of entries) {
    const paper = entryToPaper(entry)
    if (paper) papers.push(paper)
  }
  return papers
}

/** 统一搜索入口。 */
export async function searchArxiv(filter: SearchFilter, opts: HttpOptions): Promise<Paper[]> {
  const searchQuery = buildArxivQuery(filter)
  const { sortBy, sortOrder } = sortParam(filter.sort)
  const maxResults = Math.min(Math.max(1, filter.maxResults), 50)
  const url = `${ARXIV_API}?search_query=${encodeURIComponent(searchQuery)}&start=0&max_results=${maxResults}&sortBy=${sortBy}&sortOrder=${sortOrder}`
  const xml = await httpTextWithRetry(() => httpText(url, opts))
  return parseFeed(xml)
}

/** 按 arXiv ID 获取单篇元数据（id_list 查询），不存在返回 null。 */
export async function arxivDetail(arxivId: string, opts: HttpOptions): Promise<Paper | null> {
  const id = normalizeArxivId(arxivId)
  if (!id) {
    throw new AcademicSourceError('INVALID_ARG', `无效的 arXiv ID：${arxivId}`)
  }
  const url = `${ARXIV_API}?id_list=${encodeURIComponent(id)}&max_results=1`
  const xml = await httpTextWithRetry(() => httpText(url, opts))
  const papers = parseFeed(xml)
  return papers[0] ?? null
}

/** 按 DOI 在 arXiv 检索（详情工具兜底路径：arXiv 元数据无 DOI 时返回 null）。 */
export async function arxivSearchByDoi(doi: string, opts: HttpOptions): Promise<Paper | null> {
  const url = `${ARXIV_API}?search_query=${encodeURIComponent(`all:"${escapeQueryToken(doi)}"`)}&start=0&max_results=3&sortBy=relevance&sortOrder=descending`
  const xml = await httpTextWithRetry(() => httpText(url, opts))
  const papers = parseFeed(xml)
  return papers.find((paper) => paper.doi && paper.doi.toLowerCase() === doi.toLowerCase()) ?? papers[0] ?? null
}
