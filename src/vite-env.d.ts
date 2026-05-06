/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the published anira docs. Used by `renderDescription`
   * to substitute the literal `$DOCS_URL` token in description.md
   * files. Defaults to the production docs site when unset.
   */
  readonly VITE_DOCS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
