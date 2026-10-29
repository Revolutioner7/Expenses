-- Entrar con Apple o Google. Apple y Google solo confirman quién es la persona: los datos siguen
-- cifrados con el código de Dineriko que elige el usuario (va por la misma vía que una contraseña).
CREATE TABLE identities (
  provider    TEXT NOT NULL,              -- "apple" | "google"
  sub         TEXT NOT NULL,              -- identificador estable que da Apple o Google
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (provider, sub)
);
CREATE INDEX identities_user ON identities(user_id);
