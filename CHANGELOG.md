# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
