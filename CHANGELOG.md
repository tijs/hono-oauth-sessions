# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
