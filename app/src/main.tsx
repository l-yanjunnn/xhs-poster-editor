import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 思源黑 / 思源宋 全 7 档本地化。Why: 大陆访问 Google Fonts CDN 不稳，关键字体走 npm 包 + Vite 打包确保可用。
// fontsource 按 unicode-range 分片，浏览器只下载页面实际渲染到的字符所在分片，全权重不会一次拉满。
import '@fontsource/noto-sans-sc/100.css'
import '@fontsource/noto-sans-sc/200.css'
import '@fontsource/noto-sans-sc/300.css'
import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/600.css'
import '@fontsource/noto-sans-sc/700.css'
import '@fontsource/noto-sans-sc/800.css'
import '@fontsource/noto-sans-sc/900.css'
import '@fontsource/noto-serif-sc/200.css'
import '@fontsource/noto-serif-sc/300.css'
import '@fontsource/noto-serif-sc/400.css'
import '@fontsource/noto-serif-sc/500.css'
import '@fontsource/noto-serif-sc/600.css'
import '@fontsource/noto-serif-sc/700.css'
import '@fontsource/noto-serif-sc/800.css'
import '@fontsource/noto-serif-sc/900.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
