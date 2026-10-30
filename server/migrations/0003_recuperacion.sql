-- "Lo he perdido todo". escrow guarda las dos piezas de la llave de repuesto: "a" cifrada para la
-- llave maestra de Rodrigo (el servidor no la puede abrir) y "s", que solo se entrega tras 72 horas
-- sin cancelación y con la aprobación de Rodrigo. Sin escrow, la cuenta no tiene recuperación.
ALTER TABLE users ADD COLUMN escrow TEXT;
ALTER TABLE users ADD COLUMN recuperada_en INTEGER;

CREATE TABLE recoveries (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  poll_hash     TEXT NOT NULL,          -- el dispositivo que pidió la recuperación pregunta con esto
  confirm_hash  TEXT NOT NULL,          -- enlace del primer email
  cancel_hash   TEXT NOT NULL,          -- enlace "no he sido yo"
  device_pub    TEXT NOT NULL,          -- llave pública de un solo uso del dispositivo (JWK)
  estado        TEXT NOT NULL,          -- pendiente | esperando | aprobada | completada | cancelada | caducada
  sello         TEXT,                   -- la pieza A, vuelta a cifrar por Rodrigo para ese dispositivo
  created_at    INTEGER NOT NULL,
  confirmed_at  INTEGER,
  ready_at      INTEGER,
  approved_at   INTEGER,
  done_at       INTEGER
);
CREATE INDEX recoveries_user ON recoveries(user_id);
CREATE INDEX recoveries_estado ON recoveries(estado, ready_at);
