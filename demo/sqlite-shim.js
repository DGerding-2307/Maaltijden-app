// Browser-vervanger voor node:sqlite (DatabaseSync) op basis van sql.js (SQLite in JavaScript).
// Alleen het deel van de API dat de app gebruikt: exec, prepare().get/all/run.

const norm = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

export class DatabaseSync {
  constructor() {
    const SQL = globalThis.__SQL;
    this.db = globalThis.__SAVED_DB ? new SQL.Database(globalThis.__SAVED_DB) : new SQL.Database();
    globalThis.__DEMO_DB = this.db;
  }

  exec(sql) {
    this.db.exec(sql);
  }

  prepare(sql) {
    const db = this.db;
    return {
      get: (...params) => {
        const s = db.prepare(sql);
        try {
          s.bind(norm(params));
          return s.step() ? s.getAsObject() : undefined;
        } finally { s.free(); }
      },
      all: (...params) => {
        const s = db.prepare(sql);
        try {
          s.bind(norm(params));
          const rows = [];
          while (s.step()) rows.push(s.getAsObject());
          return rows;
        } finally { s.free(); }
      },
      run: (...params) => {
        const s = db.prepare(sql);
        try {
          s.run(norm(params));
        } finally { s.free(); }
        const changes = db.getRowsModified();
        const id = db.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0;
        return { changes, lastInsertRowid: id };
      },
    };
  }
}
