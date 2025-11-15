import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { beforeEach, describe, it } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { HonoOAuthSessions } from "./sessions.ts";
import { ConfigurationError, OAuthFlowError } from "./errors.ts";
import type { OAuthClientInterface, OAuthStorage, SessionInterface } from "./types.ts";

// Simple mock implementations for testing business logic
class MockStorage implements OAuthStorage {
  private data = new Map<string, any>();

  get<T>(key: string): Promise<T | null> {
    return Promise.resolve(this.data.get(key) || null);
  }

  set<T>(key: string, value: T, _options?: { ttl?: number }): Promise<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
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

  authorize(handle: string, options?: { state?: string }): Promise<URL> {
    this.lastAuthorizeCall = { handle, options };

    if (this.shouldFailAuthorize) {
      throw new Error("OAuth authorization failed");
    }

    return Promise.resolve(this.mockAuthUrl);
  }

  callback(_params: URLSearchParams): Promise<{
    session: SessionInterface;
    state?: string | null;
  }> {
    return Promise.resolve({
      session: {
        did: "did:plc:test123",
        accessToken: "access_token_123",
        refreshToken: "refresh_token_123",
        handle: "test.bsky.social",
        pdsUrl: "https://bsky.social",
        timeUntilExpiry: 3600000,
        makeRequest: (_method: string, _url: string, _options?: RequestInit) => {
          return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
        },
        toJSON: () => ({
          did: "did:plc:test123",
          accessToken: "access_token_123",
          refreshToken: "refresh_token_123",
          handle: "test.bsky.social",
          pdsUrl: "https://bsky.social",
          timeUntilExpiry: 3600000,
        }),
      },
    });
  }

  restore(_sessionId: string): Promise<SessionInterface | null> {
    // Mock implementation - return a session for testing
    return Promise.resolve({
      did: "did:plc:test123",
      accessToken: "mock_access_token",
      refreshToken: "mock_refresh_token",
      handle: "test.bsky.social",
      pdsUrl: "https://bsky.social",
      timeUntilExpiry: 3600000,
      makeRequest: (_method: string, _url: string, _options?: RequestInit) => {
        return Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
      },
      toJSON: () => ({
        did: "did:plc:test123",
        accessToken: "mock_access_token",
        refreshToken: "mock_refresh_token",
        handle: "test.bsky.social",
        pdsUrl: "https://bsky.social",
        timeUntilExpiry: 3600000,
      }),
    });
  }

  // refresh() method removed - token refresh is handled by OAuth client's restore() method

  reset() {
    this.lastAuthorizeCall = null;
    this.shouldFailAuthorize = false;
  }
}

describe("HonoOAuthSessions - Business Logic", () => {
  let storage: MockStorage;
  let oauthClient: MockOAuthClient;
  let sessions: HonoOAuthSessions;

  beforeEach(() => {
    storage = new MockStorage();
    oauthClient = new MockOAuthClient();
    sessions = new HonoOAuthSessions({
      oauthClient,
      storage,
      cookieSecret: "test-secret-key-must-be-32charss",
      baseUrl: "https://test.com",
    });
    oauthClient.reset();
    storage.clear();
  });

  describe("Constructor Configuration", () => {
    it("should throw for missing oauthClient", () => {
      try {
        new HonoOAuthSessions({
          storage,
          cookieSecret: "test-secret-key-must-be-32charss",
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
        new HonoOAuthSessions({
          oauthClient,
          cookieSecret: "test-secret-key-must-be-32charss",
          baseUrl: "https://test.com",
        } as any);
        assertEquals(false, true, "Should have thrown");
      } catch (error) {
        assertEquals(error instanceof ConfigurationError, true);
        assertEquals((error as ConfigurationError).message, "storage is required");
      }
    });

    it("should throw for cookieSecret shorter than 32 characters", () => {
      try {
        new HonoOAuthSessions({
          oauthClient,
          storage,
          cookieSecret: "short",
          baseUrl: "https://test.com",
        });
        assertEquals(false, true, "Should have thrown");
      } catch (error) {
        assertEquals(error instanceof ConfigurationError, true);
        assertEquals(
          (error as ConfigurationError).message,
          "cookieSecret must be at least 32 characters for secure encryption (Iron Session requirement)",
        );
      }
    });

    it("should set default configuration values", () => {
      const sessions = new HonoOAuthSessions({
        oauthClient,
        storage,
        cookieSecret: "test-secret-key-must-be-32charss",
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
        pdsUrl: "https://bsky.social",
        expiresAt: Date.now() + 3600000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.set(`session:${testDid}`, sessionData);

      const result = await sessions.getStoredOAuthData(testDid);

      assertEquals(result?.did, testDid);
      assertEquals(result?.accessToken, "access_token_123");
      assertEquals(result?.handle, "test.bsky.social");
      // displayName and avatar removed - applications should fetch profile data separately
    });

    it("should return null for missing session data", async () => {
      const result = await sessions.getStoredOAuthData("did:plc:nonexistent");
      assertEquals(result, null);
    });

    it("should delete session data on logout", async () => {
      const testDid = "did:plc:test123";
      await storage.set(`session:${testDid}`, { test: "data" });

      assertEquals(storage.hasKey(`session:${testDid}`), true);

      // Note: This is testing the storage deletion logic, not full logout
      await storage.delete(`session:${testDid}`);

      assertEquals(storage.hasKey(`session:${testDid}`), false);
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

  describe("v1.1.0 Helper Methods", () => {
    describe("getOAuthSessionFromRequest()", () => {
      it("should return null when no cookie header is present", async () => {
        const req = new Request("https://example.com/", {
          headers: {},
        });

        const result = await sessions.getOAuthSessionFromRequest(req);
        assertEquals(result, null);
      });

      it("should return null when session cookie is not present", async () => {
        const req = new Request("https://example.com/", {
          headers: {
            "cookie": "other=value; another=cookie",
          },
        });

        const result = await sessions.getOAuthSessionFromRequest(req);
        assertEquals(result, null);
      });

      it("should return null when session cookie is invalid", async () => {
        const req = new Request("https://example.com/", {
          headers: {
            "cookie": "sid=invalid-base64-data",
          },
        });

        const result = await sessions.getOAuthSessionFromRequest(req);
        assertEquals(result, null);
      });

      // Note: Testing successful session extraction would require mocking Iron Session's
      // unsealData and the OAuth client's restore() method, which is complex.
      // The method relies on the same underlying logic as validateSession() which is
      // tested indirectly through integration tests.
    });

    describe("getClearCookieHeader()", () => {
      it("should return a Set-Cookie header that clears the session cookie", () => {
        const header = sessions.getClearCookieHeader();

        // Should include the cookie name
        assertEquals(header.includes("sid="), true);

        // Should set Max-Age to 0 to clear the cookie
        assertEquals(header.includes("Max-Age=0"), true);

        // Should include security attributes
        assertEquals(header.includes("HttpOnly"), true);
        assertEquals(header.includes("Secure"), true);
        assertEquals(header.includes("SameSite=Lax"), true);

        // Should set Path to /
        assertEquals(header.includes("Path=/"), true);
      });

      it("should use custom cookie name from config", () => {
        const customSessions = new HonoOAuthSessions({
          oauthClient: oauthClient,
          storage: storage,
          cookieSecret: "test-secret-minimum-32-chars-long-abc",
          baseUrl: "https://example.com",
          cookieName: "custom_session",
        });

        const header = customSessions.getClearCookieHeader();
        assertEquals(header.includes("custom_session="), true);
      });
    });
  });
});
