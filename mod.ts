/**
 * @fileoverview Storage-agnostic OAuth session management for AT Protocol
 *
 * A flexible OAuth session manager that integrates Iron Session cookies
 * with any storage backend. **Bring your own OAuth client and storage** -
 * works with any compatible implementations.
 *
 * Features:
 * - Complete OAuth flow management (start, callback, refresh, logout)
 * - Bring your own OAuth client (any compatible implementation)
 * - Bring your own storage (any OAuthStorage implementation)
 * - Mobile app WebView integration with custom URL schemes
 * - Session persistence with Iron Session cookies
 * - Automatic token refresh and session extension
 * - Built for Hono web framework with Context-based API
 *
 * @example Basic usage with @tijs/oauth-client-deno
 * ```ts
 * import { ValTownOAuthSessions } from "@tijs/valtown-oauth-sessions";
 * import { OAuthClient } from "@tijs/oauth-client-deno";
 *
 * // Create your storage implementation
 * const storage = {
 *   async get<T>(key: string): Promise<T | null> {
 *     // Your storage implementation
 *   },
 *   async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
 *     // Your storage implementation
 *   },
 *   async delete(key: string): Promise<void> {
 *     // Your storage implementation
 *   },
 * };
 *
 * const oauthClient = new OAuthClient({
 *   clientId: "https://myapp.com/client-metadata.json",
 *   redirectUri: "https://myapp.com/oauth/callback",
 *   storage,
 * });
 *
 * const sessions = new ValTownOAuthSessions({
 *   oauthClient,
 *   storage,
 *   cookieSecret: Deno.env.get("COOKIE_SECRET"),
 *   baseUrl: "https://myapp.com",
 * });
 *
 * // In your Hono app
 * app.get("/oauth/callback", async (c) => {
 *   return await sessions.handleCallback(c);
 * });
 * ```
 *
 * @example Using with custom OAuth client and storage
 * ```ts
 * import { ValTownOAuthSessions, type OAuthClientInterface, type OAuthStorage } from "@tijs/valtown-oauth-sessions";
 *
 * class MyOAuthClient implements OAuthClientInterface {
 *   async authorize(handle: string, options?: { state?: string }): Promise<URL> {
 *     // Your authorization logic
 *   }
 *
 *   async callback(params: URLSearchParams) {
 *     // Your callback logic
 *   }
 * }
 *
 * class MyStorage implements OAuthStorage {
 *   async get<T>(key: string): Promise<T | null> {
 *     // Your implementation
 *   }
 *   async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
 *     // Your implementation
 *   }
 *   async delete(key: string): Promise<void> {
 *     // Your implementation
 *   }
 * }
 *
 * const sessions = new ValTownOAuthSessions({
 *   oauthClient: new MyOAuthClient(),
 *   storage: new MyStorage(),
 *   cookieSecret: Deno.env.get("COOKIE_SECRET"),
 *   baseUrl: "https://myapp.com",
 * });
 * ```
 *
 * @module
 */

export { ValTownOAuthSessions } from "./src/sessions.ts";
export type {
  MobileCallbackData,
  OAuthClientInterface,
  OAuthStorage,
  SessionData,
  SessionInterface,
  StoredOAuthSession,
  ValidationResult,
  ValTownOAuthConfig,
} from "./src/types.ts";
export * from "./src/errors.ts";
