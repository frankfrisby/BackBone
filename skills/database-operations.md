---
name: database-operations
description: Work with databases — SQLite, PostgreSQL, MongoDB. Use when the user needs to create tables, run queries, manage data, or build database-backed features. Triggers on "database", "SQL", "SQLite", "PostgreSQL", "MongoDB", "query", "schema", "migration".
---

# Database Operations

Create, query, and manage databases.

## BACKBONE Default: SQLite (better-sqlite3)

BACKBONE uses SQLite for local persistence. The knowledge-db already exists at `src/services/memory/knowledge-db.js`.

```javascript
import Database from "better-sqlite3";
const db = new Database("path/to/db.sqlite");
db.pragma("journal_mode = WAL"); // Always enable WAL mode
```

## Key Patterns

- **WAL mode**: Always set `journal_mode = WAL` for concurrent reads
- **Prepared statements**: Use `db.prepare(sql)` for repeated queries
- **Transactions**: Wrap bulk inserts in `db.transaction(() => { ... })()`
- **FTS5**: For full-text search — `CREATE VIRTUAL TABLE ... USING fts5(...)`
- **JSON columns**: Store complex data as JSON text, query with `json_extract()`

## PostgreSQL (pg)

```javascript
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
```

## MongoDB (mongoose)

```javascript
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGODB_URI);
const Schema = new mongoose.Schema({ name: String, created: { type: Date, default: Date.now } });
```

## BACKBONE Integration

- **Knowledge DB**: `src/services/memory/knowledge-db.js` — FTS5 + vector search
- **Data dir**: Use `getDataDir()` from `src/services/paths.js` for DB file location
- **Migrations**: Version tables with `user_version` pragma

## Pitfalls

- SQLite is single-writer — use WAL mode and keep write transactions short
- `better-sqlite3` is synchronous — don't use in hot async loops
- Always parameterize queries (`?` or `$1`) — never interpolate user input
