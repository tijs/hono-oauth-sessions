import { Context } from "@hono/hono";
import { getIronSession, sealData, unsealData } from "iron-session";
import { isValidHandle } from "@atproto/syntax";

import type {
  HonoOAuthConfig,
  Logger,
  OAuthStorage,
  RefreshResult,
  SessionData,
  SessionInterface,
  StoredOAuthSession,
  ValidationResult,
} from "./types.ts";
import {
  ConfigurationError,
  MobileIntegrationError,
  OAuthFlowError,
  SessionError,
} from "./errors.ts";

// No-op logger for production use
const noopLogger: Logger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Hono OAuth session manager
 *
 * Provides complete OAuth flow management with Iron Session integration,
 * mobile app support, and automatic token refresh.
 */
export class HonoOAuthSessions {
  private readonly config: Required<HonoOAuthConfig>;
  private readonly storage: OAuthStorage;
  private readonly logger: Logger;

  constructor(config: HonoOAuthConfig) {
    // Validate required config
    if (!config.oauthClient) {
      throw new ConfigurationError("oauthClient is required");
    }
    if (!config.storage) {
      throw new ConfigurationError("storage is required");
    }
    if (!config.cookieSecret) {
      throw new ConfigurationError("cookieSecret is required");
    }
    if (config.cookieSecret.length < 32) {
      throw new ConfigurationError(
        "cookieSecret must be at least 32 characters for secure encryption (Iron Session requirement)",
      );
    }
    if (!config.baseUrl) {
      throw new ConfigurationError("baseUrl is required");
    }

    // Set defaults - spread config first, then apply defaults for undefined values
    this.config = {
      ...config,
      cookieName: config.cookieName || "sid",
      sessionTtl: config.sessionTtl ?? 60 * 60 * 24 * 7, // 7 days
      mobileScheme: config.mobileScheme || "app://auth-callback",
      logger: config.logger || noopLogger, // Never undefined - always have a logger
    } as Required<HonoOAuthConfig>;

    this.storage = config.storage;
    this.logger = this.config.logger;
  }

  /**
   * Get Iron Session from request
   */
  private async getSession(c: Context): Promise<any> {
    return await getIronSession<SessionData>(c.req.raw, c.res, {
      cookieName: this.config.cookieName,
      password: this.config.cookieSecret,
      ttl: this.config.sessionTtl,
    });
  }

  /**
   * Start OAuth flow for handle
   */
  async startOAuth(
    handle: string,
    options?: { mobile?: boolean; codeChallenge?: string; redirectPath?: string },
  ): Promise<string> {
    if (!isValidHandle(handle)) {
      throw new OAuthFlowError("Invalid handle");
    }

    try {
      const state: any = {
        handle,
        timestamp: Date.now(),
      };

      if (options?.mobile) {
        state.mobile = true;
        state.codeChallenge = options.codeChallenge;
      }

      // Store redirect path for post-OAuth redirect (validate it's a relative path)
      if (options?.redirectPath) {
        // Security: Only allow relative paths starting with /
        if (options.redirectPath.startsWith("/") && !options.redirectPath.startsWith("//")) {
          state.redirectPath = options.redirectPath;
        } else {
          this.logger.warn(`Invalid redirect path ignored: ${options.redirectPath}`);
        }
      }

      const authUrl = await this.config.oauthClient.authorize(handle, {
        state: JSON.stringify(state),
      });

      return authUrl.toString();
    } catch (error) {
      throw new OAuthFlowError(
        `Failed to start OAuth: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(c: Context): Promise<Response> {
    try {
      const url = new URL(c.req.url);
      const params = url.searchParams;

      const code = params.get("code");
      const stateParam = params.get("state");

      if (!code || !stateParam) {
        throw new OAuthFlowError("Missing code or state parameters");
      }

      // Parse state
      let state: any;
      try {
        state = JSON.parse(stateParam);
      } catch {
        throw new OAuthFlowError("Invalid state parameter");
      }

      // Complete OAuth callback
      const callbackResult = await this.config.oauthClient.callback(params);

      const { session: oauthSession } = callbackResult;
      const did = oauthSession.did;

      // Store OAuth session data including DPoP keys
      await this.storage.set(`session:${did}`, oauthSession.toJSON());

      // Create Iron Session
      const session = await this.getSession(c);
      session.did = did;
      session.createdAt = Date.now();
      session.lastAccessed = Date.now();
      await session.save();

      // Handle mobile callback
      if (state.mobile) {
        const sealedToken = await sealData(
          { did },
          { password: this.config.cookieSecret },
        );

        const mobileCallbackUrl = new URL(this.config.mobileScheme);
        mobileCallbackUrl.searchParams.set("session_token", sealedToken);
        mobileCallbackUrl.searchParams.set("did", did);
        mobileCallbackUrl.searchParams.set("handle", state.handle);

        if (oauthSession.accessToken) {
          mobileCallbackUrl.searchParams.set("access_token", oauthSession.accessToken);
        }
        if (oauthSession.refreshToken) {
          mobileCallbackUrl.searchParams.set("refresh_token", oauthSession.refreshToken);
        }

        return c.redirect(mobileCallbackUrl.toString());
      }

      // Web callback - redirect to stored path or home
      const redirectPath = state.redirectPath || "/";
      return c.redirect(redirectPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.text(`OAuth callback failed: ${message}`, 400);
    }
  }

  /**
   * Validate session and return user info.
   * Token refresh is handled by the OAuth client's restore() method when needed.
   */
  async validateSession(c: Context): Promise<ValidationResult> {
    try {
      const session = await this.getSession(c);

      if (!session.did) {
        return { valid: false };
      }

      // Update last accessed time
      session.lastAccessed = Date.now();
      await session.save();

      // Get stored OAuth data
      const oauthData = await this.storage.get<StoredOAuthSession>(`session:${session.did}`);
      if (!oauthData) {
        // Clean up invalid session
        await session.destroy();
        return { valid: false };
      }

      return {
        valid: true,
        did: session.did,
        handle: oauthData.handle,
      };
    } catch (error) {
      throw new SessionError(
        `Session validation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Validate mobile session from Authorization header
   *
   * Similar to validateSession but handles Bearer token authentication
   * instead of cookie-based sessions. Used for mobile API access.
   *
   * @param authHeader - Authorization header with Bearer token
   * @returns ValidationResult with session information
   * @throws MobileIntegrationError if token is invalid
   */
  async validateMobileSession(authHeader: string): Promise<ValidationResult> {
    try {
      if (!authHeader.startsWith("Bearer ")) {
        throw new MobileIntegrationError("Invalid authorization header");
      }

      const sealedToken = authHeader.slice(7);

      // Unseal token to get session data
      const sessionData = await unsealData(sealedToken, {
        password: this.config.cookieSecret,
      }) as { did: string };

      if (!sessionData.did) {
        throw new MobileIntegrationError("Invalid session token");
      }

      // Get stored OAuth session
      const oauthData = await this.storage.get<StoredOAuthSession>(
        `session:${sessionData.did}`,
      );
      if (!oauthData) {
        return { valid: false };
      }

      return {
        valid: true,
        did: sessionData.did,
        handle: oauthData.handle,
      };
    } catch (error) {
      if (error instanceof MobileIntegrationError) {
        throw error;
      }
      throw new MobileIntegrationError(
        `Mobile session validation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Refresh mobile token
   */
  async refreshMobileToken(authHeader: string): Promise<RefreshResult> {
    try {
      if (!authHeader.startsWith("Bearer ")) {
        throw new MobileIntegrationError("Invalid authorization header");
      }

      const sealedToken = authHeader.slice(7);

      // Unseal token to get session data
      const sessionData = await unsealData(sealedToken, {
        password: this.config.cookieSecret,
      }) as { did: string };

      if (!sessionData.did) {
        throw new MobileIntegrationError("Invalid session token");
      }

      // Get stored OAuth session
      const oauthData = await this.storage.get<StoredOAuthSession>(
        `session:${sessionData.did}`,
      );
      if (!oauthData) {
        return {
          success: false,
          error: "OAuth session not found",
        };
      }

      // Use OAuth client to restore session with automatic token refresh (if expired)
      try {
        const oauthSession = await this.config.oauthClient.restore(sessionData.did);
        if (oauthSession) {
          // The oauth-client-deno restore() method already handles token refresh automatically
          // Tokens are managed server-side, mobile just gets a new sealed session ID
          const newSealedToken = await sealData(
            { did: sessionData.did },
            { password: this.config.cookieSecret },
          );

          return {
            success: true,
            payload: {
              did: sessionData.did,
              sid: newSealedToken,
            },
          };
        }
      } catch (restoreError) {
        // If restore fails, fall back to just returning a new sealed token
        this.logger.log("OAuth restore failed during refresh, falling back:", restoreError);
      }

      // Fallback: Just return a new sealed session ID without token refresh
      const newSealedToken = await sealData(
        { did: sessionData.did },
        { password: this.config.cookieSecret },
      );

      return {
        success: true,
        payload: {
          did: sessionData.did,
          sid: newSealedToken,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Logout user and clean up session
   */
  async logout(c: Context): Promise<void> {
    try {
      const session = await this.getSession(c);

      if (session.did) {
        // Clean up OAuth session data
        await this.storage.delete(`session:${session.did}`);
      }

      // Destroy Iron Session
      await session.destroy();
    } catch (error) {
      throw new SessionError(
        `Logout failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get stored OAuth session data for API calls
   */
  async getStoredOAuthData(did: string): Promise<StoredOAuthSession | null> {
    try {
      return await this.storage.get<StoredOAuthSession>(`session:${did}`);
    } catch (error) {
      throw new SessionError(
        `Failed to get OAuth session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get a ready-to-use OAuth session with automatic token refresh
   *
   * This method provides a clean interface for applications to get OAuth sessions
   * without needing to handle the complexity of session restoration and token refresh.
   *
   * The underlying OAuth client automatically handles token refresh if the session
   * is expired. This method will throw typed errors to help diagnose authentication
   * issues.
   *
   * @param did - User's DID to restore session for
   * @returns Promise resolving to OAuth session, or null if not found
   * @throws {SessionNotFoundError} When session doesn't exist in storage
   * @throws {RefreshTokenExpiredError} When refresh token has expired
   * @throws {RefreshTokenRevokedError} When refresh token has been revoked
   * @throws {NetworkError} For transient network failures
   * @throws {TokenExchangeError} For other token refresh failures
   * @throws {SessionError} For unexpected session restoration failures
   *
   * @example
   * ```ts
   * try {
   *   const oauthSession = await sessions.getOAuthSession(userDid);
   *   if (oauthSession) {
   *     const response = await oauthSession.fetch('/xrpc/com.atproto.repo.listRecords');
   *   }
   * } catch (error) {
   *   if (error instanceof SessionNotFoundError) {
   *     // User needs to re-authenticate
   *   } else if (error instanceof RefreshTokenExpiredError) {
   *     // Refresh token expired - re-login required
   *   }
   * }
   * ```
   */
  async getOAuthSession(did: string): Promise<SessionInterface | null> {
    this.logger.log(`Restoring OAuth session for DID: ${did}`);

    // The OAuth client's restore() method now throws typed errors
    // instead of returning null. We propagate these errors to give
    // calling code better visibility into why session restoration failed.
    const session = await this.config.oauthClient.restore(did);

    if (session) {
      this.logger.log(`OAuth session restored successfully for DID: ${did}`);
    } else {
      this.logger.log(`OAuth session not found for DID: ${did}`);
    }

    return session;
  }

  /**
   * Get OAuth session from a raw Request object by extracting and validating the session cookie
   *
   * This is a convenience method that:
   * 1. Extracts the session cookie from request headers
   * 2. Unseals the iron-session cookie to get the DID
   * 3. Calls getOAuthSession() to restore the session with automatic token refresh
   *
   * Use this when you have a raw Request object (e.g., from c.req.raw) and need to
   * authenticate the user without first getting a Hono Context.
   *
   * @param req - The HTTP request containing the session cookie
   * @returns Promise resolving to OAuth session, or null if session is invalid/expired
   * @throws Same errors as getOAuthSession() (SessionNotFoundError, RefreshTokenExpiredError, etc.)
   *
   * @example
   * ```ts
   * // In a Hono route handler
   * app.get('/api/bookmarks', async (c) => {
   *   const oauthSession = await sessions.getOAuthSessionFromRequest(c.req.raw);
   *   if (!oauthSession) {
   *     return c.json({ error: 'Authentication required' }, 401);
   *   }
   *   // Use oauthSession.makeRequest() for authenticated API calls
   * });
   * ```
   */
  async getOAuthSessionFromRequest(req: Request): Promise<SessionInterface | null> {
    try {
      // Extract session cookie
      const cookieHeader = req.headers.get("cookie");
      if (!cookieHeader?.includes(`${this.config.cookieName}=`)) {
        return null;
      }

      // Parse cookie properly to handle '=' in values
      const cookies = cookieHeader.split(";").map((c) => c.trim());
      const cookiePrefix = `${this.config.cookieName}=`;
      const sessionCookie = cookies
        .find((c) => c.startsWith(cookiePrefix))
        ?.substring(cookiePrefix.length);

      if (!sessionCookie) {
        return null;
      }

      // Unseal session data to get DID
      const sessionData = await unsealData(decodeURIComponent(sessionCookie), {
        password: this.config.cookieSecret,
      }) as SessionData;

      const userDid = sessionData?.did;
      if (!userDid) {
        this.logger.error("No DID found in session data:", sessionData);
        return null;
      }

      // Get OAuth session (with automatic token refresh)
      return await this.getOAuthSession(userDid);
    } catch (error) {
      this.logger.error("Failed to get OAuth session from request:", error);
      return null;
    }
  }

  /**
   * Get a Set-Cookie header that clears the session cookie
   *
   * Use this when you need to log out a user or clear an invalid session.
   * The returned header string can be set directly in a Response.
   *
   * @returns Set-Cookie header string to clear the session cookie
   *
   * @example
   * ```ts
   * // In a route handler when session is invalid
   * const response = c.json({ error: 'Session expired' }, 401);
   * response.headers.set('Set-Cookie', sessions.getClearCookieHeader());
   * return response;
   * ```
   */
  getClearCookieHeader(): string {
    return `${this.config.cookieName}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
  }
}
