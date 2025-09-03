// Minimal Worker KV types to satisfy TypeScript locally without pulling @cloudflare/workers-types
// This intentionally covers only the members used by this project.

interface KVNamespaceListKey {
  name: string;
}

interface KVNamespaceListResult {
  keys: KVNamespaceListKey[];
}

interface KVNamespacePutOptions {
  expiration?: number;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: KVNamespacePutOptions
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<KVNamespaceListResult>;
}
