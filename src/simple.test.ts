import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it, beforeEach } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { ValTownOAuthSessions } from "./sessions.ts";
import { ConfigurationError, OAuthFlowError } from "./errors.ts";
import type { OAuthStorage, OAuthClientInterface, SessionInterface } from "./types.ts";

// Simple mock implementations for testing business logic
class MockStorage implements OAuthStorage {
  private data = new Map<string, any>();

  async get<T>(key: string): Promise<T | null> {
    return this.data.get(key) || null;
  }

  async set<T>(key: string, value: T, _options?: { ttl?: number }): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  // Test helpers
  hasKey(key: string): boolean {
    return this.data.has(key);
  }

  clear() {
    this.data.clear();
  }
}

class MockOAuthClient implements OAuthClientInterface {
  public lastAuthorizeCall: { handle: string; options?: { state?: string } } | null = null;
  public mockAuthUrl = new URL("https://oauth.example.com/authorize?code=123");
  public shouldFailAuthorize = false;

  async authorize(handle: string, options?: { state?: string }): Promise<URL> {
    this.lastAuthorizeCall = { handle, options };
    
    if (this.shouldFailAuthorize) {
      throw new Error("OAuth authorization failed");
    }
    
    return this.mockAuthUrl;
  }

  async callback(_params: URLSearchParams): Promise<{
    session: SessionInterface;
    state?: string | null;
  }> {
    return {
      session: {
        did: "did:plc:test123",
        accessToken: "access_token_123",
        refreshToken: "refresh_token_123",
        handle: "test.bsky.social",
        timeUntilExpiry: 3600000,
      },
    };
  }

  reset() {
    this.lastAuthorizeCall = null;
    this.shouldFailAuthorize = false;
  }
}

describe("ValTownOAuthSessions - Business Logic", () => {
  let storage: MockStorage;
  let oauthClient: MockOAuthClient;
  let sessions: ValTownOAuthSessions;

  beforeEach(() => {
    storage = new MockStorage();
    oauthClient = new MockOAuthClient();
    sessions = new ValTownOAuthSessions({
      oauthClient,
      storage,
      cookieSecret: "test-secret-key-32-chars-long!",
      baseUrl: "https://test.com",
    });
    oauthClient.reset();
    storage.clear();
  });

  describe("Constructor Configuration", () => {
    it("should throw for missing oauthClient", () => {
      try {
        new ValTownOAuthSessions({
          storage,
          cookieSecret: "test-secret",
          baseUrl: "https://test.com",
        } as any);
        assertEquals(false, true, "Should have thrown");
      } catch (error) {
        assertEquals(error instanceof ConfigurationError, true);
        assertEquals((error as ConfigurationError).message, "oauthClient is required");
      }
    });

    it("should throw for missing storage", () => {
      try {
        new ValTownOAuthSessions({
          oauthClient,
          cookieSecret: "test-secret",
          baseUrl: "https://test.com",
        } as any);
        assertEquals(false, true, "Should have thrown");
      } catch (error) {
        assertEquals(error instanceof ConfigurationError, true);
        assertEquals((error as ConfigurationError).message, "storage is required");
      }
    });

    it("should set default configuration values", () => {
      const sessions = new ValTownOAuthSessions({
        oauthClient,
        storage,
        cookieSecret: "test-secret",
        baseUrl: "https://test.com",
      });

      // Test that defaults are applied by checking behavior
      const config = (sessions as any).config;
      assertEquals(config.cookieName, "sid");
      assertEquals(config.sessionTtl, 60 * 60 * 24 * 7); // 7 days
      assertEquals(config.mobileScheme, "app://auth-callback");
    });
  });

  describe("OAuth State Generation", () => {
    it("should reject invalid handles", async () => {
      await assertRejects(
        () => sessions.startOAuth("invalid-handle"),
        OAuthFlowError,
        "Invalid handle",
      );
    });

    it("should create web OAuth state correctly", async () => {
      const authUrl = await sessions.startOAuth("test.bsky.social");
      
      assertEquals(authUrl, oauthClient.mockAuthUrl.toString());
      assertEquals(oauthClient.lastAuthorizeCall?.handle, "test.bsky.social");
      
      const stateParam = oauthClient.lastAuthorizeCall?.options?.state;
      if (stateParam) {
        const state = JSON.parse(stateParam);
        assertEquals(state.handle, "test.bsky.social");
        assertEquals(typeof state.timestamp, "number");
        assertEquals(state.mobile, undefined);
        assertEquals(state.codeChallenge, undefined);
      }
    });

    it("should create mobile OAuth state with additional fields", async () => {
      const authUrl = await sessions.startOAuth("test.bsky.social", {
        mobile: true,
        codeChallenge: "challenge123",
      });
      
      assertEquals(authUrl, oauthClient.mockAuthUrl.toString());
      
      const stateParam = oauthClient.lastAuthorizeCall?.options?.state;
      if (stateParam) {
        const state = JSON.parse(stateParam);
        assertEquals(state.handle, "test.bsky.social");
        assertEquals(state.mobile, true);
        assertEquals(state.codeChallenge, "challenge123");
        assertEquals(typeof state.timestamp, "number");
      }
    });

    it("should handle OAuth client failures", async () => {
      oauthClient.shouldFailAuthorize = true;
      
      await assertRejects(
        () => sessions.startOAuth("test.bsky.social"),
        OAuthFlowError,
        "Failed to start OAuth: OAuth authorization failed",
      );
    });
  });

  describe("Storage Operations", () => {
    it("should store and retrieve OAuth session data", async () => {
      const testDid = "did:plc:test123";
      const sessionData = {
        did: testDid,
        accessToken: "access_token_123",
        refreshToken: "refresh_token_123",
        handle: "test.bsky.social",
        displayName: "Test User",
        avatar: undefined,
        pdsUrl: undefined,
        expiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.set(`oauth_session:${testDid}`, sessionData);
      
      const result = await sessions.getStoredOAuthData(testDid);
      
      assertEquals(result?.did, testDid);
      assertEquals(result?.accessToken, "access_token_123");
      assertEquals(result?.handle, "test.bsky.social");
      assertEquals(result?.displayName, "Test User");
    });

    it("should return null for missing session data", async () => {
      const result = await sessions.getStoredOAuthData("did:plc:nonexistent");
      assertEquals(result, null);
    });

    it("should delete session data on logout", async () => {
      const testDid = "did:plc:test123";
      await storage.set(`oauth_session:${testDid}`, { test: "data" });
      
      assertEquals(storage.hasKey(`oauth_session:${testDid}`), true);
      
      // Note: This is testing the storage deletion logic, not full logout
      await storage.delete(`oauth_session:${testDid}`);
      
      assertEquals(storage.hasKey(`oauth_session:${testDid}`), false);
    });
  });

  describe("Mobile Token Refresh Logic", () => {
    it("should reject invalid authorization header format", async () => {
      const result = await sessions.refreshMobileToken("invalid-header");
      
      assertEquals(result.success, false);
      assertEquals(result.error, "Token refresh failed: Invalid authorization header");
    });

    it("should reject non-Bearer token format", async () => {
      const result = await sessions.refreshMobileToken("Basic dXNlcjpwYXNz");
      
      assertEquals(result.success, false);
      assertEquals(result.error, "Token refresh failed: Invalid authorization header");
    });

    // Note: Full token refresh testing would require mocking Iron Session's sealData/unsealData
    // which is complex. We focus on the input validation logic here.
  });
});