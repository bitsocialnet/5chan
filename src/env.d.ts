/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare interface ImportMetaEnv {
  readonly VITE_COMMIT_REF: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_DISTRIBUTION?: string;
  readonly VITE_FORGE_IMAGES_API_ORIGIN?: string;
  readonly VITE_FORGE_IMAGES_MEDIA_ORIGIN?: string;
  readonly VITE_FORGE_IMAGES_TURNSTILE_SITEKEY?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
