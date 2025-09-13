/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLIENT_URL: string
  // 更多环境变量...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  const __APP_VERSION__: string
}

export {}
