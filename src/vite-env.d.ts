/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build-time override of the catalog-rag API base (local testing only). */
  readonly VITE_RAG_API?: string;
}
