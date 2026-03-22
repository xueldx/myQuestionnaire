import path from 'path'
import { defineConfig, loadEnv, normalizePath } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'
import removeConsole from 'vite-plugin-remove-console'
import { visualizer } from 'rollup-plugin-visualizer'
import pkg from './package.json'

// 提取package.json中的版本号
const { version } = pkg

const getPackageNameFromModuleId = (moduleId: string) => {
  const normalizedId = normalizePath(moduleId)

  if (!normalizedId.includes('/node_modules/')) {
    return null
  }

  const pnpmMatch = normalizedId.match(
    /\/node_modules\/\.pnpm\/[^/]+\/node_modules\/(@[^/]+\/[^/]+|[^/]+)/
  )
  if (pnpmMatch?.[1]) {
    return pnpmMatch[1]
  }

  const defaultMatch = normalizedId.match(/\/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
  return defaultMatch?.[1] || null
}

const resolveVendorChunkName = (moduleId: string) => {
  const packageName = getPackageNameFromModuleId(moduleId)
  if (!packageName) {
    return null
  }

  if (
    [
      'react',
      'react-dom',
      'react-router',
      'react-router-dom',
      'react-redux',
      'ahooks',
      '@reduxjs/toolkit',
      'scheduler',
      'history',
      'use-sync-external-store'
    ].includes(packageName)
  ) {
    return 'framework-core'
  }

  if (
    packageName === 'antd' ||
    packageName === 'dayjs' ||
    packageName.startsWith('@ant-design/') ||
    packageName.startsWith('@rc-component/') ||
    packageName.startsWith('@emotion/') ||
    packageName.startsWith('rc-')
  ) {
    return 'framework-core'
  }

  if (packageName.startsWith('@dnd-kit/')) {
    return 'editor-core'
  }

  if (
    packageName === '@antv/g2' ||
    packageName.startsWith('@antv/') ||
    packageName.startsWith('d3-')
  ) {
    return 'chart-core'
  }

  if (
    packageName === 'react-markdown' ||
    packageName === 'unified' ||
    packageName.startsWith('remark-') ||
    packageName.startsWith('rehype-') ||
    packageName.startsWith('micromark') ||
    packageName.startsWith('mdast-') ||
    packageName.startsWith('hast-') ||
    packageName.startsWith('unist-')
  ) {
    return 'ai-core'
  }

  if (
    packageName === 'gsap' ||
    packageName === '@gsap/react' ||
    packageName === 'lottie-react' ||
    packageName === 'lottie-web'
  ) {
    return 'motion-core'
  }

  if (
    packageName === 'axios' ||
    packageName === 'qs' ||
    packageName.startsWith('@babel/runtime')
  ) {
    return 'framework-core'
  }

  return 'vendor-misc'
}

// 导出一个定义Vite配置的函数
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const shouldAnalyze = mode === 'analyze' || env.BUILD_ANALYZE === 'true'
  const devPort = Number(env.VITE_DEV_PORT || 8877)
  const previewPort = Number(env.VITE_PREVIEW_PORT || devPort)
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:8879'
  const clientProxyTarget = env.VITE_CLIENT_URL || 'http://localhost:8878'
  const proxyConfig = {
    '/api': {
      target: apiProxyTarget,
      changeOrigin: true
    },
    '/client': {
      target: clientProxyTarget,
      changeOrigin: true
    }
  }

  return {
    // 设置项目的基路径
    base: '/',
    // 配置模块解析选项
    resolve: {
      // pnpm workspace 下同一个依赖可能通过不同路径被解析。
      // 对 React 做去重，避免源码和三方库分别拿到不同的运行时实例，触发 hooks dispatcher 为空的问题。
      dedupe: ['react', 'react-dom'],
      alias: {
        // 配置 '@' 别名指向 src 目录
        '@': path.resolve(__dirname, 'src')
      }
    },
    // 配置开发服务器
    server: {
      proxy: proxyConfig,
      // 开发端口支持本地 .env.local 覆盖，便于并行跑多套服务
      port: devPort,
      // 启动时自动打开浏览器
      open: true
    },
    preview: {
      proxy: proxyConfig,
      port: previewPort
    },
    // 配置插件列表
    plugins: [
      // 使用 React 插件
      react(),
      // 创建 SVG 图标插件
      createSvgIconsPlugin({
        // 指定需要缓存的图标文件夹
        iconDirs: [path.resolve(process.cwd(), 'src/assets/svg')],
        // 指定symbolId格式
        symbolId: 'icon-[dir]-[name]'
      }),
      // 使用图片优化插件
      ViteImageOptimizer(),
      // 使用 removeConsole 插件
      removeConsole(),
      shouldAnalyze
        ? visualizer({
            filename: path.resolve(__dirname, 'dist', 'bundle-analysis.html'),
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
            open: false
          })
        : null
    ].filter(Boolean),
    // 配置 CSS 相关选项
    css: {
      preprocessorOptions: {
        scss: {
          // 在 SCSS 中添加额外的数据
          additionalData: `@use "sass:math" as *;`,
          includePaths: ['node_modules'],
          // 添加 --math-style 参数
          implementation: require('sass'),
          sassOptions: {
            outputStyle: 'compressed',
            // 设置数学风格
            mathStyle: 'always'
          }
        },
        postcss: {
          // 使用 PostCSS 插件
          plugins: [require('tailwindcss'), require('autoprefixer')]
        }
      }
    },
    // 定义全局常量
    define: {
      __APP_VERSION__: JSON.stringify(version)
    },
    // 配置构建选项
    build: {
      rollupOptions: {
        output: {
          // 手动分割代码块
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return resolveVendorChunkName(id)
            }
          }
        }
      }
    }
  }
})
