import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — Zuhma",
  robots: { index: true, follow: true },
};

// ============================================================
// Política de Privacidad (Zuhma Med).
//
// AVISO PARA EL EQUIPO: plantilla completa pero debe ser revisada,
// adaptada y aprobada por un abogado antes de operar con datos reales
// — en especial lo relativo a datos personales sensibles de salud
// (LFPDPPP en México / GDPR si aplica). Sustituye todos los campos
// entre corchetes [ ... ]. Esta página es PÚBLICA e INDEXABLE a
// propósito: Google la exige para la verificación de la app OAuth.
//
// La sección "Datos obtenidos de Google" contiene la divulgación de
// "Uso limitado" (Limited Use) requerida por Google para autorizar los
// permisos de Google Calendar. No la elimines ni la debilites.
// ============================================================

const EFFECTIVE_DATE = "1 de mayo de 2026";
const VERSION = "2026-08-31";
const LEGAL_NAME = "Zuhma S.A.P.I. de C.V.";
const DOMICILIO =
  "Calle Recreo No. 13, Int. 201, Col. Actipan, Alcaldía Benito Juárez, C.P. 03230, Ciudad de México";
const CONTACTO = "soporte@zuhma.com";

interface Clause {
  title: string;
  content: (string | string[])[];
}

const CLAUSES: Clause[] = [
  {
    title: "1. Quién es responsable de tus datos",
    content: [
      "Zuhma Med es una plataforma de gestión para clínicas y consultorios operada por " +
        LEGAL_NAME +
        ", con domicilio en " +
        DOMICILIO +
        " (en adelante, \"Zuhma\", \"nosotros\"), accesible en medcrm.zuhma.online.",
      "Para los datos de sus pacientes, la clínica o profesional de la salud que usa la plataforma (el \"Cliente\") actúa como responsable de dichos datos, y Zuhma los trata únicamente como encargado, por cuenta y bajo las instrucciones del Cliente.",
      "Para cualquier duda sobre esta Política puedes escribirnos a " + CONTACTO + ".",
    ],
  },
  {
    title: "2. Qué datos tratamos",
    content: [
      "Tratamos las siguientes categorías de datos:",
      [
        "Datos de la cuenta y de usuarios: nombre, correo electrónico, teléfono, cargo/rol, foto de perfil y credenciales de acceso de los usuarios que la clínica habilita.",
        "Datos de pacientes que el Cliente registra: nombre, contacto, historia y notas clínicas, citas, fotos de consulta, facturación y demás información que el Cliente decide capturar. Pueden incluir datos personales sensibles de salud.",
        "Conversaciones de WhatsApp: los mensajes intercambiados entre la clínica y sus pacientes/contactos a través de la API oficial de WhatsApp Business (Meta).",
        "Datos de uso y técnicos: registros de inicio de sesión, dirección IP, dispositivo, y eventos necesarios para operar y asegurar el servicio.",
        "Datos obtenidos de Google (opcional): si un usuario conecta su Google Calendar, tratamos la información descrita en la sección 6.",
      ],
    ],
  },
  {
    title: "3. Para qué usamos los datos",
    content: [
      "Usamos los datos para: prestar y operar la plataforma; permitir la comunicación por WhatsApp; gestionar la agenda, el expediente y la facturación de la clínica; enviar notificaciones y recordatorios; brindar soporte; y mantener la seguridad, prevenir el fraude y cumplir obligaciones legales.",
      "No vendemos datos personales. No usamos el contenido clínico de los pacientes ni los datos de Google para publicidad, ni para entrenar modelos de inteligencia artificial generales.",
    ],
  },
  {
    title: "4. Con quién se comparten (encargados y terceros)",
    content: [
      "Para operar la plataforma nos apoyamos en proveedores que tratan datos por nuestra cuenta, bajo obligaciones de confidencialidad y seguridad:",
      [
        "Supabase — base de datos, autenticación y almacenamiento de archivos.",
        "Meta Platforms — API oficial de WhatsApp Business para el envío y recepción de mensajes.",
        "Google — integración opcional de Google Calendar y, en su caso, inicio de sesión con Google (ver sección 6).",
        "Proveedor de correo transaccional — para invitaciones y notificaciones por email.",
        "Proveedores de infraestructura y de inteligencia artificial — para hospedaje y funciones asistidas, cuando el Cliente las utiliza.",
      ],
      "También podremos divulgar datos cuando lo exija una autoridad competente o una obligación legal.",
    ],
  },
  {
    title: "5. Aislamiento entre clínicas",
    content: [
      "La plataforma es multi-tenant: los datos de cada clínica están aislados a nivel de base de datos mediante políticas de seguridad por fila (RLS). Una clínica no puede ver ni acceder a los datos de otra.",
    ],
  },
  {
    title: "6. Datos obtenidos de Google (Google Calendar e inicio de sesión)",
    content: [
      "Si conectas tu cuenta de Google, solicitamos los permisos mínimos necesarios:",
      [
        "google.auth/calendar.events — para crear, actualizar y cancelar en tu calendario las citas que agendas dentro de Zuhma Med.",
        "google.auth/calendar.freebusy — para consultar tus horarios ocupados y evitar dobles reservas.",
        "Al iniciar sesión con Google: tu identificador básico, nombre y correo, únicamente para autenticarte.",
      ],
      "No leemos el contenido de tus eventos (títulos, invitados o descripciones), no accedemos a otros calendarios y puedes desconectar la integración en cualquier momento desde Ajustes; al hacerlo dejamos de acceder a tu calendario.",
      "Uso limitado (Google): El uso y la transferencia que Zuhma Med hace de la información recibida de las APIs de Google se apega a la Política de Datos de Usuario de los Servicios de las APIs de Google (Google API Services User Data Policy), incluidos sus requisitos de Uso Limitado (Limited Use). En consecuencia, no usamos los datos de Google para publicidad, no los vendemos, no los transferimos salvo para operar o mejorar la función que los originó, para cumplir la ley o con tu consentimiento, y no los usamos para entrenar modelos de inteligencia artificial.",
    ],
  },
  {
    title: "7. Conservación de los datos",
    content: [
      "Conservamos los datos mientras la cuenta del Cliente esté activa y durante el tiempo necesario para cumplir las finalidades descritas y las obligaciones legales aplicables. A la terminación del servicio, los datos se eliminan o anonimizan en un plazo razonable, salvo obligación legal de conservarlos.",
      "Los tokens de acceso a Google se almacenan cifrados y se eliminan al desconectar la integración.",
    ],
  },
  {
    title: "8. Seguridad",
    content: [
      "Aplicamos medidas técnicas y organizativas para proteger los datos, incluyendo cifrado de secretos y tokens, control de acceso por roles, aislamiento por clínica (RLS), conexiones cifradas (HTTPS) y verificación de firmas en integraciones. Ningún sistema es completamente infalible, pero trabajamos para reducir los riesgos de forma continua.",
    ],
  },
  {
    title: "9. Tus derechos",
    content: [
      "Según la legislación aplicable, puedes solicitar el acceso, rectificación, cancelación u oposición al tratamiento de tus datos personales, así como la revocación del consentimiento y la portabilidad, cuando proceda.",
      "Si eres paciente de una clínica que usa Zuhma Med, dirige tu solicitud a la clínica, que es la responsable de tus datos; nosotros la apoyaremos como encargado. Para datos de tu cuenta de usuario, escríbenos a " +
        CONTACTO +
        ".",
    ],
  },
  {
    title: "10. Cookies y almacenamiento local",
    content: [
      "Usamos cookies y almacenamiento local del navegador estrictamente para mantener tu sesión iniciada y recordar preferencias de la interfaz (por ejemplo, el tema). No usamos cookies de publicidad ni de rastreo de terceros dentro de la aplicación.",
    ],
  },
  {
    title: "11. Menores de edad",
    content: [
      "La plataforma está dirigida a profesionales y personal de salud. Cuando una clínica registra datos de pacientes menores de edad, lo hace bajo su responsabilidad y conforme a la normatividad aplicable y al consentimiento de quien ejerce la patria potestad o tutela.",
    ],
  },
  {
    title: "12. Cambios a esta Política",
    content: [
      "Podemos actualizar esta Política para reflejar cambios en la plataforma o en la normatividad. Publicaremos la versión vigente en esta página, con su fecha de actualización. El uso continuado de la plataforma implica la aceptación de la versión vigente.",
    ],
  },
  {
    title: "13. Contacto",
    content: [
      "Para ejercer tus derechos o resolver dudas sobre esta Política de Privacidad, escríbenos a " +
        CONTACTO +
        ".",
    ],
  },
];

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-foreground">
      <h1 className="mb-2 text-2xl font-bold">Política de Privacidad</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Versión {VERSION} · Entrada en vigor: {EFFECTIVE_DATE}
      </p>

      <p className="mb-8 text-sm leading-relaxed">
        Esta Política describe cómo Zuhma Med, operada por {LEGAL_NAME}, trata
        los datos personales en la plataforma disponible en medcrm.zuhma.online.
        Léela con atención antes de utilizar la plataforma.
      </p>

      <div className="space-y-8">
        {CLAUSES.map((clause) => (
          <section key={clause.title}>
            <h2 className="mb-2 text-base font-semibold">{clause.title}</h2>
            <div className="space-y-3 text-sm leading-relaxed">
              {clause.content.map((block, i) =>
                Array.isArray(block) ? (
                  <ul key={i} className="ml-5 list-disc space-y-1">
                    {block.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i}>{block}</p>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
