/* ── cifrado local ─────────────────────────────────────────────────────────
   Sobre de dos llaves: los datos se cifran con una clave aleatoria (DEK) y la
   DEK se guarda envuelta dos veces, por la contraseña y por Face ID. Así los
   dos caminos abren lo mismo y ninguno guarda nada utilizable en el disco.

   { enc:2, kdf, iter, salt, wrapped:{ pass:{iv,ct}, prf:{iv,ct,credId} }, iv, ct }
   ─────────────────────────────────────────────────────────────────────────── */
export const ITER = 600000;
export const PRF_SALT_TXT = "cuaderno-gastos-prf-v1";
const te = new TextEncoder();
const td = new TextDecoder();

export const cryptoOk = () => typeof crypto !== "undefined" && !!crypto.subtle;

export const b64 = (buf) => {
  const u = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
};
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/* clave a partir de la contraseña */
export async function kekFromPass(pass, salt, iter = ITER) {
  const base = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}
/* clave a partir de los 32 bytes que devuelve el passkey */
export const kekFromBytes = (bytes) =>
  crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

export const newDEK = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

export async function wrapDEK(dek, kek) {
  const raw = await crypto.subtle.exportKey("raw", dek);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return { iv: b64(iv), ct: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, raw)) };
}
export async function unwrapDEK(w, kek) {
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(w.iv) }, kek, unb64(w.ct));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}
export async function sealData(obj, dek, meta) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, te.encode(JSON.stringify(obj)));
  return JSON.stringify({ enc: 2, kdf: "PBKDF2-SHA256", iter: meta.iter, salt: meta.salt, wrapped: meta.wrapped, iv: b64(iv), ct: b64(ct) });
}
export async function openData(env, dek) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, dek, unb64(env.ct));
  return JSON.parse(td.decode(pt));
}
export const esSobre = (o) => !!o && (o.enc === 1 || o.enc === 2) && typeof o.ct === "string";
export const tieneBio = (o) => !!o?.wrapped?.prf;

/* ── Face ID / Touch ID vía passkey con extensión PRF ── */
export async function bioDisponible() {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (e) { return false; }
}

export async function prfObtener(credId) {
  const a = await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ id: unb64(credId), type: "public-key" }],
    userVerification: "required",
    timeout: 60000,
    extensions: { prf: { eval: { first: te.encode(PRF_SALT_TXT) } } },
  }});
  const r = a.getClientExtensionResults?.()?.prf?.results?.first;
  if (!r) throw new Error("sin-prf");
  return new Uint8Array(r);
}

export async function prfCrear() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: "Cosecha" },   // rp.id se toma del dominio actual (cambiar solo name es seguro, no invalida passkeys)
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "gastos", displayName: "Gastos" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
    timeout: 60000,
    extensions: { prf: { eval: { first: te.encode(PRF_SALT_TXT) } } },
  }});
  const ext = cred.getClientExtensionResults?.() || {};
  const credId = b64(cred.rawId);
  let bytes = ext.prf?.results?.first;
  if (bytes) return { credId, bytes: new Uint8Array(bytes) };
  // algunas plataformas solo confirman prf.enabled al crear: hace falta una segunda ceremonia
  if (!ext.prf?.enabled) throw new Error("sin-prf");
  return { credId, bytes: await prfObtener(credId) };
}
