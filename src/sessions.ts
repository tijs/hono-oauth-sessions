import { Context } from "https://esm.sh/hono";
import { getIronSession, sealData, unsealData } from "npm:iron-session@8.0.4";
import { isValidHandle } from "npm:@atproto/syntax@0.4.0";

import { ValTownStorage } from "./storage.ts";
import type { RefreshResult, SessionData, ValidationResult, ValTownOAuthConfig } from "./types.ts";
import {
  ConfigurationError,
  MobileIntegrationError,
  OAuthFlowError,
  SessionError,
} from "./errors.ts";

/**
 * Val Town optimized OAuth session manager
 *
 * Provides complete OAuth flow management with Iron Session integration,
 * mobile app support, and automatic token refresh.
 */
export class ValTownOAuthSessions {
  private readonly config: Required<ValTownOAuthConfig>;
  private readonly storage: ValTownStorage;

  constructor(config: ValTownOAuthConfig, sqlite?: any) {
    // Validate required config
    if (!config.oauthClient) {
      throw new ConfigurationError("oauthClient is required");
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
      mobileUserAgents: ["AnchorApp", "iPhone", "iPad", "Mobile"],
      autoCleanup: true,
      ...config,
    };

    // Initialize storage with provided sqlite instance or expect it to be passed later
    if (sqlite) {
      this.storage = new ValTownStorage(sqlite);
    } else {
      // Will be initialized when methods are called if sqlite is available globally
      // This allows flexibility for different Val Town setups
      this.storage = new ValTownStorage(null as any);
    }
  }

  /**
   * Update the SQLite instance (useful for delayed initialization)
   */
  updateSQLite(sqlite: any): void {
    (this.storage as any).sqlite = sqlite;
  }

  // Mobile request detection removed - can be re-added if needed

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

      // Store OAuth session data
      await this.storage.setOAuthSession(did, {
        accessToken: oauthSession.accessToken,
        refreshToken: oauthSession.refreshToken,
        handle: oauthSession.handle,
        // Extract additional data if available on the session
        expiresAt: oauthSession.timeUntilExpiry
          ? Date.now() + oauthSession.timeUntilExpiry
          : undefined,
      });

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
   * Validate session and return user info
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
      const oauthData = await this.storage.getOAuthSession(session.did);
      if (!oauthData) {
        // Clean up invalid session
        await session.destroy();
        return { valid: false };
      }

      // Cleanup if enabled
      if (this.config.autoCleanup) {
        await this.storage.cleanup();
      }

      return {
        valid: true,
        did: session.did,
        handle: oauthData.handle,
        displayName: oauthData.displayName,
        // TODO: Return OAuth session if needed for API calls
      };
    } catch (error) {
      throw new SessionError(
        `Session validation failed: ${error instanceof Error ? error.message : String(error)}`,
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
      const oauthData = await this.storage.getOAuthSession(sessionData.did);
      if (!oauthData) {
        return {
          success: false,
          error: "OAuth session not found",
        };
      }

      try {
        // Try to refresh tokens if the session supports it
        // This depends on the OAuth client implementation
        let refreshedData = oauthData;

        // Check if we have a refresh method available
        // This would be provided by clients that support token refresh
        if (oauthData.refreshToken && typeof (oauthData as any).refresh === "function") {
          try {
            const refreshedSession = await (oauthData as any).refresh();
            refreshedData = {
              ...oauthData,
              accessToken: refreshedSession.accessToken,
              refreshToken: refreshedSession.refreshToken,
              expiresAt: refreshedSession.timeUntilExpiry
                ? Date.now() + refreshedSession.timeUntilExpiry
                : oauthData.expiresAt,
            };

            // Update stored session
            await this.storage.setOAuthSession(sessionData.did, refreshedData);
          } catch {
            // Refresh failed, use existing tokens
          }
        }

        const newSealedToken = await sealData(
          { did: sessionData.did },
          { password: this.config.cookieSecret },
        );

        return {
          success: true,
          sessionToken: newSealedToken,
          did: sessionData.did,
          accessToken: refreshedData.accessToken,
          refreshToken: refreshedData.refreshToken,
          expiresAt: refreshedData.expiresAt,
        };
      } catch (_refreshError) {
        // Fallback to cached tokens
        const newSealedToken = await sealData(
          { did: sessionData.did },
          { password: this.config.cookieSecret },
        );

        return {
          success: true,
          sessionToken: newSealedToken,
          did: sessionData.did,
          error: "Token refresh failed, using cached tokens",
        };
      }
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
        await this.storage.deleteOAuthSession(session.did);
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
  async getStoredOAuthData(did: string): Promise<
    {
      accessToken: string;
      refreshToken?: string;
      handle?: string;
      displayName?: string;
      avatar?: string;
      pdsUrl?: string;
      expiresAt?: number;
    } | null
  > {
    try {
      return await this.storage.getOAuthSession(did);
    } catch (error) {
      throw new SessionError(
        `Failed to get OAuth session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Manual cleanup of expired sessions
   */
  async cleanup(): Promise<void> {
    await this.storage.cleanup();
  }
}
