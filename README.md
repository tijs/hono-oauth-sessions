# @tijs/hono-oauth-sessions

[![Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/tijsteulings)

Storage-agnostic OAuth session management for AT Protocol applications. **Bring your own OAuth client and storage** - requires specific interfaces (see documentation).

## Features

- 🔐 **OAuth Flow Management** - Authorization code flow with PKCE support
- 🔌 **Bring Your Own OAuth Client** - Requires specific interface (see OAuthClientInterface)
- 🗄️ **Bring Your Own Storage** - Implements simple key-value storage interface
- 📱 **Mobile App Support** - Generates mobile callback URLs with encrypted tokens
- 🍪 **Iron Session Cookies** - Secure session persistence with automatic expiration
- 🔄 **Token Refresh Support** - Mobile token refresh when OAuth client supports it
- 🎯 **Hono Integration** - Built for Hono web framework with Context-based API

## Installation

```bash
deno add @tijs/hono-oauth-sessions
```

## Quick Start

```typescript
import { Hono } from "jsr:@hono/hono@^4.9.6";
import { OAuthClient } from "jsr:@tijs/oauth-client-deno@1.0.1";
import { HonoOAuthSessions } from "jsr:@tijs/hono-oauth-sessions";

const app = new Hono();

// Create your storage implementation
const storage = {
  async get<T>(key: string): Promise<T | null> {
    // Your storage get logic (SQLite, Redis, etc.)
    return null; // Replace with actual implementation
  },

  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    // Your storage set logic with optional TTL
  },

  async delete(key: string): Promise<void> {
    // Your storage delete logic
  },
};

// Set up OAuth client with the same storage
const oauthClient = new OAuthClient({
  clientId: "https://myapp.com/client-metadata.json",
  redirectUri: "https://myapp.com/oauth/callback",
  storage, // Same storage instance
});

// Set up session manager
const sessions = new HonoOAuthSessions({
  oauthClient,
  storage, // Same storage instance
  cookieSecret: Deno.env.get("COOKIE_SECRET")!,
  baseUrl: "https://myapp.com",
});

// OAuth routes
app.get("/login", async (c) => {
  const handle = c.req.query("handle");
  if (!handle) return c.text("Missing handle", 400);

  const authUrl = await sessions.startOAuth(handle);
  return c.redirect(authUrl.toString());
});

app.get("/oauth/callback", async (c) => {
  return await sessions.handleCallback(c);
});

app.get("/api/session", async (c) => {
  const result = await sessions.validateSession(c);
  return c.json(result);
});

app.post("/api/logout", async (c) => {
  await sessions.logout(c);
  return c.json({ success: true });
});

export default app;
```

## Session TTL Configuration

The session TTL (time-to-live) determines how long users stay logged in. The default is 7 days, but you can customize this:

```typescript
// Short session (1 hour) - good for sensitive applications
const sessions = new HonoOAuthSessions({
  oauthClient,
  storage,
  cookieSecret: Deno.env.get("COOKIE_SECRET")!,
  baseUrl: "https://myapp.com",
  sessionTtl: 60 * 60, // 1 hour
});

// Extended session (30 days) - good for convenience
const sessions = new HonoOAuthSessions({
  oauthClient,
  storage,
  cookieSecret: Deno.env.get("COOKIE_SECRET")!,
  baseUrl: "https://myapp.com",
  sessionTtl: 60 * 60 * 24 * 30, // 30 days
});

// Custom session (12 hours)
const sessions = new HonoOAuthSessions({
  oauthClient,
  storage,
  cookieSecret: Deno.env.get("COOKIE_SECRET")!,
  baseUrl: "https://myapp.com",
  sessionTtl: 60 * 60 * 12, // 12 hours
});
```

## Logging and Debugging

By default, the library uses a no-op logger (no output). You can enable logging for debugging or monitoring:

```typescript
// Use console logging
const sessions = new HonoOAuthSessions({
  oauthClient,
  storage,
  cookieSecret: Deno.env.get("COOKIE_SECRET")!,
  baseUrl: "https://myapp.com",
  logger: console, // Enable console logging
});

// Use custom logger
const sessions = new HonoOAuthSessions({
  oauthClient,
  storage,
  cookieSecret: Deno.env.get("COOKIE_SECRET")!,
  baseUrl: "https://myapp.com",
  logger: {
    log: (...args) => myLogger.debug(...args),
    warn: (...args) => myLogger.warn(...args),
    error: (...args) => myLogger.error(...args),
  },
});
```

The logger will output:
- OAuth flow progress (profile fetching, token refresh)
- Session validation and restoration
- Configuration warnings (e.g., invalid redirect paths)
- Error details during OAuth callbacks and session management

## Storage Implementations

### Val Town SQLite Storage

```typescript
import { sqlite } from "https://esm.town/v/std/sqlite2";

class ValTownSQLiteStorage {
  private initialized = false;

  async init() {
    if (this.initialized) return;

    await sqlite.execute({
      sql: `CREATE TABLE IF NOT EXISTS oauth_storage (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at INTEGER,
        created_at INTEGER DEFAULT (unixepoch() * 1000)
      )`,
      args: [],
    });

    this.initialized = true;
  }

  async get<T>(key: string): Promise<T | null> {
    await this.init();

    const now = Date.now();
    const result = await sqlite.execute({
      sql:
        "SELECT value FROM oauth_storage WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)",
      args: [key, now],
    });

    if (result.rows.length === 0) return null;

    try {
      return JSON.parse(result.rows[0][0] as string) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    await this.init();

    const expiresAt = options?.ttl ? Date.now() + (options.ttl * 1000) : null;

    await sqlite.execute({
      sql: "INSERT OR REPLACE INTO oauth_storage (key, value, expires_at) VALUES (?, ?, ?)",
      args: [key, JSON.stringify(value), expiresAt],
    });
  }

  async delete(key: string): Promise<void> {
    await this.init();

    await sqlite.execute({
      sql: "DELETE FROM oauth_storage WHERE key = ?",
      args: [key],
    });
  }
}

const storage = new ValTownSQLiteStorage();
```

### Redis Storage

```typescript
class RedisStorage {
  constructor(private redis: any) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    const serialized = JSON.stringify(value);
    if (options?.ttl) {
      await this.redis.setex(key, options.ttl, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
```

### Memory Storage

```typescript
class MemoryStorage {
  private data = new Map<string, { value: any; expiresAt?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.data.get(key);
    if (!entry) return null;

    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }

    return entry.value;
  }

  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    const entry: any = { value };
    if (options?.ttl) {
      entry.expiresAt = Date.now() + (options.ttl * 1000);
    }
    this.data.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}
```

## Storage Cleanup

The session manager doesn't provide automatic cleanup functionality. Instead, implement cleanup in your storage layer:

### TTL-based Cleanup (Recommended)

Most storage backends support TTL natively:

- **Redis**: Automatic expiration with `SETEX`
- **Val Town SQLite**: Use TTL in queries (see example above)
- **Memory**: Check expiration on access (see example above)

### Manual Cleanup Jobs

For storage backends without TTL support, run periodic cleanup:

```typescript
// Example cleanup job for SQLite
async function cleanupExpiredSessions() {
  const now = Date.now();
  await sqlite.execute({
    sql: "DELETE FROM oauth_storage WHERE expires_at IS NOT NULL AND expires_at <= ?",
    args: [now],
  });
}

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);
```

### Storage Key Patterns

The session manager uses these key patterns:

- `session:{did}` - OAuth session data for users (compatible with oauth-client-deno)
- OAuth clients may use different patterns for state/PKCE data

Consider implementing pattern-based cleanup if needed:

```typescript
// Example: Clean all session keys
async function cleanupAllSessions() {
  // Implementation depends on your storage backend
  // Some support pattern deletion, others require key enumeration
}
```

## Using with Different OAuth Clients

### With @tijs/oauth-client-deno

```typescript
import { OAuthClient } from "jsr:@tijs/oauth-client-deno@1.0.0";

const oauthClient = new OAuthClient({
  clientId: "https://myapp.com/client-metadata.json",
  redirectUri: "https://myapp.com/oauth/callback",
  storage, // Your storage implementation
});
```

### With @atproto/oauth-client-node

```typescript
import { NodeOAuthClient } from "@atproto/oauth-client-node";

const oauthClient = new NodeOAuthClient({
  clientMetadata: {
    client_id: "https://myapp.com/client-metadata.json",
    redirect_uris: ["https://myapp.com/oauth/callback"],
  },
  stateStore: storage, // Your storage for state
  sessionStore: storage, // Your storage for sessions (can be different)
});
```

### With Custom OAuth Client

```typescript
import { type OAuthClientInterface, type SessionInterface } from "jsr:@tijs/hono-oauth-sessions";

class MyCustomOAuthClient implements OAuthClientInterface {
  async authorize(handle: string, options?: { state?: string }): Promise<URL> {
    // Your OAuth authorization logic
    return new URL("https://authorization-server.com/oauth/authorize");
  }

  async callback(params: URLSearchParams): Promise<{
    session: SessionInterface;
    state?: string | null;
  }> {
    // Your OAuth callback logic
    const session: SessionInterface = {
      did: "did:plc:example",
      accessToken: "access_token_here",
      refreshToken: "refresh_token_here",
      handle: "user.bsky.social",
    };

    return { session, state: params.get("state") };
  }
}
```

## Mobile App Integration

### Starting Mobile OAuth Flow

```typescript
app.post("/api/auth/mobile-start", async (c) => {
  const { handle, code_challenge } = await c.req.json();

  const authUrl = await sessions.startOAuth(handle, {
    mobile: true,
    codeChallenge: code_challenge,
  });

  return c.json({ authUrl: authUrl.toString() });
});
```

### Mobile Token Refresh

```typescript
app.get("/mobile/refresh-token", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) return c.json({ error: "Missing authorization" }, 401);

  const result = await sessions.refreshMobileToken(authHeader);
  return c.json(result);
});
```

## Configuration Options

```typescript
interface HonoOAuthConfig {
  /** OAuth client instance - bring your own! */
  oauthClient: OAuthClientInterface;

  /** Storage instance for OAuth session data */
  storage: OAuthStorage;

  /** Secret for Iron Session encryption (minimum 32 characters required) */
  cookieSecret: string;

  /** Base URL of your application */
  baseUrl: string;

  /** Cookie name (default: "sid") */
  cookieName?: string;

  /**
   * Session TTL in seconds (default: 7 days / 604800 seconds)
   * Controls how long users stay logged in before needing to re-authenticate.
   * Common values: 3600 (1h), 86400 (1d), 604800 (7d), 2592000 (30d)
   */
  sessionTtl?: number;

  /** Mobile URL scheme (default: "app://auth-callback") */
  mobileScheme?: string;

  /**
   * Optional logger for debugging and monitoring (default: no-op logger)
   * Pass console for standard console logging or provide a custom logger.
   * Example: logger: console or logger: { log: (...args) => {}, warn: (...args) => {}, error: (...args) => {} }
   */
  logger?: Logger;
}
```

## OAuth Storage Interface

To create your own storage implementation:

```typescript
interface OAuthStorage {
  /** Retrieve a value from storage */
  get<T = unknown>(key: string): Promise<T | null>;

  /** Store a value in storage with optional TTL */
  set<T = unknown>(key: string, value: T, options?: { ttl?: number }): Promise<void>;

  /** Delete a value from storage */
  delete(key: string): Promise<void>;
}
```

## Custom OAuth Client Implementation

If you're implementing your own OAuth client, you need to implement the `OAuthClientInterface`:

```typescript
interface OAuthClientInterface {
  /** Start OAuth authorization flow */
  authorize(handle: string, options?: { state?: string }): Promise<URL>;

  /** Handle OAuth callback and exchange code for tokens */
  callback(params: URLSearchParams): Promise<{
    session: SessionInterface;
    state?: string | null;
  }>;

  /** Restore a session from storage by session ID */
  restore(sessionId: string): Promise<SessionInterface | null>;

  /** Refresh an expired session (optional) */
  refresh?(tokens: RefreshTokenData): Promise<SessionInterface>;
}
```

### Token Refresh Interface (v1.2.0+)

If your OAuth client supports token refresh, implement the optional `refresh()` method. It accepts `RefreshTokenData` instead of a full `SessionInterface`, providing an honest representation of what's needed for token refresh:

```typescript
interface RefreshTokenData {
  did: string;
  accessToken: string;
  refreshToken: string;
  handle?: string;
  pdsUrl: string;
  expiresAt?: number;
}
```

**Example implementation:**
```typescript
class MyOAuthClient implements OAuthClientInterface {
  // ... other methods ...

  async refresh(tokens: RefreshTokenData): Promise<SessionInterface> {
    // Use tokens.refreshToken to get new access token from OAuth server
    const response = await fetch('https://oauth-server/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: this.clientId,
      }),
    });

    const data = await response.json();

    // Return new session with refreshed tokens
    return this.createSession(tokens.did, data.access_token, data.refresh_token);
  }
}
```

**Breaking Change (v1.2.0):** The `refresh()` method signature changed from accepting `SessionInterface` to `RefreshTokenData`. If you implemented a custom OAuth client with the `refresh()` method, update it to match the new signature.

## API Reference

### HonoOAuthSessions

#### `startOAuth(handle: string, options?: { mobile?: boolean; codeChallenge?: string }): Promise<URL>`

Start OAuth flow for a given handle. Returns authorization URL.

#### `handleCallback(c: Context): Promise<Response>`

Handle OAuth callback and create session. Automatically detects mobile vs web flows.

#### `validateSession(c: Context): Promise<ValidationResult>`

Validate current session and return user information.

#### `refreshMobileToken(authHeader: string): Promise<RefreshResult>`

Refresh mobile session token from Authorization header.

#### `logout(c: Context): Promise<void>`

Destroy session and clean up stored data.

#### `getOAuthSessionFromRequest(req: Request): Promise<SessionInterface | null>` (v1.1.0+)

Helper method to extract and validate an OAuth session directly from a Request object. Useful for custom middleware or non-Hono contexts where you don't have access to the Hono Context object.

**Returns:**
- `SessionInterface` if session is valid and found
- `null` if no session exists, cookie is missing, or session is invalid

**Example:**
```typescript
// In a custom middleware or API handler
const session = await sessions.getOAuthSessionFromRequest(request);
if (!session) {
  return new Response("Unauthorized", { status: 401 });
}

// Use the session
const profile = await session.makeRequest(
  "GET",
  `${session.pdsUrl}/xrpc/app.bsky.actor.getProfile?actor=${session.did}`
);
```

#### `getClearCookieHeader(): string` (v1.1.0+)

Returns a `Set-Cookie` header string that clears the session cookie. Useful when you need to manually construct logout responses or clear sessions in custom scenarios.

**Example:**
```typescript
// Manual logout response
return new Response("Logged out", {
  headers: {
    "Set-Cookie": sessions.getClearCookieHeader(),
  },
});
```

## Error Handling

```typescript
import {
  ConfigurationError,
  MobileIntegrationError,
  OAuthFlowError,
  SessionError,
} from "jsr:@tijs/hono-oauth-sessions";

try {
  await sessions.validateSession(c);
} catch (error) {
  if (error instanceof SessionError) {
    // Handle session-related errors
  } else if (error instanceof OAuthFlowError) {
    // Handle OAuth flow errors
  }
}
```

## Contributing & Development

This project uses automated publishing to JSR via GitHub Actions. When you push a version tag (e.g., `v0.1.2`), the workflow will automatically:

1. Run code quality checks (`deno task ci`)
2. Run all tests
3. Publish to JSR if everything passes

### Publishing a New Version

```bash
# Update version in deno.json
# Update CHANGELOG.md
git add .
git commit -m "chore: release v0.1.2"
git tag v0.1.2
git push --tags
```

## Support

If this library helps you build AT Protocol applications, consider [supporting my work on Ko-fi](https://ko-fi.com/tijsteulings).

## License

MIT © [Tijs](https://github.com/tijs)
