/**
 * Base error class for ValTown OAuth Sessions
 */
export class ValTownOAuthError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "ValTownOAuthError";
  }
}

/**
 * Configuration validation error
 */
export class ConfigurationError extends ValTownOAuthError {
  constructor(message: string) {
    super(message, "CONFIGURATION_ERROR");
    this.name = "ConfigurationError";
  }
}

/**
 * Session validation or management error
 */
export class SessionError extends ValTownOAuthError {
  constructor(message: string) {
    super(message, "SESSION_ERROR");
    this.name = "SessionError";
  }
}

/**
 * Storage operation error
 */
export class StorageError extends ValTownOAuthError {
  constructor(message: string) {
    super(message, "STORAGE_ERROR");
    this.name = "StorageError";
  }
}

/**
 * OAuth flow error
 */
export class OAuthFlowError extends ValTownOAuthError {
  constructor(message: string) {
    super(message, "OAUTH_FLOW_ERROR");
    this.name = "OAuthFlowError";
  }
}

/**
 * Mobile app integration error
 */
export class MobileIntegrationError extends ValTownOAuthError {
  constructor(message: string) {
    super(message, "MOBILE_INTEGRATION_ERROR");
    this.name = "MobileIntegrationError";
  }
}
