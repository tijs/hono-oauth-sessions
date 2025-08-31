# @tijs/valtown-oauth-sessions

Val Town optimized OAuth session management for AT Protocol applications. **Bring your own OAuth client** - works with any compatible OAuth implementation including `@tijs/oauth-client-deno`, `@atproto/oauth-client-node`, or custom clients.

## Features

- 🔐 **Complete OAuth Flow Management** - Start, callback, refresh, logout
- 🔌 **Bring Your Own OAuth Client** - Works with any compatible OAuth implementation
- 📱 **Mobile App WebView Integration** - Custom URL schemes and mobile detection
- 🍪 **Iron Session Cookies** - Secure session persistence with automatic expiration
- 🗄️ **SQLite Storage** - Optimized for Val Town's sqlite2 API format
- 🔄 **Automatic Token Refresh** - Background token management (if supported by client)
- 🧹 **Automatic Cleanup** - Expired session removal
- 🎯 **Hono Framework Ready** - Built for Val Town's preferred web framework

## Installation

```bash
deno add @tijs/valtown-oauth-sessions
```

## Quick Start with @tijs/oauth-client-deno

```typescript
import { Hono } from "https://esm.sh/hono";
import { MemoryStorage, OAuthClient } from "jsr:@tijs/oauth-client-deno@1.0.0";
import { ValTownOAuthSessions } from "jsr:@tijs/valtown-oauth-sessions";
import { sqlite } from "https://esm.town/v/std/sqlite2";

const app = new Hono();

// Set up OAuth client
const oauthClient = new OAuthClient({
  clientId: "https://myapp.com/client-metadata.json",
  redirectUri: "https://myapp.com/oauth/callback",
  storage: new MemoryStorage(), // Use any storage adapter
});

// Set up session manager
const sessions = new ValTownOAuthSessions({
  oauthClient,
  cookieSecret: Deno.env.get("COOKIE_SECRET")!,
  baseUrl: "https://myapp.com",
}, sqlite);

// OAuth routes
app.get("/login", async (c) => {
  const { handle } = c.req.query();
  if (!handle) return c.text("Missing handle", 400);

  const authUrl = await sessions.startOAuth(handle);
  return c.redirect(authUrl);
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

## Using with Other OAuth Clients

The session manager works with any OAuth client that implements the interface. **As of @tijs/oauth-client-deno v1.0.0, both Deno and Node.js clients now have compatible interfaces!**

### With @atproto/oauth-client-node

Now works directly without any adapter:

```typescript
import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { ValTownOAuthSessions } from "jsr:@tijs/valtown-oauth-sessions";

const nodeClient = new NodeOAuthClient({
  clientMetadata: {
    client_id: "https://myapp.com/client-metadata.json",
    redirect_uris: ["https://myapp.com/oauth/callback"],
  },
});

const sessions = new ValTownOAuthSessions({
  oauthClient: nodeClient, // Direct usage - no adapter needed!
  cookieSecret: Deno.env.get("COOKIE_SECRET")!,
  baseUrl: "https://myapp.com",
}, sqlite);
```

### With @tijs/oauth-client-deno v1.0.0+

Works directly:

```typescript
import { MemoryStorage, OAuthClient } from "jsr:@tijs/oauth-client-deno@1.0.0";
import { ValTownOAuthSessions } from "jsr:@tijs/valtown-oauth-sessions";

const denoClient = new OAuthClient({
  clientId: "https://myapp.com/client-metadata.json",
  redirectUri: "https://myapp.com/oauth/callback",
  storage: new MemoryStorage(),
});

const sessions = new ValTownOAuthSessions({
  oauthClient: denoClient, // Direct usage!
  cookieSecret: Deno.env.get("COOKIE_SECRET")!,
  baseUrl: "https://myapp.com",
}, sqlite);
```

### With Custom OAuth Client

```typescript
import { type OAuthClientInterface, type SessionInterface } from "jsr:@tijs/valtown-oauth-sessions";

class MyCustomOAuthClient implements OAuthClientInterface {
  async authorize(handle: string, options?: { state?: string }): Promise<URL> {
    // Your OAuth authorization logic
    const authUrl = new URL("https://authorization-server.com/oauth/authorize");
    authUrl.searchParams.set("client_id", "your-client-id");
    authUrl.searchParams.set("redirect_uri", "your-redirect-uri");
    if (options?.state) authUrl.searchParams.set("state", options.state);
    return authUrl;
  }

  async callback(
    params: URLSearchParams,
  ): Promise<{ session: SessionInterface; state?: string | null }> {
    // Your OAuth callback logic
    const code = params.get("code");
    const state = params.get("state");
    const tokens = await this.exchangeCodeForTokens(code);

    return {
      session: {
        did: tokens.sub,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        handle: tokens.handle,
        timeUntilExpiry: tokens.expires_in * 1000,
      },
    };
  }

  private async exchangeCodeForTokens(code: string) {
    // Your token exchange implementation
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

  return c.json({ authUrl });
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

### Mobile App Setup

Configure your mobile app to:

1. Set User-Agent to include your app name (e.g., "MyApp/1.0")
2. Register custom URL scheme (e.g., `myapp://auth-callback`)
3. Handle the callback URL with session tokens

```swift
// iOS URL scheme handling
func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool {
    if url.scheme == "myapp" && url.host == "auth-callback" {
        let params = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        let sessionToken = params?.first(where: { $0.name == "session_token" })?.value
        let did = params?.first(where: { $0.name == "did" })?.value
        
        // Store tokens securely and update app state
        return true
    }
    return false
}
```

## OAuth Client Interface

To use your own OAuth client, implement this simple interface:

```typescript
interface OAuthClientInterface {
  /** Start OAuth authorization flow */
  authorize(handle: string, options?: { state?: string }): Promise<string>;

  /** Handle OAuth callback and exchange code for tokens */
  callback(params: { code: string; state?: string }): Promise<{
    session: SessionInterface;
  }>;
}

interface SessionInterface {
  /** User's DID */
  did: string;

  /** Access token for API calls */
  accessToken: string;

  /** Refresh token (optional) */
  refreshToken?: string;

  /** Handle/username (optional) */
  handle?: string;

  /** Time until token expires in milliseconds (optional) */
  timeUntilExpiry?: number;

  /** Make authenticated request (optional) */
  makeRequest?(method: string, url: string, options?: any): Promise<Response>;

  /** Refresh tokens (optional) */
  refresh?(): Promise<SessionInterface>;
}
```

## Configuration Options

```typescript
interface ValTownOAuthConfig {
  /** OAuth client instance - bring your own! */
  oauthClient: OAuthClientInterface;

  /** Secret for Iron Session encryption */
  cookieSecret: string;

  /** Base URL of your application */
  baseUrl: string;

  /** Cookie name (default: "sid") */
  cookieName?: string;

  /** Session TTL in seconds (default: 7 days) */
  sessionTtl?: number;

  /** Mobile URL scheme (default: "app://auth-callback") */
  mobileScheme?: string;

  /** Mobile User-Agent patterns for detection */
  mobileUserAgents?: string[];

  /** Auto-cleanup expired sessions (default: true) */
  autoCleanup?: boolean;
}
```

## API Reference

### ValTownOAuthSessions

#### `startOAuth(handle: string, options?: { mobile?: boolean; codeChallenge?: string }): Promise<string>`

Start OAuth flow for a given handle. Returns authorization URL.

#### `handleCallback(c: Context): Promise<Response>`

Handle OAuth callback and create session. Automatically detects mobile vs web flows.

#### `validateSession(c: Context): Promise<ValidationResult>`

Validate current session and return user information.

#### `refreshMobileToken(authHeader: string): Promise<RefreshResult>`

Refresh mobile session token from Authorization header.

#### `logout(c: Context): Promise<void>`

Destroy session and clean up stored data.

#### `cleanup(): Promise<void>`

Manually clean up expired sessions.

## Storage

The package automatically creates two SQLite tables:

- `oauth_sessions` - OAuth session data (tokens, profile info)
- `iron_session_storage` - Iron Session cookie data

Tables are created automatically using Val Town's sqlite2 API format.

## Error Handling

```typescript
import {
  ConfigurationError,
  MobileIntegrationError,
  OAuthFlowError,
  SessionError,
} from "jsr:@tijs/valtown-oauth-sessions";

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

## License

MIT © [Tijs](https://github.com/tijs)
