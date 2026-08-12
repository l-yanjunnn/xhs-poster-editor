export const LAYOUT_FONT_REQUEST_SELECTOR = '[data-layout-font-request]'

export const DEFAULT_FONT_SAMPLE = '汉A0'

export const DEFAULT_GENERIC_FONT_FAMILIES = [
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
] as const

/** macOS 内置字体不会出现在 FontFaceSet.load 的返回字面中。 */
export const DEFAULT_SYSTEM_LAYOUT_FONT_FAMILIES = [
  'PingFang SC',
  'Songti SC',
  'Helvetica Neue',
  '-apple-system',
] as const

export interface LayoutFontRequest {
  family: string
  weight?: string | number
  style?: string
  sample?: string
}

export interface NormalizedLayoutFontRequest {
  family: string
  weight: string
  style: string
  sample: string
}

export type DeterministicFontIssueReason =
  | 'invalid-request'
  | 'api-unavailable'
  | 'timeout'
  | 'load-error'
  | 'empty-result'

export interface DeterministicFontIssue {
  kind: 'font'
  reason: DeterministicFontIssueReason
  family: string
  weight: string
  style: string
  sample: string
  label: string
  message: string
}

export interface LayoutFontRequestCollection {
  requests: NormalizedLayoutFontRequest[]
  issues: DeterministicFontIssue[]
}

export type LayoutFontLoader = (
  font: string,
  sample: string,
) => PromiseLike<ArrayLike<unknown> | null | undefined>

export interface DeterministicFontReadinessOptions {
  /** A mockable replacement for `Document.fonts.load`. `null` disables the API. */
  load?: LayoutFontLoader | null
  /** Used only when `load` is omitted. Defaults to the root/global document. */
  ownerDocument?: Document
  timeoutMs?: number
  /** Exact generic/system family names which may bypass FontFaceSet verification. */
  allowlistedFamilies?: Iterable<string>
  /** Standard CSS generic families are explicitly allowlisted by default. */
  includeDefaultGenericFamilies?: boolean
}

export interface DeterministicFontReadinessResult {
  ok: boolean
  requests: NormalizedLayoutFontRequest[]
  verified: NormalizedLayoutFontRequest[]
  allowlisted: NormalizedLayoutFontRequest[]
  issues: DeterministicFontIssue[]
}

interface StructuredElementDefaults {
  family?: unknown
  weight?: unknown
  style?: unknown
  sample?: unknown
}

interface NormalizationFailure {
  request: null
  detail: string
}

interface NormalizationSuccess {
  request: NormalizedLayoutFontRequest
  detail: null
}

type NormalizationResult = NormalizationFailure | NormalizationSuccess

type LoadOutcome =
  | { type: 'loaded'; faces: ArrayLike<unknown> | null | undefined }
  | { type: 'timeout' }
  | { type: 'rejected'; error: unknown }

const DEFAULT_TIMEOUT_MS = 5_000
const UNKNOWN_FAMILY = '未知字体'
const GENERIC_FAMILY_SET = new Set<string>(DEFAULT_GENERIC_FONT_FAMILIES)

function primaryFamily(value: string): string {
  let quote = ''
  let escaped = false
  let end = value.length
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === ',') {
      end = index
      break
    }
  }

  const family = value.slice(0, end).trim()
  const first = family[0]
  const last = family[family.length - 1]
  if ((first === '"' || first === "'") && first === last) {
    return family.slice(1, -1).trim()
  }
  return family
}

function normalizeWeight(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return '400'
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 1 && value <= 1_000
      ? String(value)
      : null
  }
  if (typeof value !== 'string') return null
  const weight = value.trim().toLowerCase()
  if (/^(normal|bold|bolder|lighter)$/u.test(weight)) return weight
  if (!/^\d+(?:\.\d+)?$/u.test(weight)) return null
  const numeric = Number(weight)
  return numeric >= 1 && numeric <= 1_000 ? weight : null
}

function normalizeStyle(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return 'normal'
  if (typeof value !== 'string') return null
  const style = value.trim().toLowerCase()
  return /^(normal|italic|oblique(?:\s+[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:deg|grad|rad|turn))?)$/u.test(
    style,
  )
    ? style
    : null
}

function normalizeSample(value: unknown, fallback: string): string | null {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    return null
  }
  const sample = typeof value === 'string' ? value.trim() : fallback.trim()
  return sample || DEFAULT_FONT_SAMPLE
}

function normalizeRequest(
  input: unknown,
  defaults: StructuredElementDefaults = {},
  fallbackSample = DEFAULT_FONT_SAMPLE,
): NormalizationResult {
  let fields: Record<string, unknown>
  if (typeof input === 'string') fields = { family: input }
  else if (input && typeof input === 'object' && !Array.isArray(input)) {
    fields = input as Record<string, unknown>
  } else if (input === undefined || input === null) fields = {}
  else return { request: null, detail: '请求必须是字体名、JSON 对象或对象数组' }

  const rawFamily = fields.family ?? defaults.family
  if (typeof rawFamily !== 'string') {
    return { request: null, detail: '缺少字符串 family' }
  }
  const family = primaryFamily(rawFamily)
  if (!family) return { request: null, detail: 'family 不能为空' }

  const weight = normalizeWeight(fields.weight ?? defaults.weight)
  if (!weight) return { request: null, detail: `字体 ${family} 的 weight 无效` }
  const style = normalizeStyle(fields.style ?? defaults.style)
  if (!style) return { request: null, detail: `字体 ${family} 的 style 无效` }
  const sample = normalizeSample(
    fields.sample ?? defaults.sample,
    fallbackSample,
  )
  if (!sample) return { request: null, detail: `字体 ${family} 的 sample 无效` }

  return { request: { family, weight, style, sample }, detail: null }
}

function requestKey(request: NormalizedLayoutFontRequest): string {
  return JSON.stringify([
    request.family.toLocaleLowerCase(),
    request.weight,
    request.style,
    request.sample,
  ])
}

function issueLabel(family: string, weight: string): string {
  return `${family} (${weight})`
}

function issueFor(
  request: NormalizedLayoutFontRequest,
  reason: DeterministicFontIssueReason,
  message: string,
): DeterministicFontIssue {
  return {
    kind: 'font',
    reason,
    ...request,
    label: issueLabel(request.family, request.weight),
    message,
  }
}

function invalidIssue(
  defaults: StructuredElementDefaults,
  detail: string,
): DeterministicFontIssue {
  const family =
    typeof defaults.family === 'string' && primaryFamily(defaults.family)
      ? primaryFamily(defaults.family)
      : UNKNOWN_FAMILY
  const weight = normalizeWeight(defaults.weight) ?? '400'
  const style = normalizeStyle(defaults.style) ?? 'normal'
  const sample = normalizeSample(defaults.sample, DEFAULT_FONT_SAMPLE) ?? DEFAULT_FONT_SAMPLE
  return issueFor(
    { family, weight, style, sample },
    'invalid-request',
    `字体布局请求无效：${detail}`,
  )
}

function structuredDefaults(element: Element): StructuredElementDefaults {
  return {
    family: element.getAttribute('data-layout-font-family') ?? undefined,
    weight: element.getAttribute('data-layout-font-weight') ?? undefined,
    style: element.getAttribute('data-layout-font-style') ?? undefined,
    sample: element.getAttribute('data-layout-font-sample') ?? undefined,
  }
}

function requestElements(root: ParentNode): Element[] {
  const elements: Element[] = []
  const maybeElement = root as ParentNode & {
    matches?: (selector: string) => boolean
  }
  if (
    typeof maybeElement.matches === 'function' &&
    maybeElement.matches(LAYOUT_FONT_REQUEST_SELECTOR)
  ) {
    elements.push(maybeElement as unknown as Element)
  }
  elements.push(...root.querySelectorAll(LAYOUT_FONT_REQUEST_SELECTOR))
  return elements
}

function parseElementCandidates(
  element: Element,
  defaults: StructuredElementDefaults,
): { candidates: unknown[]; error: string | null } {
  const attribute = element.getAttribute('data-layout-font-request')?.trim() ?? ''
  if (!attribute) return { candidates: [undefined], error: null }

  try {
    const parsed = JSON.parse(attribute) as unknown
    if (
      (parsed === true || parsed === false || parsed === null) &&
      typeof defaults.family === 'string'
    ) {
      return { candidates: [undefined], error: null }
    }
    return {
      candidates: Array.isArray(parsed) ? parsed : [parsed],
      error: null,
    }
  } catch {
    if (attribute.startsWith('{') || attribute.startsWith('[')) {
      return { candidates: [], error: 'data-layout-font-request 不是有效 JSON' }
    }
    return { candidates: [attribute], error: null }
  }
}

export function collectLayoutFontRequests(
  root: ParentNode,
): LayoutFontRequestCollection {
  const requests: NormalizedLayoutFontRequest[] = []
  const issues: DeterministicFontIssue[] = []
  const seen = new Set<string>()

  for (const element of requestElements(root)) {
    const defaults = structuredDefaults(element)
    const parsed = parseElementCandidates(element, defaults)
    if (parsed.error) {
      issues.push(invalidIssue(defaults, parsed.error))
      continue
    }

    const fallbackSample = element.textContent?.trim() || DEFAULT_FONT_SAMPLE
    for (const candidate of parsed.candidates) {
      const normalized = normalizeRequest(candidate, defaults, fallbackSample)
      if (!normalized.request) {
        issues.push(invalidIssue(defaults, normalized.detail))
        continue
      }
      const key = requestKey(normalized.request)
      if (seen.has(key)) continue
      seen.add(key)
      requests.push(normalized.request)
    }
  }

  return { requests, issues }
}

function cssFamily(family: string): string {
  if (GENERIC_FAMILY_SET.has(family.toLocaleLowerCase())) return family
  return `"${family.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`
}

export function fontRequestToCssFont(
  request: NormalizedLayoutFontRequest,
): string {
  return `${request.style} ${request.weight} 16px ${cssFamily(request.family)}`
}

function allowlistFor(
  options: DeterministicFontReadinessOptions,
): Set<string> {
  const allowlist = new Set<string>()
  if (options.includeDefaultGenericFamilies !== false) {
    for (const family of DEFAULT_GENERIC_FONT_FAMILIES) allowlist.add(family)
  }
  for (const family of options.allowlistedFamilies ?? []) {
    const normalized = primaryFamily(String(family)).toLocaleLowerCase()
    if (normalized) allowlist.add(normalized)
  }
  return allowlist
}

function globalDocument(): Document | undefined {
  return typeof document === 'undefined' ? undefined : document
}

function resolveLoader(
  options: DeterministicFontReadinessOptions,
): LayoutFontLoader | null {
  if (options.load !== undefined) return options.load
  const ownerDocument = options.ownerDocument ?? globalDocument()
  const fontSet = ownerDocument?.fonts
  if (!fontSet || typeof fontSet.load !== 'function') return null
  return (font, sample) => fontSet.load(font, sample)
}

function timeoutMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_TIMEOUT_MS
}

function loadWithTimeout(
  load: LayoutFontLoader,
  font: string,
  sample: string,
  durationMs: number,
): Promise<LoadOutcome> {
  return new Promise((resolve) => {
    let settled = false
    const timer = globalThis.setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ type: 'timeout' })
    }, durationMs)

    void Promise.resolve()
      .then(() => load(font, sample))
      .then(
        (faces) => {
          if (settled) return
          settled = true
          globalThis.clearTimeout(timer)
          resolve({ type: 'loaded', faces })
        },
        (error: unknown) => {
          if (settled) return
          settled = true
          globalThis.clearTimeout(timer)
          resolve({ type: 'rejected', error })
        },
      )
  })
}

function errorDetail(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return typeof error === 'string' && error ? error : '未知错误'
}

function uniqueNormalizedRequests(
  requests: readonly LayoutFontRequest[],
): LayoutFontRequestCollection {
  const normalizedRequests: NormalizedLayoutFontRequest[] = []
  const issues: DeterministicFontIssue[] = []
  const seen = new Set<string>()
  for (const input of requests) {
    const normalized = normalizeRequest(input)
    if (!normalized.request) {
      issues.push(invalidIssue(input, normalized.detail))
      continue
    }
    const key = requestKey(normalized.request)
    if (seen.has(key)) continue
    seen.add(key)
    normalizedRequests.push(normalized.request)
  }
  return { requests: normalizedRequests, issues }
}

export async function validateLayoutFontRequests(
  requests: readonly LayoutFontRequest[],
  options: DeterministicFontReadinessOptions = {},
): Promise<DeterministicFontReadinessResult> {
  const normalized = uniqueNormalizedRequests(requests)
  const allowlist = allowlistFor(options)
  const load = resolveLoader(options)
  const verified: NormalizedLayoutFontRequest[] = []
  const allowlisted: NormalizedLayoutFontRequest[] = []
  const issues = [...normalized.issues]
  const pending: NormalizedLayoutFontRequest[] = []

  for (const request of normalized.requests) {
    if (allowlist.has(request.family.toLocaleLowerCase())) {
      allowlisted.push(request)
    } else pending.push(request)
  }

  if (!load) {
    issues.push(
      ...pending.map((request) =>
        issueFor(
          request,
          'api-unavailable',
          `无法验证字体 ${issueLabel(request.family, request.weight)}：FontFaceSet.load 不可用`,
        ),
      ),
    )
  } else {
    const durationMs = timeoutMs(options.timeoutMs)
    const outcomes = await Promise.all(
      pending.map(async (request) => ({
        request,
        outcome: await loadWithTimeout(
          load,
          fontRequestToCssFont(request),
          request.sample,
          durationMs,
        ),
      })),
    )

    for (const { request, outcome } of outcomes) {
      const label = issueLabel(request.family, request.weight)
      if (outcome.type === 'timeout') {
        issues.push(
          issueFor(
            request,
            'timeout',
            `等待字体 ${label} 超过 ${Math.ceil(durationMs)} 毫秒`,
          ),
        )
      } else if (outcome.type === 'rejected') {
        issues.push(
          issueFor(
            request,
            'load-error',
            `加载字体 ${label} 失败：${errorDetail(outcome.error)}`,
          ),
        )
      } else if (!outcome.faces || outcome.faces.length === 0) {
        issues.push(
          issueFor(
            request,
            'empty-result',
            `字体 ${label} 未返回任何已加载字面，不能确认主字体可用`,
          ),
        )
      } else verified.push(request)
    }
  }

  return {
    ok: issues.length === 0,
    requests: normalized.requests,
    verified,
    allowlisted,
    issues,
  }
}

function documentForRoot(root: ParentNode): Document | undefined {
  if ('ownerDocument' in root && root.ownerDocument) return root.ownerDocument
  if ('nodeType' in root && root.nodeType === 9) return root as Document
  return globalDocument()
}

export async function checkDeterministicFontReadiness(
  root: ParentNode,
  options: DeterministicFontReadinessOptions = {},
): Promise<DeterministicFontReadinessResult> {
  const collected = collectLayoutFontRequests(root)
  const validated = await validateLayoutFontRequests(collected.requests, {
    ...options,
    ownerDocument: options.ownerDocument ?? documentForRoot(root),
  })
  const issues = [...collected.issues, ...validated.issues]
  return { ...validated, ok: issues.length === 0, issues }
}
