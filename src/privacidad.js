/* ── Aviso de Privacidad de Dineriko ──
   Fuente única: lo usa la app (Ajustes → Datos y privacidad) y el script que genera la página
   pública dineriko.com/privacidad.html (scripts/privacidad.mjs), que es la que se da al App Store.
   Regla del proyecto: se actualiza cada vez que cambia cómo viajan los datos. */

export const CONTACTO = "rodrigoharmat@gmail.com";

export const PRIVACIDAD = {
  actualizado: "30 de octubre de 2026",
  resumen: [
    "Si usas Dineriko sin cuenta, tus datos no salen de tu dispositivo.",
    "Si creas una cuenta (es opcional), tus gastos se guardan en nuestro servidor cifrados con una llave que solo tienes tú. No podemos leerlos.",
    "De ti solo conocemos el email con el que creas la cuenta (o el que te asigna Apple o Google si entras con ellos).",
    "Si lo pierdes todo, puedes pedir que te devolvamos el acceso: hay 72 horas de espera, aviso por email y revisión a mano. Viene activado y lo puedes desactivar.",
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
          "Tu email, para identificar tu cuenta y para escribirte solo sobre ella (por ejemplo, si alguien pide recuperarla).",
          "Si entras con Apple o con Google: el identificador que nos dan de tu cuenta con ellos y tu email verificado. Apple y Google solo confirman quién eres; no nos dan ninguna contraseña ni acceso a nada más, y no pueden ver tus datos de Dineriko.",
          "Una prueba derivada de tu contraseña, que sirve para comprobar que eres tú. Tu contraseña nunca sale de tu dispositivo y no la conocemos.",
          "Tu llave de datos, guardada cifrada con tu contraseña (o con tu código de Dineriko si entras con Apple o Google) y, por separado, con tu código de recuperación. Si tienes activada la recuperación \"Lo he perdido todo\", se guarda además una tercera copia cifrada con una llave de repuesto partida en dos piezas (te lo explicamos más abajo).",
          "Tus datos de la app, cifrados de extremo a extremo en tu dispositivo antes de enviarse. Esto incluye importes, conceptos, fechas y categorías, e incluso el nombre interno de cada registro, de modo que no podemos saber ni cuántos gastos tienes en un mes.",
          "Datos técnicos de funcionamiento: la fecha de alta y del último cambio, las sesiones abiertas (fecha y tipo de navegador o dispositivo) y los intentos fallidos de entrar (email y hora), que se borran al entrar correctamente o pasados 15 minutos.",
        ] },
        "Lo que no podemos ver: tu contraseña, tu código de Dineriko, tu código de recuperación ni el contenido de tus datos.",
        "Para qué y con qué base legal: para prestarte la cuenta y sincronizar tus datos entre dispositivos, porque es necesario para darte el servicio que pides (artículo 6.1.b del RGPD); y para proteger las cuentas frente a accesos no autorizados, por nuestro interés legítimo en la seguridad del servicio (artículo 6.1.f del RGPD).",
        "Cuánto tiempo: mientras tengas la cuenta. Las sesiones caducan tras un año sin uso. Si borras la cuenta, sus datos se eliminan al momento del servidor y pueden quedar en las copias automáticas de restauración de la base de datos durante un máximo de 30 días, tras los cuales desaparecen.",
        "Si olvidas la contraseña, puedes elegir una nueva con tu código de recuperación. Es instantáneo y no interviene nadie más.",
      ],
    },
    {
      titulo: "3 bis. Si lo pierdes todo (recuperación con revisión)",
      parrafos: [
        "Si pierdes a la vez la contraseña y el código de recuperación, puedes pulsar \"Lo he perdido todo\". Esta opción viene activada al crear la cuenta y puedes desactivarla cuando quieras en Ajustes → Tu cuenta. Si la desactivas, nadie podrá abrir tus datos si pierdes las dos cosas, tampoco nosotros.",
        "Cómo funciona: al crear la cuenta, tu dispositivo genera una llave de repuesto partida en dos piezas. Una pieza se guarda cifrada de forma que solo la puede abrir el responsable del servicio con una llave maestra que guarda fuera del servidor. La otra la guarda el servidor y solo la entrega cuando una petición de recuperación se ha confirmado por email, han pasado 72 horas sin que nadie la cancele y el responsable la ha aprobado a mano. Cada cuenta tiene sus propias piezas.",
        "Durante el proceso te escribimos al email de la cuenta: para confirmar que eres tú, para avisarte de que hay una petición en marcha (con un enlace para cancelarla) y cuando se completa. En la cuenta queda anotada la fecha en que se recuperó el acceso.",
        "Lo que conviene que sepas: el responsable del servicio, como administrador del servidor y dueño de la llave maestra, podría técnicamente saltarse este procedimiento y abrir tus datos. No puede pasar por accidente y deja rastro, pero no es imposible. Si no quieres correr ese riesgo, desactiva la recuperación.",
        "Qué datos se tratan: las dos piezas de la llave de repuesto (cifradas), y de cada petición la fecha, su estado y una llave pública de un solo uso del dispositivo que la pidió. Las peticiones se conservan 30 días y se borran con la cuenta. Base legal: es parte del servicio que pides (artículo 6.1.b del RGPD).",
      ],
    },
    {
      titulo: "4. Proveedores que intervienen",
      parrafos: [
        { lista: [
          "Cloudflare, Inc. aloja el servidor de cuentas como encargado del tratamiento. La base de datos está configurada para guardarse dentro de la Unión Europea. Como Cloudflare es una empresa de Estados Unidos y las peticiones pasan por su red global, puede haber transferencias internacionales, amparadas por el Marco de Privacidad de Datos UE-EE. UU. y por las cláusulas contractuales tipo de la Comisión Europea.",
          "GitHub, Inc. aloja la web dineriko.com. Como cualquier servidor web, recibe técnicamente la dirección IP de quien la visita para poder entregar la página.",
          "Apple distribuye la app de iPhone a través del App Store y TestFlight, y trata los datos de esa distribución según su propia política de privacidad.",
          "Apple y Google, si eliges entrar con ellos, confirman tu identidad según sus propias políticas de privacidad. Dineriko no carga ningún código suyo en la app web: su página se abre en una ventana aparte.",
          "Resend, Inc. envía los emails sobre tu cuenta (por ejemplo, los de la recuperación) como encargado del tratamiento. Recibe tu email y el texto del mensaje, nunca tus datos de la app.",
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
