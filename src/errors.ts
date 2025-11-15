/**
 * Base error class for Hono OAuth Sessions
 */
export class HonoOAuthError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "HonoOAuthError";
  }
}

/**
 * Configuration validation error
 */
export class ConfigurationError extends HonoOAuthError {
  constructor(message: string) {
    super(message, "CONFIGURATION_ERROR");
    this.name = "ConfigurationError";
  }
}

/**
 * Session validation or management error
 */
export class SessionError extends HonoOAuthError {
  constructor(message: string) {
    super(message, "SESSION_ERROR");
    this.name = "SessionError";
  }
}

/**
 * Storage operation error
 */
export class StorageError extends HonoOAuthError {
  constructor(message: string) {
    super(message, "STORAGE_ERROR");
    this.name = "StorageError";
  }
}

/**
 * OAuth flow error
 */
export class OAuthFlowError extends HonoOAuthError {
  constructor(message: string) {
    super(message, "OAUTH_FLOW_ERROR");
    this.name = "OAuthFlowError";
  }
}

/**
 * Mobile app integration error
 */
export class MobileIntegrationError extends HonoOAuthError {
  constructor(message: string) {
    super(message, "MOBILE_INTEGRATION_ERROR");
    this.name = "MobileIntegrationError";
  }
}
