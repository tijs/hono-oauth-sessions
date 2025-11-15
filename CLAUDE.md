# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Deno library for storage-agnostic OAuth session management for AT Protocol applications built with Hono. It provides a "bring your own OAuth client" and "bring your own storage" architecture with Iron Session cookie integration.

## Development Commands

```bash
# Run all tests
deno task test

# Run type checking
deno task check

# Format code
deno task fmt:fix

# Check formatting
deno task fmt

# Lint code
deno task lint

# Run full CI suite (format + lint + check + test)
deno task ci

# Run a single test file
deno test --allow-net --allow-read --allow-env src/simple.test.ts
```

## Architecture

### Core Components

**src/sessions.ts** (main implementation, ~600 lines)

- `HonoOAuthSessions` class - The primary session management class
- Integrates Iron Session cookies for secure session persistence
- Delegates OAuth operations to pluggable OAuth clients
- Delegates storage operations to pluggable storage implementations
- Handles both web (cookie-based) and mobile (Bearer token) authentication flows

**src/types.ts** (interfaces)

- `OAuthClientInterface` - Contract for OAuth clients (authorize, callback, restore, optional refresh)
- `OAuthStorage` - Simple key-value storage interface (get, set, delete with optional TTL)
- `SessionInterface` - OAuth session with DPoP authentication via `makeRequest()`
- `RefreshTokenData` - Minimal data needed for token refresh (v1.2.0+)
- `Logger` - Logging abstraction (log, warn, error methods)

**src/errors.ts**

- Custom error hierarchy: `HonoOAuthError` base class
- Specific errors: `ConfigurationError`, `OAuthFlowError`, `SessionError`, `MobileIntegrationError`, `StorageError`

**mod.ts**

- Public API exports (HonoOAuthSessions class, all types, all errors)

### Key Architectural Patterns

**Bring Your Own (BYO) Pattern**

- OAuth client is injected via `OAuthClientInterface`
- Storage is injected via `OAuthStorage`
- This enables use with any compatible OAuth client (e.g., `@tijs/oauth-client-deno`, `@atproto/oauth-client-node`) and any storage backend (SQLite, Redis, memory, etc.)

**Session Storage Keys**

- Uses `session:{did}` pattern for storing OAuth session data
- Compatible with `@tijs/oauth-client-deno` storage expectations
- The same storage instance should be shared between OAuth client and session manager

**Dual Authentication Modes**

- Web: Iron Session cookies with automatic encryption/decryption
- Mobile: Encrypted Bearer tokens passed via Authorization header
- Mobile callbacks use custom URL schemes (default: `app://auth-callback`)

**Token Refresh Flow (v1.2.0+)**

- Uses honest `RefreshTokenData` interface instead of fake `SessionInterface` objects
- OAuth clients can optionally implement `refresh(tokens: RefreshTokenData)` method
- Automatic refresh when tokens are within 5 minutes of expiry during session validation

## Configuration Requirements

**Cookie Secret**

- Must be at least 32 characters (Iron Session requirement)
- Enforced at runtime with clear error message
- Used for encrypting session cookies

**Logger Configuration**

- Defaults to no-op logger (no console output in production)
- Can pass `console` for standard logging
- Can pass custom logger implementing `Logger` interface

## Testing Strategy

**src/simple.test.ts**

- Unit tests for business logic using mock implementations
- `MockStorage` - In-memory Map-based storage for testing
- `MockOAuthClient` - Configurable OAuth client mock
- Tests focus on configuration validation, OAuth state generation, storage operations, and error handling
- No external dependencies (no actual OAuth servers, no real storage backends)

**Test Coverage Guidelines**

- All public methods should have test coverage
- Use dependency injection to test business logic in isolation
- Mock external dependencies (OAuth clients, storage, Iron Session)
- Tests should not rely on external services or environment values

## Release Process

This project uses automated GitHub Actions publishing:

1. Update version in `deno.json`
2. Update `CHANGELOG.md` with changes
3. Commit changes: `git commit -m "chore: release vX.Y.Z"`
4. Tag release: `git tag vX.Y.Z`
5. Push with tags: `git push && git push --tags`

GitHub Actions will automatically:

- Run `deno task ci` (fmt, lint, check, test)
- Publish to JSR if all checks pass

**Important**: The version in `deno.json` must match the git tag for JSR publishing to work correctly.

## Type Safety Principles

- No `as any` type casts in production code (only in test mocks where necessary)
- All interfaces should honestly represent their capabilities (Liskov Substitution Principle)
- Use optional methods (`refresh?()`) rather than throwing stub implementations
- Avoid creating "fake" objects - use honest interfaces like `RefreshTokenData` instead

## Cookie Parsing

The library uses custom cookie parsing to handle Iron Session cookies which may contain `=` characters in their values. The parsing logic finds the cookie by prefix (`cookieName=`) and extracts everything after the first `=` as the value.

## AT Protocol Integration

Sessions include `makeRequest()` for DPoP-authenticated requests:

- Uses `Authorization: DPoP <token>` header (not `Bearer`)
- Handles DPoP proof generation, nonce challenges, and retry logic
- Includes access token hash (ath) in DPoP proof
- Required for all AT Protocol PDS operations (createRecord, deleteRecord, etc.)
