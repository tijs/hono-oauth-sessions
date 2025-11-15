# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2025-01-15

### Changed

- **BREAKING (for custom OAuth clients only)**: `OAuthClientInterface.refresh()` method signature changed from accepting `SessionInterface` to `RefreshTokenData`
  - Only affects users who implemented their own OAuth client with the optional `refresh()` method
  - `@tijs/oauth-client-deno` users are unaffected (will be updated in coordination)

### Added

- **RefreshTokenData Interface**: New honest representation of data needed for token refresh
  - Eliminates the need to construct fake `SessionInterface` objects
  - Provides clear contract about minimal data required for token refresh
  - Includes: `did`, `accessToken`, `refreshToken`, `handle`, `pdsUrl`, `expiresAt`
- **Enhanced Documentation**: Added comprehensive examples for implementing custom OAuth clients with token refresh

### Fixed

- **Architecture**: Removed "fake session" objects created for token refresh (high-severity code smell)
  - Previously created `SessionInterface` objects with throwing `makeRequest()` stubs
  - Previously included empty DPoP key objects that could cause silent failures
  - Now uses honest `RefreshTokenData` interface that accurately represents capabilities
- **Type Safety**: Eliminated fragile workaround that violated Liskov Substitution Principle
- **Maintainability**: Reduced risk of runtime errors if OAuth client implementation changes

### Migration Guide

If you implemented a custom OAuth client with the `refresh()` method, update your implementation:

**Before (v1.1.x):**
```typescript
async refresh(session: SessionInterface): Promise<SessionInterface> {
  // Use session.refreshToken to get new token
  const newTokens = await this.oauthServer.refresh(session.refreshToken);
  return this.createSession(session.did, newTokens.accessToken);
}
```

**After (v1.2.0):**
```typescript
async refresh(tokens: RefreshTokenData): Promise<SessionInterface> {
  // Use tokens.refreshToken to get new token
  const newTokens = await this.oauthServer.refresh(tokens.refreshToken);
  return this.createSession(tokens.did, newTokens.accessToken);
}
```

## [1.1.1] - 2025-01-15

### Fixed

- **Type Safety**: Removed all `as any` type casts from production code by adding optional `refresh?()` method to `OAuthClientInterface`
- **Cookie Parsing**: Fixed fragile cookie parsing that failed when cookie values contained `=` characters (common in Iron Session cookies)
- **Type Consistency**: Made `StoredOAuthSession.pdsUrl` required to match `SessionInterface.pdsUrl`, preventing potential runtime errors
- **Error Naming**: Renamed `ValTownOAuthError` to `HonoOAuthError` and updated all error classes to reflect library's generic nature

### Added

- **Cookie Secret Validation**: Enforces minimum 32-character length requirement (Iron Session) with clear error message
- **Logging Abstraction**: Added optional `logger` configuration parameter with `Logger` interface
  - Defaults to no-op logger (no console output in production)
  - Accepts `console` for standard logging or custom logger implementation
  - Replaced all 15+ hardcoded `console.log/warn/error` statements
- **Comprehensive Tests**: Added test coverage for v1.1.0 helper methods (`getOAuthSessionFromRequest()`, `getClearCookieHeader()`)
- **Enhanced Documentation**:
  - Documented v1.1.0 helper methods in API Reference with examples
  - Added "Logging and Debugging" section to README
  - Updated configuration interface documentation with logger option
  - Added note about 32-character minimum for cookieSecret

### Improved

- **Production Readiness**: Configurable logging allows production deployments to disable debug output
- **Developer Experience**: Better error messages for configuration issues
- **Code Quality**: Full TypeScript type safety without type assertions
- **Test Coverage**: All public methods now have test coverage (25 tests passing)

## [1.1.0] - 2025-01-14

### Added

- **Session Helper Methods**: New convenience methods to reduce boilerplate in applications
  - `getOAuthSessionFromRequest(req: Request)`: Extract and validate session from raw Request object by unsealing iron-session cookie, extracting DID, and restoring OAuth session with automatic token refresh
  - `getClearCookieHeader()`: Returns properly formatted Set-Cookie header to clear the session cookie
- **Enhanced Developer Experience**: Applications can now authenticate requests without manually handling cookie unsealing or iron-session imports
- **Comprehensive Documentation**: Full JSDoc comments with usage examples for new helper methods

### Improved

- **Reduced Application Boilerplate**: Applications no longer need to implement cookie extraction and unsealing logic (saves ~150 lines per app)
- **Single Source of Truth**: All iron-session cookie handling logic now centralized in the library

## [1.0.0] - 2025-01-11

### Changed

- **BREAKING**: `getOAuthSession()` now propagates typed errors from the underlying OAuth client instead of catching and returning null
  - Requires `@tijs/oauth-client-deno@^3.0.0` which throws typed errors
  - Errors include: `SessionNotFoundError`, `RefreshTokenExpiredError`, `RefreshTokenRevokedError`, `NetworkError`, `TokenExchangeError`, `SessionError`
  - Calling code must now handle these errors explicitly

### Added

- **Enhanced Error Visibility**: `getOAuthSession()` now provides detailed error information for better debugging
- **Detailed Logging**: Added logging for session restoration attempts and results

### Improved

- **Error Diagnostics**: Applications can now distinguish between different failure modes (session not found, token expired, network error, etc.)
- **Migration Support**: JSDoc updated with examples of new error handling pattern

### Migration Guide

Applications using `getOAuthSession()` must now handle errors:

**Before (v0.x):**

```typescript
const session = await sessions.getOAuthSession(did);
if (!session) {
  // Unknown why it failed
  return 401;
}
```

**After (v1.x):**

```typescript
try {
  const session = await sessions.getOAuthSession(did);
  if (!session) {
    return 401;
  }
} catch (error) {
  if (error instanceof SessionNotFoundError) {
    // Session doesn't exist - user needs to log in
  } else if (error instanceof RefreshTokenExpiredError) {
    // Refresh token expired - re-authentication required
  } else if (error instanceof NetworkError) {
    // Transient failure - retry may help
  }
  return 401;
}
```

## [0.5.0] - 2025-10-27

### Added

- **Custom Redirect Support**: `startOAuth()` now accepts an optional `redirectPath` parameter to specify where users should be redirected after completing OAuth authentication
- **Security Validation**: Redirect paths are validated to only allow relative paths starting with `/` (and not `//`) to prevent open redirect vulnerabilities
- **OAuth State Storage**: Redirect path is securely stored in OAuth state and restored after authentication completes

### Changed

- **Post-OAuth Redirect**: `handleCallback()` now uses stored redirect path from OAuth state instead of always redirecting to `/`
- **Flexible Navigation**: Applications can now redirect users back to their intended destination after login (e.g., bookmarking flow, deep links)

### Fixed

- **Bookmarklet Flow**: Fixes issue where users trying to save bookmarks while logged out would lose their context after authentication

## [0.4.2] - 2025-09-30

### Fixed

- **Debug Logging**: Added console logging for profile fetching during OAuth callback to help diagnose avatar loading issues

## [0.4.1] - 2025-09-30

### Added

- **Profile Fetching**: OAuth callback now automatically fetches user profile (avatar and displayName) from PDS using `app.bsky.actor.getProfile`
- **Avatar Support**: User avatar URLs are now stored in OAuth session data and returned in session validation responses
- **Mobile Profile Data**: Mobile OAuth callback now includes `avatar` and `display_name` parameters in the redirect URL

### Changed

- **Enhanced Session Data**: `StoredOAuthSession` now includes profile information fetched during authentication
- **Improved UX**: Applications can now display user avatars without making additional API calls

## [0.4.0] - 2025-09-30

### 💥 BREAKING CHANGES

- **Required makeRequest Method**: `SessionInterface.makeRequest()` is now required (was optional). This ensures proper DPoP authentication for all AT Protocol operations.

### Changed

- **DPoP Authentication**: Made `makeRequest()` method required in `SessionInterface` for proper AT Protocol support
- **Authorization Header**: Documented that `makeRequest()` uses correct `Authorization: DPoP <token>` format (not `Bearer`)
- **Type Safety**: Improved TypeScript type safety by making DPoP method non-optional

### Added

- **Comprehensive Documentation**: Added detailed JSDoc for `makeRequest()` explaining DPoP proof generation, nonce handling, and proper usage for create/read/delete operations
- **Usage Examples**: Added examples showing how to use `makeRequest()` for common AT Protocol operations (createRecord, deleteRecord)

### Migration Guide

If you're using a custom OAuth client, ensure it implements the `makeRequest()` method on sessions. The `@tijs/oauth-client-deno` package already provides this implementation.

## [0.3.1] - 2025-09-17

### Fixed

- **Complete Interface**: Updated `OAuthSessionsInterface` to include all public methods (`startOAuth`, `handleCallback`, `validateSession`, `validateMobileSession`, `refreshMobileToken`, `getStoredOAuthData`, `logout`, `getOAuthSession`)
- **Type Coverage**: Ensured full API compatibility for existing code using the sessions instance

## [0.3.0] - 2025-09-17

### Added

- **Enhanced Type Safety**: Added proper TypeScript interfaces for OAuth sessions
- **OAuth Sessions Interface**: Added `OAuthSessionsInterface` for better type safety when using `getOAuthSession()`

### Changed

- **BREAKING**: Added required `pdsUrl` property to `SessionInterface` for AT Protocol integration

### Fixed

- **Type Exports**: Improved type exports to provide better IntelliSense and compile-time type checking
- **Return Types**: Fixed `getOAuthSession()` return type from `any | null` to `SessionInterface | null`

## [0.2.3] - 2025-09-07

### Fixed

- **Complete Session Storage**: Fixed session storage to include complete SessionData with DPoP keys instead of just basic OAuth token data
- **OAuth Client Integration**: Improved integration between hono-oauth-sessions and oauth-client-deno by storing complete session data required for DPoP authentication

## [0.2.2] - 2025-09-07

### Added

- **Mobile Session Validation**: Added `validateMobileSession()` method to handle Bearer token authentication from mobile clients
- **Dual Authentication Support**: Session validation now supports both cookie-based (web) and Bearer token (mobile) authentication patterns

### Fixed

- **Mobile API Integration**: Fixed OAuth integration between mobile clients and backend session validation
- **Authentication Mismatch**: Resolved issue where mobile clients sent Bearer tokens but backend only accepted cookies

## [0.2.1] - 2025-09-07

### Fixed

- **Mobile Token Refresh**: Fixed `oauthSession.getTokenInfo is not a function` error in mobile token refresh
- **API Compatibility**: Removed incorrect method call that was specific to BookHive but not available in oauth-client-deno Session objects
- **Token Management**: The oauth-client-deno `restore()` method already handles token refresh automatically, so no additional calls needed

## [0.2.0] - 2025-09-07

### 💥 BREAKING CHANGES

- **Storage Key Pattern**: Changed from `oauth_session:{did}` to `session:{did}` for compatibility with oauth-client-deno
- **Interface Extension**: `OAuthClientInterface` now requires `restore(sessionId: string)` method
- **Data Migration Required**: Existing stored sessions will need to be migrated to new key pattern

### Added

- **Clean API Integration**: Added `getOAuthSession(did)` helper method for seamless OAuth session access
- **oauth-client-deno Compatibility**: Storage keys now align with oauth-client-deno's expected patterns
- **Enhanced Interface**: Extended `OAuthClientInterface` with `restore()` method for better type safety

### Changed

- **Storage Keys**: All OAuth session data now stored under `session:{did}` instead of `oauth_session:{did}`
- **Library Integration**: Applications can now use `sessions.getOAuthSession(did)` for clean session access
- **Documentation**: Updated README to reflect new storage key patterns

### Migration Guide

To upgrade from v0.1.x to v0.2.0:

1. **Update Storage Keys**: Migrate existing `oauth_session:{did}` keys to `session:{did}`
2. **Update OAuth Client**: Ensure your OAuth client implements the `restore(sessionId: string)` method
3. **Use New API**: Replace manual session recreation with `sessions.getOAuthSession(did)`

## [0.1.4] - 2025-09-05

### Enhanced

- **Session TTL Documentation**: Added comprehensive documentation for configurable session TTL with examples for 1 hour, 12 hours, and 30 day sessions
- **Configuration Guide**: Added detailed "Session TTL Configuration" section to README with practical examples

### Fixed

- **Security**: Removed problematic TODO comment that could have led to exposing OAuth tokens in session validation responses

### Improved

- **Developer Experience**: Better discoverability of TTL configuration options through enhanced JSDoc and README examples
- **Code Quality**: Cleaned up technical debt in session validation logic

## [0.1.3] - 2025-09-05

### Added

- **Import Maps**: Added comprehensive import maps to `deno.json` for cleaner dependency management
- **Dependency Management**: Centralized all dependency versions in import maps for easier updates

### Changed

- **Cleaner Imports**: Replaced direct JSR/NPM specifiers with import map references
- **README Updates**: Updated example code to use correct JSR imports and latest oauth-client-deno version

### Improved

- **Developer Experience**: Cleaner import statements throughout the codebase
- **Maintainability**: Centralized dependency version management

## [0.1.2] - 2025-09-05

### Added

- **GitHub Actions Workflow**: Automated publishing to JSR on version tags
- **Development Documentation**: Added contributing section to README with publishing instructions
- **CI Pipeline**: Automated code quality checks (formatting, linting, type checking, and tests) before publishing

### Changed

- **Development Process**: New releases now automatically publish to JSR when version tags are pushed
- **Quality Assurance**: All releases now go through automated CI pipeline before publishing

## [0.1.1] - 2025-09-05

### Fixed

- **CRITICAL**: Fixed token refresh logic in `validateSession` method - now properly refreshes expired tokens automatically during session validation
- **CRITICAL**: Fixed mobile token refresh endpoint to use OAuth client's `refresh()` method instead of incorrectly trying to call methods on stored data objects
- **CRITICAL**: Removed problematic fallback behavior in mobile token refresh that bypassed actual token refresh when failures occurred

### Changed

- Session validation now includes automatic token refresh when tokens are within 5 minutes of expiry
- Mobile token refresh failures now properly fail instead of silently returning stale tokens
- Improved error handling and logging for token refresh operations

## [0.1.0] - 2025-08-31

### Added

- Initial release of storage-agnostic OAuth session management for AT Protocol applications
- OAuth Flow Management with authorization code flow and PKCE support
- Bring Your Own OAuth Client architecture with `OAuthClientInterface`
- Bring Your Own Storage architecture with `OAuthStorage` interface
- Mobile App Support with encrypted callback URLs and token refresh
- Iron Session Cookies for secure session persistence with automatic expiration
- Hono Integration with Context-based API
- Storage implementations examples (Val Town SQLite, Redis, Memory)
- Comprehensive API with `startOAuth`, `handleCallback`, `validateSession`, `refreshMobileToken`, and `logout`
- Error handling with custom error types (`ConfigurationError`, `OAuthFlowError`, `SessionError`, `MobileIntegrationError`)
- Complete unit test suite with business logic testing
- TypeScript support with strict type checking

### Features

- 🔐 OAuth Flow Management - Authorization code flow with PKCE support
- 🔌 Bring Your Own OAuth Client - Requires specific interface implementation
- 🗄️ Bring Your Own Storage - Simple key-value storage interface
- 📱 Mobile App Support - Generates mobile callback URLs with encrypted tokens
- 🍪 Iron Session Cookies - Secure session persistence with automatic expiration
- 🔄 Token Refresh Support - Mobile token refresh when OAuth client supports it
- 🎯 Hono Integration - Built for Hono web framework with Context-based API

[0.1.0]: https://github.com/tijs/hono-oauth-sessions/releases/tag/v0.1.0
