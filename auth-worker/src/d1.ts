// The parts of Cloudflare's D1 and R2 bindings the sign-in server uses.

interface D1Result<T> {
  results: T[];
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface R2Bucket {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
}
