import { StorageError } from "./errors.ts";

/**
 * SQLite storage interface for Val Town
 */
export interface SQLiteInterface {
  execute(query: { sql: string; args: unknown[] }): Promise<{
    columns: string[];
    rows: unknown[][];
  }>;
}

/**
 * Helper function to convert SQLite rows to objects
 */
function rowsToObjects<T = Record<string, unknown>>(
  columns: string[],
  rows: unknown[][],
): T[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      obj[column] = row[index];
    });
    return obj as T;
  });
}

/**
 * Val Town optimized storage for OAuth sessions
 * Uses the sqlite2 API format with automatic table creation
 */
export class ValTownStorage {
  private initialized = false;

  constructor(private sqlite: SQLiteInterface) {}

  private async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create OAuth sessions table
      await this.sqlite.execute({
        sql: `
          CREATE TABLE IF NOT EXISTS oauth_sessions (
            did TEXT PRIMARY KEY,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            handle TEXT,
            display_name TEXT,
            avatar TEXT,
            pds_url TEXT,
            expires_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `,
        args: [],
      });

      // Create Iron Session storage table
      await this.sqlite.execute({
        sql: `
          CREATE TABLE IF NOT EXISTS iron_session_storage (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            expires_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `,
        args: [],
      });

      // Create index for expiration cleanup
      await this.sqlite.execute({
        sql: `
          CREATE INDEX IF NOT EXISTS idx_iron_session_expires 
          ON iron_session_storage(expires_at)
        `,
        args: [],
      });

      this.initialized = true;
    } catch (error) {
      throw new StorageError(
        `Failed to initialize tables: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Store OAuth session data
   */
  async setOAuthSession(did: string, sessionData: {
    accessToken: string;
    refreshToken?: string;
    handle?: string;
    displayName?: string;
    avatar?: string;
    pdsUrl?: string;
    expiresAt?: number;
  }): Promise<void> {
    await this.init();

    const now = Date.now();

    try {
      await this.sqlite.execute({
        sql: `
          INSERT OR REPLACE INTO oauth_sessions (
            did, access_token, refresh_token, handle, display_name, 
            avatar, pds_url, expires_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          did,
          sessionData.accessToken,
          sessionData.refreshToken || null,
          sessionData.handle || null,
          sessionData.displayName || null,
          sessionData.avatar || null,
          sessionData.pdsUrl || null,
          sessionData.expiresAt || null,
          now,
          now,
        ],
      });
    } catch (error) {
      throw new StorageError(
        `Failed to store OAuth session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get OAuth session data
   */
  async getOAuthSession(did: string): Promise<
    {
      accessToken: string;
      refreshToken?: string;
      handle?: string;
      displayName?: string;
      avatar?: string;
      pdsUrl?: string;
      expiresAt?: number;
    } | null
  > {
    await this.init();

    try {
      const result = await this.sqlite.execute({
        sql: `
          SELECT access_token, refresh_token, handle, display_name, 
                 avatar, pds_url, expires_at
          FROM oauth_sessions 
          WHERE did = ?
        `,
        args: [did],
      });

      if (result.rows.length === 0) return null;

      const sessions = rowsToObjects(result.columns, result.rows);
      const session = sessions[0];

      return {
        accessToken: session.access_token as string,
        refreshToken: session.refresh_token as string || undefined,
        handle: session.handle as string || undefined,
        displayName: session.display_name as string || undefined,
        avatar: session.avatar as string || undefined,
        pdsUrl: session.pds_url as string || undefined,
        expiresAt: session.expires_at as number || undefined,
      };
    } catch (error) {
      throw new StorageError(
        `Failed to get OAuth session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delete OAuth session
   */
  async deleteOAuthSession(did: string): Promise<void> {
    await this.init();

    try {
      await this.sqlite.execute({
        sql: "DELETE FROM oauth_sessions WHERE did = ?",
        args: [did],
      });
    } catch (error) {
      throw new StorageError(
        `Failed to delete OAuth session: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Iron Session storage interface
   */
  async hasItem(key: string): Promise<boolean> {
    await this.init();

    try {
      const now = Date.now();
      const result = await this.sqlite.execute({
        sql: `
          SELECT key FROM iron_session_storage 
          WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)
        `,
        args: [key, now],
      });

      return result.rows.length > 0;
    } catch (error) {
      throw new StorageError(
        `Failed to check item: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getItem<T = unknown>(key: string): Promise<T | null> {
    await this.init();

    try {
      const now = Date.now();
      const result = await this.sqlite.execute({
        sql: `
          SELECT value FROM iron_session_storage 
          WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)
        `,
        args: [key, now],
      });

      if (result.rows.length === 0) return null;

      const items = rowsToObjects(result.columns, result.rows);
      const value = items[0].value as string;

      try {
        return JSON.parse(value) as T;
      } catch {
        return value as T;
      }
    } catch (error) {
      throw new StorageError(
        `Failed to get item: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async setItem(key: string, value: unknown, options?: { ttl?: number }): Promise<void> {
    await this.init();

    try {
      const now = Date.now();
      const expiresAt = options?.ttl ? now + (options.ttl * 1000) : null;
      const serializedValue = typeof value === "string" ? value : JSON.stringify(value);

      await this.sqlite.execute({
        sql: `
          INSERT OR REPLACE INTO iron_session_storage 
          (key, value, expires_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        args: [key, serializedValue, expiresAt, now, now],
      });
    } catch (error) {
      throw new StorageError(
        `Failed to set item: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async removeItem(key: string): Promise<void> {
    await this.init();

    try {
      await this.sqlite.execute({
        sql: "DELETE FROM iron_session_storage WHERE key = ?",
        args: [key],
      });
    } catch (error) {
      throw new StorageError(
        `Failed to remove item: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clean up expired items
   */
  async cleanup(): Promise<void> {
    await this.init();

    try {
      const now = Date.now();

      // Clean up expired Iron Session data
      await this.sqlite.execute({
        sql: "DELETE FROM iron_session_storage WHERE expires_at IS NOT NULL AND expires_at <= ?",
        args: [now],
      });

      // Clean up expired OAuth sessions
      await this.sqlite.execute({
        sql: "DELETE FROM oauth_sessions WHERE expires_at IS NOT NULL AND expires_at <= ?",
        args: [now],
      });
    } catch (error) {
      throw new StorageError(
        `Failed to cleanup: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Aliases for compatibility
  get = this.getItem;
  set = this.setItem;
  del = this.removeItem;
  delete = this.removeItem;
}
