-- Cuentas de Dineriko. El servidor nunca ve contraseñas ni datos: solo pruebas derivadas
-- (auth_hash, rec_hash) y llaves envueltas, generadas y cifradas en el dispositivo.
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  kdf_salt    TEXT NOT NULL,             -- sal para derivar la llave de la contraseña en el dispositivo
  kdf_iter    INTEGER NOT NULL,
  auth_hash   TEXT NOT NULL,             -- HMAC(pepper, prueba de contraseña)
  rec_hash    TEXT,                      -- HMAC(pepper, prueba del código de recuperación)
  wrapped     TEXT NOT NULL,             -- JSON con la llave de datos envuelta: { pass, rec }
  rev         INTEGER NOT NULL DEFAULT 0, -- contador de cambios para sincronizar
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  last_used   INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  device      TEXT
);
CREATE INDEX sessions_user ON sessions(user_id);

-- un registro por movimiento, categoría, fijo, meta… La clave y el valor van cifrados.
CREATE TABLE items (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  k        TEXT NOT NULL,
  v        TEXT,
  deleted  INTEGER NOT NULL DEFAULT 0,
  rev      INTEGER NOT NULL,
  PRIMARY KEY (user_id, k)
);
CREATE INDEX items_rev ON items(user_id, rev);

CREATE TABLE login_attempts (
  email      TEXT PRIMARY KEY,
  fails      INTEGER NOT NULL,
  first_at   INTEGER NOT NULL
);
