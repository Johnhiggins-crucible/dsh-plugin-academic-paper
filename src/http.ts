/**
 * 共享 HTTP 工具：超时 + 外部取消合并、友好错误、429/5xx 单次退避重试。
 * 仅访问公开学术 API 域名（由各数据源模块固定 URL，不接受用户输入 URL，PRD §6.1）。
 */

import { AcademicSourceError } from './types'
import type { HttpOptions } from './types'

const DEFAULT_HEADERS = {
  accept: 'application/json, application/atom+xml, text/plain, */*',
  'user-agent': 'dsh-plugin-academic-paper/0.1.0 (DeepSeek Harness plugin)',
}

interface PendingRequest {
  controller: AbortController
  timer: ReturnType<typeof setTimeout>
  timedOut: boolean
  externalAborted: boolean
}

function buildRequest(opts: HttpOptions): PendingRequest {
  const controller = new AbortController()
  const pending: PendingRequest = { controller, timer: 0 as unknown as ReturnType<typeof setTimeout>, timedOut: false, externalAborted: false }
  pending.timer = setTimeout(() => {
    pending.timedOut = true
    controller.abort()
  }, opts.timeoutMs)
  if (opts.signal) {
    if (opts.signal.aborted) {
      pending.externalAborted = true
      controller.abort()
    } else {
      opts.signal.addEventListener('abort', () => {
        pending.externalAborted = true
        controller.abort()
      }, { once: true })
    }
  }
  return pending
}

function disposeRequest(pending: PendingRequest): void {
  clearTimeout(pending.timer)
}

function toFriendlyError(pending: PendingRequest, cause: unknown): AcademicSourceError {
  if (pending.externalAborted) {
    // 工具被取消（exec.signal）：保留取消语义，不包装成源错误。
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
  if (pending.timedOut) {
    return new AcademicSourceError('TIMEOUT', '学术数据源请求超时，请稍后重试或更换数据源。', true)
  }
  const message = cause instanceof Error ? cause.message : String(cause)
  return new AcademicSourceError('NETWORK', `无法连接学术数据源（${message}），请检查网络后重试。`, true)
}

/**
 * 请求文本响应。非 2xx 抛出带 HTTP 状态码的 AcademicSourceError（429/5xx 标记可重试）。
 */
export async function httpText(url: string, opts: HttpOptions, headers: Record<string, string> = {}): Promise<string> {
  const pending = buildRequest(opts)
  try {
    const res = await fetch(url, {
      headers: { ...DEFAULT_HEADERS, ...headers },
      signal: pending.controller.signal,
      redirect: 'follow',
    })
    if (!res.ok) {
      let retryAfterSeconds: number | undefined
      const raw = res.headers.get('retry-after')
      if (raw) {
        const parsed = Number.parseInt(raw, 10)
        if (Number.isFinite(parsed)) retryAfterSeconds = parsed
      }
      const retriable = res.status === 429 || res.status >= 500
      const hint = res.status === 429
        ? '数据源触发了限流（429），插件已自动退避重试；仍失败请稍后再试或切换到其他数据源。'
        : `数据源返回 HTTP ${res.status}，请稍后重试或切换数据源。`
      throw new AcademicSourceError(`HTTP_${res.status}`, hint, retriable, { retryAfterSeconds })
    }
    return await res.text()
  } catch (error) {
    if (error instanceof AcademicSourceError) throw error
    throw toFriendlyError(pending, error)
  } finally {
    disposeRequest(pending)
  }
}

/** 请求 JSON 响应。 */
export async function httpJson<T>(url: string, opts: HttpOptions, headers: Record<string, string> = {}): Promise<T> {
  const text = await httpText(url, opts, headers)
  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new AcademicSourceError(
      'BAD_RESPONSE',
      '数据源返回了无法解析的内容，请稍后重试或更换数据源。',
      true,
      { cause: error instanceof Error ? error : undefined },
    )
  }
}

/** 等待指定毫秒。 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const DEFAULT_RETRY_DELAY_MS = 3000
const MAX_RETRY_DELAY_MS = 15000

/**
 * 带单次退避重试的请求：遇 429/5xx 等待后重试一次；仍失败原样抛出。
 * @param request - 实际请求函数（返回文本）。
 * @returns 首次成功或两次尝试后的最终文本。
 */
export async function httpTextWithRetry(
  request: () => Promise<string>,
  fallbackDelayMs = DEFAULT_RETRY_DELAY_MS,
): Promise<string> {
  try {
    return await request()
  } catch (error) {
    if (!(error instanceof AcademicSourceError) || !error.retriable) throw error
    const wait = error.retryAfterSeconds !== undefined
      ? Math.min(error.retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS)
      : fallbackDelayMs
    await delay(wait)
    return request()
  }
}

/** 合并外部信号与超时的通用版本（供需要两次以上重试的调用方使用）。 */
export async function httpJsonWithRetry<T>(
  request: () => Promise<T>,
  fallbackDelayMs = DEFAULT_RETRY_DELAY_MS,
): Promise<T> {
  try {
    return await request()
  } catch (error) {
    if (!(error instanceof AcademicSourceError) || !error.retriable) throw error
    const wait = error.retryAfterSeconds !== undefined
      ? Math.min(error.retryAfterSeconds * 1000, MAX_RETRY_DELAY_MS)
      : fallbackDelayMs
    await delay(wait)
    return request()
  }
}
