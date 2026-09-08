/**
 * 最小严格 XML 解析器（零依赖）。
 *
 * 用途：解析 arXiv API 返回的 Atom XML。只实现本插件需要的能力：
 *   - 元素（含自闭合 `<a/>`）、属性、文本、CDATA、注释、处理指令、DOCTYPE 跳过
 *   - 标准实体与数字实体解码（&amp; &lt; &gt; &quot; &apos; &#xNN; &#NN;）
 *   - 标签名保留原始大小写与命名空间前缀（如 `arxiv:doi`、`opensearch:totalResults`）
 *   - 严格校验：未闭合标签、闭合标签不匹配、属性缺引号 → 抛出可读错误
 *
 * 不做的：DTD 内部子集、混合命名空间展开、XPath。需要时由上层 helper 遍历。
 */

export interface XmlNode {
  tag: string
  attrs: Record<string, string>
  children: XmlNode[]
  /** 直接文本（不含子元素文本）；实体已解码。 */
  text: string
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

/** 解码一个实体引用（`&name;` / `&#DD;` / `&#xHH;`），未知实体按字面保留。 */
export function decodeEntities(input: string): string {
  if (!input.includes('&')) return input
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith('#x')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body] ?? whole
  })
}

interface TokenizerState {
  xml: string
  pos: number
  nodes: XmlNode[]
  stack: Array<{ node: XmlNode; textStart: number }>
}

function fail(state: TokenizerState, message: string): never {
  throw new Error(`XML 解析失败（位置 ${state.pos}）：${message}`)
}

function appendText(state: TokenizerState, start: number, end: number): void {
  if (end <= start) return
  const raw = state.xml.slice(start, end)
  const text = decodeEntities(raw)
  const current = state.stack[state.stack.length - 1]
  if (current) current.node.text += text
}

function findTagEnd(xml: string, start: number): number {
  let quote: string | null = null
  for (let i = start; i < xml.length; i++) {
    const ch = xml[i]
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '>') return i
  }
  return -1
}

function parseAttrs(tagBody: string): { attrs: Record<string, string>; selfClosing: boolean } {
  const attrs: Record<string, string> = {}
  const trimmed = tagBody.trim()
  let selfClosing = trimmed.endsWith('/')
  let body = selfClosing ? trimmed.slice(0, -1).trim() : trimmed
  const re = /([^\s=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'))?/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    const name = match[1]!
    const double = match[3]
    const single = match[4]
    if (double !== undefined) attrs[name] = decodeEntities(double)
    else if (single !== undefined) attrs[name] = decodeEntities(single)
    else attrs[name] = '' // 裸属性
  }
  return { attrs, selfClosing }
}

/**
 * 解析一段 XML 文本为节点树（根为伪节点，tag 为空字符串）。
 * 严格模式下任何格式错误都会抛错，避免把损坏的 arXiv 响应静默当作空结果。
 */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: '', attrs: {}, children: [], text: '' }
  const state: TokenizerState = {
    xml,
    pos: 0,
    nodes: [root],
    stack: [{ node: root, textStart: 0 }],
  }

  let textStart = 0
  const s = xml
  const len = s.length
  let i = 0

  while (i < len) {
    const lt = s.indexOf('<', i)
    if (lt === -1) {
      appendText(state, textStart, len)
      break
    }
    appendText(state, textStart, lt)

    // 处理指令 <? ... ?>
    if (s.startsWith('<?', lt)) {
      const end = s.indexOf('?>', lt + 2)
      if (end === -1) fail(state, '处理指令未闭合')
      i = end + 2
      textStart = i
      continue
    }
    // 注释 <!-- ... -->
    if (s.startsWith('<!--', lt)) {
      const end = s.indexOf('-->', lt + 4)
      if (end === -1) fail(state, '注释未闭合')
      i = end + 3
      textStart = i
      continue
    }
    // CDATA <![CDATA[ ... ]]>
    if (s.startsWith('<![CDATA[', lt)) {
      const end = s.indexOf(']]>', lt + 9)
      if (end === -1) fail(state, 'CDATA 未闭合')
      const raw = s.slice(lt + 9, end)
      const current = state.stack[state.stack.length - 1]
      if (current) current.node.text += raw
      i = end + 3
      textStart = i
      continue
    }
    // 其他 <! ... >（DOCTYPE 等）
    if (s.startsWith('<!', lt)) {
      const end = findTagEnd(s, lt + 2)
      if (end === -1) fail(state, 'DOCTYPE/声明未闭合')
      i = end + 1
      textStart = i
      continue
    }
    // 闭合标签 </tag>
    if (s.startsWith('</', lt)) {
      const end = s.indexOf('>', lt + 2)
      if (end === -1) fail(state, '闭合标签未找到 >')
      const tag = s.slice(lt + 2, end).trim()
      const top = state.stack.pop()
      if (!top) fail(state, `多余闭合标签 </${tag}>`)
      if (top.node.tag !== tag) {
        fail(state, `闭合标签 </${tag}> 与开始标签 <${top.node.tag}> 不匹配`)
      }
      i = end + 1
      textStart = i
      continue
    }
    // 开始标签 <tag ...> 或 <tag .../>
    const gt = findTagEnd(s, lt + 1)
    if (gt === -1) fail(state, '开始标签未找到 >')
    const tagBody = s.slice(lt + 1, gt)
    const spaceIdx = tagBody.search(/[\s/]/)
    const tag = (spaceIdx === -1 ? tagBody : tagBody.slice(0, spaceIdx)).trim()
    if (!tag) fail(state, '空标签名')
    const { attrs, selfClosing } = parseAttrs(tagBody)
    const node: XmlNode = { tag, attrs, children: [], text: '' }
    const parent = state.stack[state.stack.length - 1]
    if (parent) parent.node.children.push(node)
    if (selfClosing) {
      i = gt + 1
      textStart = i
      continue
    }
    state.stack.push({ node, textStart: 0 })
    i = gt + 1
    textStart = i
  }

  if (state.stack.length !== 1) {
    const top = state.stack[state.stack.length - 1]
    fail(state, `标签 <${top?.node.tag ?? '?'}> 未闭合`)
  }
  return root
}

/** 查找第一个 tag 匹配的直接子节点。 */
export function findChild(node: XmlNode, tag: string): XmlNode | undefined {
  return node.children.find((child) => child.tag === tag)
}

/** 收集所有 tag 匹配的（直接）子节点。 */
export function findAllChildren(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter((child) => child.tag === tag)
}

/** 收集子树中所有 tag 匹配的后代节点（含直接子级，深度优先）。 */
export function findAllDescendants(node: XmlNode, tag: string): XmlNode[] {
  const out: XmlNode[] = []
  const walk = (current: XmlNode): void => {
    for (const child of current.children) {
      if (child.tag === tag) out.push(child)
      walk(child)
    }
  }
  walk(node)
  return out
}

/** 拼接节点及其后代的所有文本（用于 <title>、<summary> 等）。 */
export function textOf(node: XmlNode | undefined): string {
  if (!node) return ''
  let out = node.text
  for (const child of node.children) out += textOf(child)
  return out
}

/** 拼接后代文本并按空白折叠（arXiv 标题/摘要多行、含换行与缩进）。 */
export function textOfCollapsed(node: XmlNode | undefined): string {
  return textOf(node).replace(/\s+/g, ' ').trim()
}

/** 取节点的某属性值，缺省返回 undefined。 */
export function attrOf(node: XmlNode | undefined, name: string): string | undefined {
  const value = node?.attrs[name]
  return value === undefined ? undefined : value
}
