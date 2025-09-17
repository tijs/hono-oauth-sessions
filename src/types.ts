// Types only - no imports needed

/**
 * Storage interface for OAuth data persistence
 * Compatible with @tijs/oauth-client-deno and similar clients
 */
export interface OAuthStorage {
  /**
   * Retrieve a value from storage
   */
  get<T = unknown>(key: string): Promise<T | null>;

  /**
   * Store a value in storage with optional TTL
   */
  set<T = unknown>(key: string, value: T, options?: { ttl?: number }): Promise<void>;

  /**
   * Delete a value from storage
   */
  delete(key: string): Promise<void>;
}

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

  /**
   * Restore a session from storage by session ID
   * @param sessionId - Session identifier to restore
   * @returns Promise resolving to restored session, or null if not found
   */
  restore(sessionId: string): Promise<SessionInterface | null>;
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

  /** User's PDS URL */
  pdsUrl: string;

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

  /**
   * Serialize session data for storage (required for complete session storage)
   */
  toJSON(): any;
}

/**
 * Configuration options for HonoOAuthSessions
 */
export interface HonoOAuthConfig {
  /** OAuth client instance - bring your own! */
  oauthClient: OAuthClientInterface;

  /** Storage instance for OAuth session data */
  storage: OAuthStorage;

  /** Secret for Iron Session cookie encryption */
  cookieSecret: string;

  /** Base URL of the application */
  baseUrl: string;

  /** Cookie name for Iron Session (default: "sid") */
  cookieName?: string;

  /**
   * Session TTL (time-to-live) in seconds for Iron Session cookies.
   * Controls how long users stay logged in before needing to re-authenticate.
   * @default 604800 (7 days)
   * @example
   * // 1 hour session
   * sessionTtl: 60 * 60
   *
   * // 30 day session
   * sessionTtl: 60 * 60 * 24 * 30
   */
  sessionTtl?: number;

  /** Mobile app custom URL scheme (default: "app://auth-callback") */
  mobileScheme?: string;
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
 * Mobile token refresh result (BookHive style)
 */
export interface RefreshResult {
  success: boolean;
  error?: string;
  payload?: {
    did: string;
    sid: string;
  };
}

/**
 * OAuth sessions manager interface
 */
export interface OAuthSessionsInterface {
  /**
   * Start OAuth authorization flow
   * @param handle - User handle
   * @param options - OAuth options
   * @returns Authorization URL
   */
  startOAuth(
    handle: string,
    options?: { mobile?: boolean; codeChallenge?: string },
  ): Promise<string>;

  /**
   * Handle OAuth callback
   * @param c - Hono context
   * @returns Response
   */
  handleCallback(c: any): Promise<Response>;

  /**
   * Validate session from request context
   * @param c - Hono context
   * @returns Validation result
   */
  validateSession(c: any): Promise<ValidationResult>;

  /**
   * Validate mobile session from Bearer token
   * @param authHeader - Authorization header
   * @returns Validation result
   */
  validateMobileSession(authHeader: string): Promise<ValidationResult>;

  /**
   * Refresh mobile token
   * @param authHeader - Authorization header
   * @returns Refresh result
   */
  refreshMobileToken(authHeader: string): Promise<RefreshResult>;

  /**
   * Get stored OAuth data for a DID
   * @param did - User's DID
   * @returns Stored OAuth session or null
   */
  getStoredOAuthData(did: string): Promise<StoredOAuthSession | null>;

  /**
   * Logout user
   * @param c - Hono context
   */
  logout(c: any): Promise<void>;

  /**
   * Get an OAuth session for a specific DID
   * @param did - User's DID
   * @returns OAuth session or null if not found
   */
  getOAuthSession(did: string): Promise<SessionInterface | null>;
}
