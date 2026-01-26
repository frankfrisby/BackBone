# Database Operations Skill

Work with databases programmatically.

## Dependencies
```bash
npm install better-sqlite3 pg mysql2 mongoose
```

## SQLite Operations

```javascript
import Database from 'better-sqlite3';

class SQLiteDB {
  constructor(filepath) {
    this.db = new Database(filepath);
    this.db.pragma('journal_mode = WAL');
  }

  // Create table
  createTable(tableName, columns) {
    const columnDefs = Object.entries(columns)
      .map(([name, type]) => `${name} ${type}`)
      .join(', ');
    this.db.exec(`CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefs})`);
  }

  // Insert
  insert(table, data) {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const stmt = this.db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`);
    return stmt.run(...Object.values(data));
  }

  // Insert many
  insertMany(table, records) {
    const keys = Object.keys(records[0]);
    const placeholders = keys.map(() => '?').join(', ');
    const stmt = this.db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`);

    const insertAll = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(...Object.values(item));
      }
    });

    return insertAll(records);
  }

  // Select
  select(table, where = {}, options = {}) {
    let query = `SELECT * FROM ${table}`;
    const values = [];

    if (Object.keys(where).length > 0) {
      const conditions = Object.entries(where).map(([key, value]) => {
        values.push(value);
        return `${key} = ?`;
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (options.orderBy) query += ` ORDER BY ${options.orderBy}`;
    if (options.limit) query += ` LIMIT ${options.limit}`;

    return this.db.prepare(query).all(...values);
  }

  // Update
  update(table, data, where) {
    const setClause = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const whereClause = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
    const stmt = this.db.prepare(`UPDATE ${table} SET ${setClause} WHERE ${whereClause}`);
    return stmt.run(...Object.values(data), ...Object.values(where));
  }

  // Delete
  delete(table, where) {
    const whereClause = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
    const stmt = this.db.prepare(`DELETE FROM ${table} WHERE ${whereClause}`);
    return stmt.run(...Object.values(where));
  }

  // Raw query
  query(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }

  // Execute
  exec(sql) {
    return this.db.exec(sql);
  }

  close() {
    this.db.close();
  }
}
```

## PostgreSQL Operations

```javascript
import pg from 'pg';

class PostgresDB {
  constructor(config) {
    this.pool = new pg.Pool(config);
  }

  async query(text, params = []) {
    const result = await this.pool.query(text, params);
    return result.rows;
  }

  async insert(table, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const result = await this.pool.query(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async select(table, where = {}, options = {}) {
    let query = `SELECT * FROM ${table}`;
    const values = [];

    if (Object.keys(where).length > 0) {
      const conditions = Object.entries(where).map(([key], i) => {
        values.push(where[key]);
        return `${key} = $${i + 1}`;
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (options.orderBy) query += ` ORDER BY ${options.orderBy}`;
    if (options.limit) query += ` LIMIT ${options.limit}`;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  async update(table, data, where) {
    const dataKeys = Object.keys(data);
    const whereKeys = Object.keys(where);

    const setClause = dataKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const whereClause = whereKeys.map((k, i) => `${k} = $${dataKeys.length + i + 1}`).join(' AND ');

    const result = await this.pool.query(
      `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *`,
      [...Object.values(data), ...Object.values(where)]
    );
    return result.rows;
  }

  async delete(table, where) {
    const whereClause = Object.keys(where).map((k, i) => `${k} = $${i + 1}`).join(' AND ');
    const result = await this.pool.query(
      `DELETE FROM ${table} WHERE ${whereClause} RETURNING *`,
      Object.values(where)
    );
    return result.rows;
  }

  async transaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}
```

## MongoDB Operations

```javascript
import mongoose from 'mongoose';

class MongoDB {
  constructor(uri) {
    this.uri = uri;
    this.models = {};
  }

  async connect() {
    await mongoose.connect(this.uri);
  }

  defineModel(name, schemaDefinition) {
    const schema = new mongoose.Schema(schemaDefinition, { timestamps: true });
    this.models[name] = mongoose.model(name, schema);
    return this.models[name];
  }

  getModel(name) {
    return this.models[name];
  }

  // CRUD operations
  async create(modelName, data) {
    return await this.models[modelName].create(data);
  }

  async find(modelName, filter = {}, options = {}) {
    let query = this.models[modelName].find(filter);
    if (options.sort) query = query.sort(options.sort);
    if (options.limit) query = query.limit(options.limit);
    if (options.skip) query = query.skip(options.skip);
    if (options.populate) query = query.populate(options.populate);
    return await query.exec();
  }

  async findOne(modelName, filter) {
    return await this.models[modelName].findOne(filter);
  }

  async findById(modelName, id) {
    return await this.models[modelName].findById(id);
  }

  async update(modelName, filter, data) {
    return await this.models[modelName].updateMany(filter, data);
  }

  async updateOne(modelName, filter, data) {
    return await this.models[modelName].findOneAndUpdate(filter, data, { new: true });
  }

  async delete(modelName, filter) {
    return await this.models[modelName].deleteMany(filter);
  }

  async deleteOne(modelName, filter) {
    return await this.models[modelName].findOneAndDelete(filter);
  }

  async aggregate(modelName, pipeline) {
    return await this.models[modelName].aggregate(pipeline);
  }

  async close() {
    await mongoose.disconnect();
  }
}
```

## Query Builder

```javascript
class QueryBuilder {
  constructor(table) {
    this.table = table;
    this._select = '*';
    this._where = [];
    this._orderBy = null;
    this._limit = null;
    this._offset = null;
    this._values = [];
  }

  select(...columns) {
    this._select = columns.join(', ');
    return this;
  }

  where(column, operator, value) {
    this._where.push(`${column} ${operator} ?`);
    this._values.push(value);
    return this;
  }

  andWhere(column, operator, value) {
    return this.where(column, operator, value);
  }

  orWhere(column, operator, value) {
    if (this._where.length > 0) {
      this._where[this._where.length - 1] = `(${this._where[this._where.length - 1]} OR ${column} ${operator} ?)`;
    }
    this._values.push(value);
    return this;
  }

  orderBy(column, direction = 'ASC') {
    this._orderBy = `${column} ${direction}`;
    return this;
  }

  limit(count) {
    this._limit = count;
    return this;
  }

  offset(count) {
    this._offset = count;
    return this;
  }

  toSQL() {
    let sql = `SELECT ${this._select} FROM ${this.table}`;
    if (this._where.length) sql += ` WHERE ${this._where.join(' AND ')}`;
    if (this._orderBy) sql += ` ORDER BY ${this._orderBy}`;
    if (this._limit) sql += ` LIMIT ${this._limit}`;
    if (this._offset) sql += ` OFFSET ${this._offset}`;
    return { sql, values: this._values };
  }
}

// Usage: new QueryBuilder('users').select('id', 'name').where('age', '>', 18).limit(10).toSQL()
```

## Migration Helper

```javascript
class MigrationRunner {
  constructor(db) {
    this.db = db;
    this.migrations = [];
  }

  addMigration(version, up, down) {
    this.migrations.push({ version, up, down });
  }

  async init() {
    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version TEXT PRIMARY KEY,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async getApplied() {
    return this.db.query('SELECT version FROM migrations ORDER BY version');
  }

  async run() {
    await this.init();
    const applied = (await this.getApplied()).map(m => m.version);

    for (const migration of this.migrations) {
      if (!applied.includes(migration.version)) {
        console.log(`Running migration ${migration.version}`);
        await migration.up(this.db);
        await this.db.insert('migrations', { version: migration.version });
      }
    }
  }

  async rollback(steps = 1) {
    const applied = await this.getApplied();
    const toRollback = applied.slice(-steps).reverse();

    for (const { version } of toRollback) {
      const migration = this.migrations.find(m => m.version === version);
      if (migration) {
        console.log(`Rolling back ${version}`);
        await migration.down(this.db);
        await this.db.delete('migrations', { version });
      }
    }
  }
}
```

## Usage Examples

```javascript
// SQLite
const sqlite = new SQLiteDB('app.db');
sqlite.createTable('users', { id: 'INTEGER PRIMARY KEY', name: 'TEXT', email: 'TEXT UNIQUE' });
sqlite.insert('users', { name: 'John', email: 'john@example.com' });
const users = sqlite.select('users', { name: 'John' });

// PostgreSQL
const pg = new PostgresDB({ host: 'localhost', database: 'myapp', user: 'user', password: 'pass' });
await pg.insert('users', { name: 'Jane', email: 'jane@example.com' });
await pg.transaction(async (client) => {
  await client.query('UPDATE accounts SET balance = balance - 100 WHERE id = $1', [1]);
  await client.query('UPDATE accounts SET balance = balance + 100 WHERE id = $1', [2]);
});

// MongoDB
const mongo = new MongoDB('mongodb://localhost:27017/myapp');
await mongo.connect();
mongo.defineModel('User', { name: String, email: { type: String, unique: true }, age: Number });
await mongo.create('User', { name: 'Bob', email: 'bob@example.com', age: 25 });
const adults = await mongo.find('User', { age: { $gte: 18 } }, { sort: { name: 1 } });

// Query Builder
const query = new QueryBuilder('orders')
  .select('id', 'total', 'status')
  .where('status', '=', 'pending')
  .where('total', '>', 100)
  .orderBy('created_at', 'DESC')
  .limit(10)
  .toSQL();
```
