// 画布尺寸（小红书全屏 9:15，也就是 3:5）和导出参数
// 预览缩放 0.4 不在这里：它活在 canvas.css 的 --preview-scale（改预览缩放去那改）
export const CANVAS_WIDTH = 1080
export const CANVAS_HEIGHT = 1800
export const EXPORT_SCALE = 2
export const PAGE_PADDING_X = 80
export const CANVAS_CONTENT_WIDTH = CANVAS_WIDTH - PAGE_PADDING_X * 2
export const PUBLIC_EXAM_COVER_PADDING_X = 120
export const PUBLIC_EXAM_INNER_PADDING_X = 96

export function coverContentWidthForTheme(themeClass: string): number {
  const paddingX =
    themeClass === 'theme-public-exam-landscape'
      ? PUBLIC_EXAM_COVER_PADDING_X
      : PAGE_PADDING_X
  return CANVAS_WIDTH - paddingX * 2
}

export const EXPORT_WIDTH = CANVAS_WIDTH * EXPORT_SCALE
export const EXPORT_HEIGHT = CANVAS_HEIGHT * EXPORT_SCALE

// 首图上传后会在信息流里中心裁成竖版 3:4；源图本身仍保持 9:15。
// 1080 × 1800 中的 3:4 可见区高 1440，上下各裁 180。
export const COVER_CROP_HEIGHT = (CANVAS_WIDTH * 4) / 3
export const COVER_CROP_TOP = (CANVAS_HEIGHT - COVER_CROP_HEIGHT) / 2
export const COVER_CROP_BOTTOM = COVER_CROP_TOP + COVER_CROP_HEIGHT
