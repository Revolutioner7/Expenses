/* Cada Mac de GitHub es nuevo y vacío, así que Xcode crea un certificado de desarrollo en cada
   compilación y nunca reutiliza el anterior. Apple limita cuántos puede haber, y al llegar al tope
   la compilación falla ("Your account has reached the maximum number of certificates").
   Este script revoca, antes de compilar y solo cuando ya hay 8 o más, los certificados de DESARROLLO que creó Xcode con la
   clave de la API ("Created via API"). Nunca toca los de distribución ni los creados a mano.
   Revocar uno de desarrollo no afecta a la app publicada ni a TestFlight.

   Variables: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (archivo .p8). */
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
const b64u = (x) => Buffer.from(x).toString("base64url");

function token() {
  const ahora = Math.floor(Date.now() / 1000);
  const cab = b64u(JSON.stringify({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" }));
  const cuerpo = b64u(JSON.stringify({ iss: ASC_ISSUER_ID, iat: ahora, exp: ahora + 600, aud: "appstoreconnect-v1" }));
  const firma = createSign("sha256").update(`${cab}.${cuerpo}`).sign({ key: readFileSync(ASC_KEY_PATH), dsaEncoding: "ieee-p1363" });
  return `${cab}.${cuerpo}.${b64u(firma)}`;
}

const API = "https://api.appstoreconnect.apple.com/v1";
const cabeceras = { Authorization: `Bearer ${token()}` };

const r = await fetch(`${API}/certificates?limit=200&filter[certificateType]=DEVELOPMENT,IOS_DEVELOPMENT`, { headers: cabeceras });
if (!r.ok) {
  console.log(`::warning::No se pudieron listar los certificados (${r.status}). Se sigue igualmente.`);
  process.exit(0);
}
const { data } = await r.json();
const deXcode = data.filter((c) => /created via api/i.test(c.attributes?.name || "") || /created via api/i.test(c.attributes?.displayName || ""));
console.log(`::notice::Certificados de desarrollo: ${data.length} (${data.map((c) => c.attributes?.displayName || c.attributes?.name).join(" | ")}); creados por Xcode con la API: ${deXcode.length}`);
// cada revocación manda un email a Rodrigo: solo se limpia al acercarse al tope (Apple corta en 10),
// así llega una tanda de emails cada varias versiones en lugar de uno por versión
const UMBRAL = 8;
if (data.length < UMBRAL) {
  console.log(`::notice::Hay ${data.length} certificados de desarrollo; no se revoca nada hasta llegar a ${UMBRAL}.`);
  process.exit(0);
}
for (const c of deXcode) {
  const d = await fetch(`${API}/certificates/${c.id}`, { method: "DELETE", headers: cabeceras });
  console.log(`::notice::${d.ok ? "Revocado" : `No se pudo revocar (${d.status})`}: ${c.attributes?.displayName || c.attributes?.name} · caduca ${c.attributes?.expirationDate?.slice(0, 10)}`);
}
