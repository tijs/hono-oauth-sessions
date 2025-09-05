# @tijs/hono-oauth-sessions

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

- `oauth_session:{did}` - OAuth session data for users
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

  /** Secret for Iron Session encryption */
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

## License

MIT © [Tijs](https://github.com/tijs)
