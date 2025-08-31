/**
 * @fileoverview Val Town optimized OAuth session management for AT Protocol
 *
 * A Val Town-specific OAuth session manager that integrates Iron Session,
 * Hono framework, and SQLite for complete OAuth authentication workflows.
 * **Bring your own OAuth client** - works with any compatible implementation.
 *
 * Features:
 * - Complete OAuth flow management (start, callback, refresh, logout)
 * - Bring your own OAuth client (any compatible implementation)
 * - Mobile app WebView integration with custom URL schemes
 * - Session persistence with Iron Session cookies
 * - SQLite storage optimized for Val Town's sqlite2 API
 * - Automatic token refresh and session extension
 * - Built-in mobile vs web detection
 *
 * @example Basic usage with @tijs/oauth-client-deno
 * ```ts
 * import { ValTownOAuthSessions } from "@tijs/valtown-oauth-sessions";
 * import { OAuthClient } from "@tijs/oauth-client-deno";
 *
 * const oauthClient = new OAuthClient({
 *   clientId: "https://myapp.com/client-metadata.json",
 *   redirectUri: "https://myapp.com/oauth/callback",
 * });
 *
 * const sessions = new ValTownOAuthSessions({
 *   oauthClient,
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
 * @example Using with custom OAuth client
 * ```ts
 * import { ValTownOAuthSessions, type OAuthClientInterface } from "@tijs/valtown-oauth-sessions";
 *
 * class MyOAuthClient implements OAuthClientInterface {
 *   async authorize(handle: string, options?: { state?: string }): Promise<string> {
 *     // Your authorization logic
 *   }
 *
 *   async callback(params: { code: string; state?: string }) {
 *     // Your callback logic
 *   }
 * }
 *
 * const sessions = new ValTownOAuthSessions({
 *   oauthClient: new MyOAuthClient(),
 *   cookieSecret: Deno.env.get("COOKIE_SECRET"),
 *   baseUrl: "https://myapp.com",
 * });
 * ```
 *
 * @module
 */

export { ValTownOAuthSessions } from "./src/sessions.ts";
export { ValTownStorage } from "./src/storage.ts";
export type {
  MobileCallbackData,
  OAuthClientInterface,
  SessionData,
  SessionInterface,
  ValidationResult,
  ValTownOAuthConfig,
} from "./src/types.ts";
export * from "./src/errors.ts";
