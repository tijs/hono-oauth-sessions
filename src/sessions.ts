import { Context } from "@hono/hono";
import { getIronSession, sealData, unsealData } from "iron-session";
import { isValidHandle } from "@atproto/syntax";

import type {
  HonoOAuthConfig,
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

/**
 * Hono OAuth session manager
 *
 * Provides complete OAuth flow management with Iron Session integration,
 * mobile app support, and automatic token refresh.
 */
export class HonoOAuthSessions {
  private readonly config: Required<HonoOAuthConfig>;
  private readonly storage: OAuthStorage;

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
    if (!config.baseUrl) {
      throw new ConfigurationError("baseUrl is required");
    }

    // Set defaults
    this.config = {
      cookieName: "sid",
      sessionTtl: 60 * 60 * 24 * 7, // 7 days
      mobileScheme: "app://auth-callback",
      ...config,
    } as Required<HonoOAuthConfig>;

    this.storage = config.storage;
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
    options?: { mobile?: boolean; codeChallenge?: string },
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

      // Store complete OAuth session data including DPoP keys
      const completeSessionData = oauthSession.toJSON();
      await this.storage.set(`session:${did}`, completeSessionData);

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

      // Web callback - redirect to home
      return c.redirect("/");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.text(`OAuth callback failed: ${message}`, 400);
    }
  }

  /**
   * Validate session and return user info with automatic token refresh
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

      // Check if tokens need refreshing and refresh them automatically
      try {
        // Check if token is expired (within 5 minutes of expiry)
        const isExpired = oauthData.expiresAt &&
          (Date.now() + (5 * 60 * 1000) >= oauthData.expiresAt);

        if (isExpired && oauthData.refreshToken && (this.config.oauthClient as any).refresh) {
          console.log("Token is expired, refreshing for user:", session.did);

          // Create a session-like object that matches SessionInterface
          const sessionForRefresh = {
            did: oauthData.did,
            accessToken: oauthData.accessToken,
            refreshToken: oauthData.refreshToken,
            handle: oauthData.handle,
            timeUntilExpiry: oauthData.expiresAt
              ? Math.max(0, oauthData.expiresAt - Date.now())
              : 0,
            // Add toJSON method if needed by the OAuth client
            toJSON: () => ({
              did: oauthData.did,
              accessToken: oauthData.accessToken,
              refreshToken: oauthData.refreshToken,
              handle: oauthData.handle,
              dpopPrivateKeyJWK: {},
              dpopPublicKeyJWK: {},
              pdsUrl: oauthData.pdsUrl || "",
              tokenExpiresAt: oauthData.expiresAt || Date.now() + (60 * 60 * 1000),
            }),
          };

          // Use the OAuth client's refresh method if available
          const refreshedSession = await (this.config.oauthClient as any).refresh(
            sessionForRefresh,
          );

          // Update stored session with new tokens
          const updatedSessionData: StoredOAuthSession = {
            ...oauthData,
            accessToken: refreshedSession.accessToken,
            refreshToken: refreshedSession.refreshToken || oauthData.refreshToken,
            expiresAt: refreshedSession.timeUntilExpiry
              ? Date.now() + refreshedSession.timeUntilExpiry
              : undefined,
            updatedAt: Date.now(),
          };

          await this.storage.set(`session:${session.did}`, updatedSessionData);
          console.log("Token refresh successful for user:", session.did);
        }
      } catch (refreshError) {
        console.error("Token refresh failed during session validation:", refreshError);
        // Don't fail the session validation if refresh fails - let the client handle it
        // The session might still be usable for a short time
      }

      return {
        valid: true,
        did: session.did,
        handle: oauthData.handle,
        displayName: oauthData.displayName,
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
        displayName: oauthData.displayName,
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
      if ((this.config.oauthClient as any).restore) {
        try {
          const oauthSession = await (this.config.oauthClient as any).restore(sessionData.did);
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
          console.log("OAuth restore failed during refresh, falling back:", restoreError);
        }
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
   * @param did - User's DID to restore session for
   * @returns Promise resolving to OAuth session, or null if not found
   * @example
   * ```ts
   * const oauthSession = await sessions.getOAuthSession(userDid);
   * if (oauthSession) {
   *   const response = await oauthSession.fetch('/xrpc/com.atproto.repo.listRecords');
   * }
   * ```
   */
  async getOAuthSession(did: string): Promise<SessionInterface | null> {
    try {
      // Use the OAuth client's restore method now that storage keys align
      return await this.config.oauthClient.restore(did);
    } catch (error) {
      console.error(`Failed to restore OAuth session for ${did}:`, error);
      return null;
    }
  }
}
