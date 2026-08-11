import type { AssetKind } from './assetStore'
import {
  resolveAssetSrcWithStatus,
  type AssetResolution,
} from './resolveAsset'

export type PageBackgroundRole = 'cover' | 'inner'

export interface PageBackgroundIds {
  coverAssetId: string
  innerAssetId: string
}

export type PageBackgroundIssueKind = 'missing' | 'load-error'

export interface PageBackgroundIssue {
  id: string
  role: PageBackgroundRole
  assetId: string
  kind: PageBackgroundIssueKind
  label: '首图背景' | '内页背景'
  message: string
}

export interface ResolvedPageBackgrounds {
  coverSrc: string
  innerSrc: string
  issues: PageBackgroundIssue[]
}

type BackgroundAssetKind = Extract<AssetKind, 'background'>

export type PageBackgroundResolver = (
  assetId: string,
  kind: BackgroundAssetKind,
) => Promise<AssetResolution>

interface RoleResolution {
  assetId: string
  src: string
  resolved: boolean
  issue: PageBackgroundIssue | null
}

type ResolverOutcome =
  | { status: 'fulfilled'; value: AssetResolution }
  | { status: 'rejected'; reason: unknown }

const ROLE_LABELS: Record<
  PageBackgroundRole,
  PageBackgroundIssue['label']
> = {
  cover: '首图背景',
  inner: '内页背景',
}

function resourceErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : '本地资源读取失败'
}

function makeIssue(
  role: PageBackgroundRole,
  assetId: string,
  kind: PageBackgroundIssueKind,
  error?: unknown,
): PageBackgroundIssue {
  return {
    id: `background:${role}:${assetId}`,
    role,
    assetId,
    kind,
    label: ROLE_LABELS[role],
    message:
      kind === 'missing'
        ? '素材已经被删除或暂时无法读取'
        : resourceErrorMessage(error),
  }
}

function resolveRole(
  role: PageBackgroundRole,
  assetId: string,
  outcomes: ReadonlyMap<string, ResolverOutcome>,
): RoleResolution {
  // 空 id 是用户明确选择纯色，不是资源缺失。
  if (!assetId) {
    return { assetId, src: '', resolved: false, issue: null }
  }

  const outcome = outcomes.get(assetId)
  if (!outcome || outcome.status === 'rejected') {
    return {
      assetId,
      src: '',
      resolved: false,
      issue: makeIssue(role, assetId, 'load-error', outcome?.reason),
    }
  }

  if (outcome.value.missing || !outcome.value.src) {
    return {
      assetId,
      src: '',
      resolved: false,
      issue: makeIssue(role, assetId, 'missing'),
    }
  }

  return {
    assetId,
    src: outcome.value.src,
    resolved: true,
    issue: null,
  }
}

/**
 * 原子解析 Cover / Inner 底图快照。
 *
 * - 两个不同 id 并行读取；同 id 只读一次。
 * - 显式空 id 表示纯色，永不借用另一角色的底图。
 * - 非空 id 读取失败时可临时借用另一张已解析底图，但仍保留原角色 issue。
 */
export async function resolvePageBackgrounds(
  ids: PageBackgroundIds,
  resolver: PageBackgroundResolver = resolveAssetSrcWithStatus,
): Promise<ResolvedPageBackgrounds> {
  const uniqueAssetIds = Array.from(
    new Set([ids.coverAssetId, ids.innerAssetId].filter(Boolean)),
  )
  const resolvedEntries = await Promise.all(
    uniqueAssetIds.map(async (assetId): Promise<[string, ResolverOutcome]> => {
      try {
        return [
          assetId,
          {
            status: 'fulfilled',
            value: await resolver(assetId, 'background'),
          },
        ]
      } catch (error) {
        return [assetId, { status: 'rejected', reason: error }]
      }
    }),
  )
  const outcomes = new Map(resolvedEntries)
  const cover = resolveRole('cover', ids.coverAssetId, outcomes)
  const inner = resolveRole('inner', ids.innerAssetId, outcomes)

  // 只允许非空且失败的角色借用「另一张直接解析成功」的底图。
  // 这样显式纯色不会被交叉 fallback 覆盖，双失败也不会级联出假成功。
  const coverSrc =
    cover.resolved || !cover.assetId
      ? cover.src
      : inner.resolved
        ? inner.src
        : ''
  const innerSrc =
    inner.resolved || !inner.assetId
      ? inner.src
      : cover.resolved
        ? cover.src
        : ''

  return {
    coverSrc,
    innerSrc,
    issues: [cover.issue, inner.issue].filter(
      (issue): issue is PageBackgroundIssue => issue !== null,
    ),
  }
}

// 单页文档不使用 Inner，因此 Inner 的问题不应阻断导出。
// Cover issue 一直保留；两页及以上才把 Inner issue 纳入预检。
export function pageBackgroundIssuesForPageCount(
  issues: readonly PageBackgroundIssue[],
  pageCount: number,
): PageBackgroundIssue[] {
  return pageCount <= 1
    ? issues.filter((issue) => issue.role !== 'inner')
    : [...issues]
}
