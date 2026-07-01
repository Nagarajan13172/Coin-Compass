/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL for browser API calls. Defaults to "/api" (same-origin via the dev proxy). */
  readonly VITE_API_BASE_URL?: string;
  /** Dev only: target the Vite dev server proxies "/api" to. Defaults to http://localhost:4000. */
  readonly VITE_API_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
