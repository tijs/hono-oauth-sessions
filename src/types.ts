// Types only - no imports needed

/**
 * Generic OAuth client interface - bring your own client!
 * Compatible with @tijs/oauth-client-deno v1.0.0+, @atproto/oauth-client-node, and similar clients
 */
export interface OAuthClientInterface {
  /**
   * Start OAuth authorization flow
   * @returns URL object for authorization redirect
   */
  authorize(handle: string, options?: { state?: string }): Promise<URL>;

  /**
   * Handle OAuth callback and exchange code for tokens
   * @param params URLSearchParams from OAuth callback
   */
  callback(params: URLSearchParams): Promise<{
    session: SessionInterface;
    state?: string | null;
  }>;
}

/**
 * Generic OAuth session interface
 */
export interface SessionInterface {
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

  /**
   * Make authenticated request (optional - for convenience)
   */
  makeRequest?(method: string, url: string, options?: any): Promise<Response>;

  /**
   * Refresh tokens (optional)
   */
  refresh?(): Promise<SessionInterface>;
}

/**
 * Configuration options for ValTownOAuthSessions
 */
export interface ValTownOAuthConfig {
  /** OAuth client instance - bring your own! */
  oauthClient: OAuthClientInterface;

  /** Secret for Iron Session cookie encryption */
  cookieSecret: string;

  /** Base URL of the application */
  baseUrl: string;

  /** Cookie name for Iron Session (default: "sid") */
  cookieName?: string;

  /** Session TTL in seconds (default: 7 days) */
  sessionTtl?: number;

  /** Mobile app custom URL scheme (default: "app://auth-callback") */
  mobileScheme?: string;

  /** User agent string to detect mobile apps (default: includes common patterns) */
  mobileUserAgents?: string[];

  /** Cleanup expired sessions automatically (default: true) */
  autoCleanup?: boolean;
}

/**
 * Iron Session data stored in encrypted cookie
 */
export interface SessionData {
  did: string;
  createdAt: number;
  lastAccessed: number;
}

/**
 * OAuth session data stored in SQLite
 */
export interface StoredOAuthSession {
  did: string;
  accessToken: string;
  refreshToken?: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
  pdsUrl?: string;
  expiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Mobile callback URL parameters
 */
export interface MobileCallbackData {
  sessionToken: string;
  did: string;
  handle?: string;
  displayName?: string;
  avatar?: string;
  pdsUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

/**
 * Session validation result
 */
export interface ValidationResult {
  valid: boolean;
  did?: string;
  handle?: string;
  displayName?: string;
  session?: SessionInterface;
}

/**
 * OAuth callback result
 */
export interface CallbackResult {
  success: boolean;
  redirect?: string;
  mobileCallback?: MobileCallbackData;
  error?: string;
}

/**
 * Mobile token refresh result
 */
export interface RefreshResult {
  success: boolean;
  sessionToken?: string;
  did?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  error?: string;
}
