/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DETERMINANT_SERVER_URL?: string;
  readonly VITE_DETERMINANT_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
