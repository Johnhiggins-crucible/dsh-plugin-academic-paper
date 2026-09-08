/**
 * Semantic Scholar 数据源封装。
 *
 * 接口：https://api.semanticscholar.org/graph/v1（公开 API，无需鉴权，有共享限流）。
 * - searchSemanticScholar：搜索（作者/年份在本地过滤，排序在本地完成 —— S2 搜索仅支持相关性排序）。
 * - semanticScholarDetail：按 paperId / DOI / arXiv ID / CorpusId 获取单篇详情。
 *
 * 限流策略（PRD §6.2.2 / §8）：429/5xx 自动退避重试一次；仍失败抛出友好错误，
 * 由上层在 source=both 时降级到 arXiv，在单源时提示用户切换数据源。
 */

import { httpJson, httpJsonWithRetry } from '../http'
import { AcademicSourceError } from '../types'
import type { HttpOptions, Paper, PaperSource, SearchFilter } from '../types'

const S2_BASE = 'https://api.semanticscholar.org/graph/v1'
const S2_FIELDS = [
  'title',
  'abstract',
  'authors',
  'year',
  'publicationDate',
  'venue',
  'citationCount',
  'externalIds',
  'url',
  'journal',
  'isOpenAccess',
  'openAccessPdf',
  'publicationTypes',
].join(',')

interface S2Author {
  authorId?: string
  name: string
}

interface S2ExternalIds {
  DOI?: string
  ArXiv?: string
  CorpusId?: number
  MAG?: string
  DBLP?: string
}

interface S2Journal {
  name?: string
  volume?: string
  pages?: string
}

interface S2OpenAccessPdf {
  url?: string | null
  status?: string | null
}

interface S2Paper {
  paperId: string
  title?: string | null
  abstract?: string | null
  authors?: S2Author[]
  year?: number | null
  publicationDate?: string | null
  venue?: string | null
  citationCount?: number | null
  externalIds?: S2ExternalIds
  url?: string | null
  journal?: S2Journal | null
  isOpenAccess?: boolean | null
  openAccessPdf?: S2OpenAccessPdf | null
}

interface S2SearchResponse {
  total?: number
  offset?: number
  data: S2Paper[]
}

/** 将 S2 论文对象映射为统一 Paper 结构。 */
export function s2PaperToPaper(raw: S2Paper, fallbackSource: PaperSource = 'semantic_scholar'): Paper | null {
  if (!raw || typeof raw.paperId !== 'string') return null
  const arxivId = raw.externalIds?.ArXiv
  const paper: Paper = {
    id: `s2:${raw.paperId}`,
    source: fallbackSource,
    title: raw.title?.trim() || '(无标题)',
    authors: (raw.authors ?? []).map((author) => author.name).filter((name) => name !== ''),
    abstract: raw.abstract?.trim() ?? '',
    year: raw.year ?? 0,
    doi: raw.externalIds?.DOI || undefined,
    arxivId: arxivId || undefined,
    journal: raw.journal?.name?.trim() || raw.venue?.trim() || undefined,
    citationCount: raw.citationCount ?? undefined,
    pdfUrl: raw.openAccessPdf?.url?.trim() || undefined,
    officialUrl: raw.url?.trim() || undefined,
  }
  return paper
}

/** 作者本地过滤：任一作者名包含关键词（不区分大小写）。 */
function matchesAuthor(paper: S2Paper, author: string): boolean {
  const needle = author.trim().toLowerCase()
  if (!needle) return true
  return (paper.authors ?? []).some((a) => a.name.toLowerCase().includes(needle))
}

/** 年份本地过滤。 */
function matchesYear(paper: S2Paper, yearFrom?: number, yearTo?: number): boolean {
  const year = paper.year ?? 0
  if (!year) return yearFrom === undefined && yearTo === undefined
  if (yearFrom !== undefined && year < yearFrom) return false
  if (yearTo !== undefined && year > yearTo) return false
  return true
}

function compareForSort(a: Paper, b: Paper, sort: SearchFilter['sort']): number {
  if (sort === 'date') return (b.year || 0) - (a.year || 0)
  if (sort === 'citations') return (b.citationCount || 0) - (a.citationCount || 0)
  return 0
}

/**
 * S2 搜索。作者/年份为本地过滤（S2 搜索接口无对应参数），
 * 因此先取较大上限再过滤，保证过滤后仍能凑满 maxResults。
 */
export async function searchSemanticScholar(filter: SearchFilter, opts: HttpOptions): Promise<Paper[]> {
  const keyword = filter.keyword.trim()
  if (!keyword) {
    throw new AcademicSourceError('INVALID_ARG', 'academic_search: keyword 不能为空')
  }
  const maxResults = Math.min(Math.max(1, filter.maxResults), 50)
  // S2 单页 limit 上限 100；过滤损耗按 3 倍放大，封顶 100。
  const fetchLimit = Math.min(Math.max(50, maxResults * 3), 100)
  const url = `${S2_BASE}/paper/search?query=${encodeURIComponent(keyword)}&limit=${fetchLimit}&fields=${encodeURIComponent(S2_FIELDS)}&sort=relevance:desc`
  const response = await httpJsonWithRetry<S2SearchResponse>(
    () => httpJson<S2SearchResponse>(url, opts),
    4000,
  )
  const filtered = (response.data ?? [])
    .filter((raw) => matchesAuthor(raw, filter.author ?? ''))
    .filter((raw) => matchesYear(raw, filter.yearFrom, filter.yearTo))
  const papers = filtered
    .map((raw) => s2PaperToPaper(raw))
    .filter((paper): paper is Paper => paper !== null)
  if (filter.sort !== 'relevance') papers.sort((a, b) => compareForSort(a, b, filter.sort))
  return papers.slice(0, maxResults)
}

/**
 * S2 单篇详情。identifier 支持：paperId（S2 的 40 位十六进制 id 或 CorpusId 数字）、
 * DOI（自动加 "DOI:" 前缀）、arXiv ID（自动加 "arXiv:" 前缀）。
 * 不存在的论文返回 null。
 */
export async function semanticScholarDetail(
  identifier: { paperId?: string; doi?: string; arxivId?: string },
  opts: HttpOptions,
): Promise<Paper | null> {
  let path: string
  if (identifier.doi && identifier.doi.trim() !== '') {
    const doi = identifier.doi.trim()
    if (!/^10\.\S+$/i.test(doi)) {
      throw new AcademicSourceError('INVALID_ARG', `无效的 DOI：${doi}`)
    }
    path = `DOI:${doi}`
  } else if (identifier.arxivId && identifier.arxivId.trim() !== '') {
    path = `arXiv:${identifier.arxivId.trim().replace(/^arXiv:/i, '')}`
  } else if (identifier.paperId && identifier.paperId.trim() !== '') {
    path = identifier.paperId.trim().replace(/^s2:/, '')
  } else {
    throw new AcademicSourceError('INVALID_ARG', 'academic_paper_detail: 需提供 paperId / doi / arxivId 之一')
  }

  const url = `${S2_BASE}/paper/${encodeURIComponent(path)}?fields=${encodeURIComponent(S2_FIELDS)}`
  const response = await httpJsonWithRetry<S2Paper>(() => httpJson<S2Paper>(url, opts), 4000)
  if (!response || typeof response.paperId !== 'string') return null
  return s2PaperToPaper(response)
}
