/* ── Aviso de Privacidad de Dineriko ──
   Fuente única: lo usa la app (Ajustes → Datos y privacidad) y el script que genera la página
   pública dineriko.com/privacidad.html (scripts/privacidad.mjs), que es la que se da al App Store.
   Regla del proyecto: se actualiza cada vez que cambia cómo viajan los datos. */

export const CONTACTO = "rodrigoharmat@gmail.com";

export const PRIVACIDAD = {
  actualizado: "29 de octubre de 2026",
  resumen: [
    "Si usas Dineriko sin cuenta, tus datos no salen de tu dispositivo.",
    "Si creas una cuenta (es opcional), tus gastos se guardan en nuestro servidor cifrados con una llave que solo tienes tú. No podemos leerlos.",
    "De ti solo conocemos el email con el que creas la cuenta.",
    "Sin publicidad, sin analítica de terceros, sin cookies de seguimiento y sin venta de datos.",
  ],
  secciones: [
    {
      titulo: "1. Quién es el responsable",
      parrafos: [
        `El responsable del tratamiento es Rodrigo Eduard Harmat Gainza, con domicilio a efectos de contacto en Barcelona (España). Para cualquier cuestión sobre privacidad puedes escribir a ${CONTACTO}.`,
      ],
    },
    {
      titulo: "2. Si usas Dineriko sin cuenta",
      parrafos: [
        "Todo lo que anotas (gastos, ingresos, categorías, fijos, metas y ajustes) se guarda solo en tu dispositivo. Si activas la protección con contraseña, se guarda además cifrado con AES-GCM.",
        "El email que puedes escribir, de forma opcional, la primera vez que abres la app se queda guardado en tu dispositivo. Hoy no se envía a ningún sitio.",
        "Face ID, Touch ID y el resto de sistemas biométricos los gestiona tu propio dispositivo. Dineriko nunca recibe tus datos biométricos.",
        "Las copias de seguridad que creas son archivos tuyos: se guardan donde tú elijas y no pasan por nuestros sistemas.",
      ],
    },
    {
      titulo: "3. Si creas una cuenta",
      parrafos: [
        "La cuenta es opcional. Sirve para que tus datos no se pierdan si cambias o pierdes el móvil, y para usarlos en varios dispositivos.",
        "Qué datos tratamos:",
        { lista: [
          "Tu email, para identificar tu cuenta.",
          "Una prueba derivada de tu contraseña, que sirve para comprobar que eres tú. Tu contraseña nunca sale de tu dispositivo y no la conocemos.",
          "Tu llave de datos, guardada cifrada con tu contraseña y, por separado, con tu código de recuperación. Sin una de las dos no se puede abrir.",
          "Tus datos de la app, cifrados de extremo a extremo en tu dispositivo antes de enviarse. Esto incluye importes, conceptos, fechas y categorías, e incluso el nombre interno de cada registro, de modo que no podemos saber ni cuántos gastos tienes en un mes.",
          "Datos técnicos de funcionamiento: la fecha de alta y del último cambio, las sesiones abiertas (fecha y tipo de navegador o dispositivo) y los intentos fallidos de entrar (email y hora), que se borran al entrar correctamente o pasados 15 minutos.",
        ] },
        "Lo que no podemos ver: tu contraseña, tu código de recuperación ni el contenido de tus datos. Por eso tampoco podemos recuperarlos si pierdes las dos cosas.",
        "Para qué y con qué base legal: para prestarte la cuenta y sincronizar tus datos entre dispositivos, porque es necesario para darte el servicio que pides (artículo 6.1.b del RGPD); y para proteger las cuentas frente a accesos no autorizados, por nuestro interés legítimo en la seguridad del servicio (artículo 6.1.f del RGPD).",
        "Cuánto tiempo: mientras tengas la cuenta. Las sesiones caducan tras un año sin uso. Si borras la cuenta, sus datos se eliminan al momento del servidor y pueden quedar en las copias automáticas de restauración de la base de datos durante un máximo de 30 días, tras los cuales desaparecen.",
        "Si olvidas la contraseña, puedes elegir una nueva con tu código de recuperación. Si en el futuro ofrecemos otra forma de recuperar la cuenta, te lo explicaremos antes y podrás decidir si la quieres.",
      ],
    },
    {
      titulo: "4. Proveedores que intervienen",
      parrafos: [
        { lista: [
          "Cloudflare, Inc. aloja el servidor de cuentas como encargado del tratamiento. La base de datos está configurada para guardarse dentro de la Unión Europea. Como Cloudflare es una empresa de Estados Unidos y las peticiones pasan por su red global, puede haber transferencias internacionales, amparadas por el Marco de Privacidad de Datos UE-EE. UU. y por las cláusulas contractuales tipo de la Comisión Europea.",
          "GitHub, Inc. aloja la web dineriko.com. Como cualquier servidor web, recibe técnicamente la dirección IP de quien la visita para poder entregar la página.",
          "Apple distribuye la app de iPhone a través del App Store y TestFlight, y trata los datos de esa distribución según su propia política de privacidad.",
        ] },
      ],
    },
    {
      titulo: "5. Lo que nunca hacemos",
      parrafos: [
        { lista: [
          "No mostramos publicidad ni usamos píxeles publicitarios.",
          "No usamos analítica de terceros ni cookies de seguimiento.",
          "No vendemos ni cedemos tus datos a nadie.",
          "No tomamos decisiones automatizadas que te afecten.",
        ] },
      ],
    },
    {
      titulo: "6. Tus derechos",
      parrafos: [
        `Puedes pedir el acceso, la rectificación, la supresión, la limitación o la portabilidad de tus datos, u oponerte a su tratamiento, escribiendo a ${CONTACTO}. Te responderemos en el plazo de un mes.`,
        "Algunas cosas las puedes hacer tú directamente desde la app: borrar tu cuenta y todo lo guardado en el servidor (Ajustes → Tu cuenta → Borrar cuenta) y descargar todos tus datos en un archivo (Ajustes → Datos y privacidad → Guardar copia).",
        "Si crees que no hemos tratado bien tus datos, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).",
      ],
    },
    {
      titulo: "7. Menores",
      parrafos: [
        "Dineriko no está pensada para menores de 14 años. Si tienes menos de 14 años, no crees una cuenta.",
      ],
    },
    {
      titulo: "8. Seguridad",
      parrafos: [
        "Los datos de la cuenta se cifran en tu dispositivo con AES-GCM de 256 bits, con una llave que se deriva de tu contraseña (PBKDF2 con 600.000 iteraciones). Todas las conexiones van cifradas (HTTPS) y las entradas se bloquean temporalmente tras varios intentos fallidos.",
      ],
    },
    {
      titulo: "9. Cambios en este aviso",
      parrafos: [
        "Si cambia la forma en que tratamos tus datos, actualizaremos este aviso antes de que el cambio se aplique y te lo indicaremos dentro de la app.",
      ],
    },
  ],
};
