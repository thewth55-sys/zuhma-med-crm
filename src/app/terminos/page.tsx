import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones — Zuhma",
  robots: { index: false, follow: false },
};

// ============================================================
// Términos y Condiciones de la plataforma (Zuhma Med CRM).
//
// AVISO PARA EL EQUIPO: este documento es una PLANTILLA completa pero
// debe ser revisada, adaptada y aprobada por un abogado antes de operar
// con clientes reales — en especial las secciones de protección de datos
// (LFPDPPP / datos sensibles de salud) y de limitación de responsabilidad,
// cuyo alcance máximo lo fija la ley y no este texto. Sustituye todos los
// campos entre corchetes [ ... ]. Al cambiar el contenido, sube también
// TERMS_VERSION en src/lib/auth/activation-code.ts.
// ============================================================

const EFFECTIVE_DATE = "[FECHA DE ENTRADA EN VIGOR]";
const VERSION = "2026-07-22";
const LEGAL_NAME = "[RAZÓN SOCIAL COMPLETA], [tipo de sociedad]";
const RFC = "[RFC]";
const DOMICILIO = "[DOMICILIO FISCAL COMPLETO]";
const JURISDICCION = "[CIUDAD Y ESTADO]";
const CONTACTO = "[correo de contacto legal]";

interface Clause {
  title: string;
  content: (string | string[])[];
}

const CLAUSES: Clause[] = [
  {
    title: "1. Definiciones",
    content: [
      'Para efectos de estos Términos y Condiciones (los "Términos"):',
      [
        '"Zuhma", "nosotros" o "la Plataforma": ' + LEGAL_NAME + ", con RFC " + RFC + " y domicilio en " + DOMICILIO + ", titular y operador del software de gestión clínica y mensajería ofrecido a través de medcrm.zuhma.online.",
        '"Cliente" o "Usted": la persona física o moral que activa y utiliza una cuenta en la Plataforma, incluyendo la clínica, consultorio o profesional de la salud y sus usuarios autorizados.',
        '"Usuarios Autorizados": las personas que el Cliente habilita para acceder a su cuenta (médicos, recepción, administrativos, etc.).',
        '"Pacientes" o "Titulares": las personas cuyos datos el Cliente registra o gestiona a través de la Plataforma.',
        '"Contenido del Cliente": todos los datos, textos, imágenes, expedientes, mensajes y demás información que el Cliente o sus Pacientes ingresan o generan en la Plataforma.',
        '"Servicios de Terceros": servicios operados por terceros e integrados a la Plataforma (por ejemplo, Meta/WhatsApp, Google, proveedores de correo y proveedores de inteligencia artificial).',
      ],
    ],
  },
  {
    title: "2. Objeto y aceptación",
    content: [
      "Estos Términos regulan el acceso y uso de la Plataforma. Al activar una cuenta, marcar la casilla de aceptación, o utilizar la Plataforma por cualquier medio, el Cliente manifiesta que ha leído, entendido y aceptado íntegramente estos Términos, celebrando un acuerdo legalmente vinculante con Zuhma.",
      "Quien acepta estos Términos declara, bajo protesta de decir verdad, contar con capacidad legal y con facultades suficientes para obligar a la persona física o moral que representa.",
      "Si el Cliente no está de acuerdo con estos Términos, debe abstenerse de activar y utilizar la Plataforma.",
    ],
  },
  {
    title: "3. Descripción y naturaleza del servicio",
    content: [
      "La Plataforma es un software como servicio (SaaS) que provee herramientas de gestión para clínicas y profesionales de la salud, incluyendo agenda de citas, registros clínicos, gestión de pacientes, mensajería vía WhatsApp, facturación interna y funciones asistidas por inteligencia artificial, entre otras.",
      "La Plataforma se ofrece, en su caso, de forma gratuita como valor agregado dentro de la relación comercial del Cliente con Zuhma. Su carácter gratuito no genera obligación de continuidad, disponibilidad ni soporte, y refuerza el carácter 'tal cual' descrito en estos Términos.",
      "Zuhma podrá modificar, agregar, suspender o descontinuar cualquier función de la Plataforma en cualquier momento, sin responsabilidad alguna.",
    ],
  },
  {
    title: "4. Naturaleza de herramienta — no constituye asesoría ni dispositivo médico",
    content: [
      "La Plataforma es una herramienta administrativa y de organización. NO es un dispositivo médico, no realiza diagnósticos, no emite recomendaciones clínicas y no sustituye el juicio profesional del personal de salud.",
      "Toda decisión clínica, diagnóstica, terapéutica o de atención al Paciente es responsabilidad exclusiva del Cliente y de sus profesionales, quienes son los únicos responsables del ejercicio de la medicina conforme a la normatividad aplicable.",
      "La información mostrada por la Plataforma (incluyendo contenido generado por inteligencia artificial) no constituye asesoría médica, legal, fiscal ni profesional de ningún tipo, y no debe utilizarse como único fundamento para tomar decisiones.",
    ],
  },
  {
    title: "5. Cuentas, activación y credenciales",
    content: [
      "Las cuentas son creadas por Zuhma e activadas por el Cliente mediante un código de activación enviado a su correo, la definición de una contraseña y la aceptación de estos Términos.",
      "El Cliente es responsable de la veracidad de los datos proporcionados, de mantener la confidencialidad de sus credenciales y de toda actividad realizada bajo su cuenta y la de sus Usuarios Autorizados.",
      "El Cliente debe notificar de inmediato a Zuhma cualquier uso no autorizado o compromiso de seguridad de su cuenta. Zuhma no será responsable por pérdidas derivadas del incumplimiento de estas obligaciones.",
    ],
  },
  {
    title: "6. Licencia de uso",
    content: [
      "Zuhma otorga al Cliente una licencia limitada, personal, revocable, intransferible y no exclusiva para utilizar la Plataforma conforme a estos Términos, únicamente para sus fines internos de operación.",
      "Esta licencia no transfiere propiedad alguna sobre la Plataforma ni sobre su software, código, diseño o marcas.",
    ],
  },
  {
    title: "7. Uso aceptable y conductas prohibidas",
    content: [
      "El Cliente se obliga a utilizar la Plataforma conforme a la ley, a la moral y a estos Términos. Queda prohibido, de manera enunciativa mas no limitativa:",
      [
        "Usar la Plataforma para fines ilícitos, fraudulentos o no autorizados.",
        "Enviar mensajes no solicitados (spam), engañosos o que violen las políticas de WhatsApp/Meta o la legislación anti-spam y de telecomunicaciones aplicable.",
        "Cargar información falsa, difamatoria, o que infrinja derechos de terceros.",
        "Intentar acceder sin autorización a otras cuentas, sistemas o datos.",
        "Realizar ingeniería inversa, descompilar, copiar, revender o crear obras derivadas de la Plataforma.",
        "Introducir virus, código malicioso o sobrecargar la infraestructura.",
        "Utilizar la Plataforma para tratar datos de Pacientes sin el consentimiento y fundamento legal correspondientes.",
      ],
      "El incumplimiento de esta cláusula faculta a Zuhma a suspender o terminar la cuenta de inmediato, sin responsabilidad.",
    ],
  },
  {
    title: "8. Obligaciones y declaraciones del Cliente",
    content: [
      "El Cliente declara y garantiza que:",
      [
        "Cumple y cumplirá con toda la normatividad aplicable a su actividad, incluyendo la Ley General de Salud, las Normas Oficiales Mexicanas aplicables (entre ellas las relativas al expediente clínico), y la legislación fiscal, sanitaria y de protección de datos.",
        "Cuenta con el consentimiento y el fundamento legal necesarios para tratar los datos de sus Pacientes y para enviarles comunicaciones a través de la Plataforma.",
        "La información que ingresa es veraz y no infringe derechos de terceros.",
        "Es el único responsable del respaldo y conservación de su Contenido conforme a sus obligaciones legales.",
      ],
    ],
  },
  {
    title: "9. Protección de datos personales",
    content: [
      "En el tratamiento de datos personales de Pacientes, el Cliente actúa como RESPONSABLE y Zuhma como ENCARGADO, en términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento.",
      "El Cliente reconoce que los datos de salud son datos personales SENSIBLES y que su tratamiento requiere consentimiento expreso de los Titulares y un aviso de privacidad propio del Cliente. El Cliente es el único responsable de recabar dicho consentimiento y de atender los derechos ARCO (Acceso, Rectificación, Cancelación y Oposición) de sus Pacientes.",
      "Zuhma tratará los datos únicamente conforme a las instrucciones del Cliente y para prestar el servicio; no los utilizará para fines propios distintos, no los transferirá sin fundamento, y los suprimirá o devolverá al terminar la relación, salvo obligación legal de conservación.",
      "Zuhma implementará medidas de seguridad administrativas, técnicas y físicas razonables acordes al estado de la técnica; sin embargo, ningún sistema es completamente seguro y Zuhma no garantiza una seguridad absoluta ni la imposibilidad de vulneraciones.",
      "En caso de una vulneración de seguridad que afecte significativamente los datos, Zuhma notificará al Cliente sin demora injustificada para que este cumpla sus obligaciones de notificación frente a los Titulares y a la autoridad.",
      "El Cliente mantiene en todo momento el control y la titularidad de su Contenido y de los datos de sus Pacientes.",
    ],
  },
  {
    title: "10. Servicios de terceros",
    content: [
      "La Plataforma se integra con Servicios de Terceros (por ejemplo, Meta/WhatsApp, Google, proveedores de correo y de inteligencia artificial). El uso de dichos servicios está sujeto a los términos y políticas de cada tercero, que el Cliente se obliga a conocer y cumplir.",
      "Zuhma no controla ni es responsable de la disponibilidad, decisiones, cambios, suspensiones o sanciones de los terceros, incluyendo, de manera enunciativa, el bloqueo, restricción o baja de números de WhatsApp por parte de Meta, cambios en sus APIs, o interrupciones de dichos servicios.",
      "Cualquier reclamación relacionada con un Servicio de Terceros deberá dirigirse al tercero correspondiente.",
    ],
  },
  {
    title: "11. Funciones de inteligencia artificial",
    content: [
      "La Plataforma puede ofrecer funciones asistidas por inteligencia artificial (por ejemplo, sugerencias de respuesta o resúmenes).",
      "Los resultados generados por inteligencia artificial pueden ser inexactos, incompletos o inapropiados. Se proporcionan únicamente como apoyo y REQUIEREN revisión y validación humana antes de utilizarse. El Cliente es el único responsable de todo contenido que decida enviar o utilizar.",
      "Zuhma no garantiza la exactitud de dichos resultados y no será responsable por las consecuencias de su uso.",
    ],
  },
  {
    title: "12. Mensajería y comunicaciones",
    content: [
      "El Cliente es el único responsable del contenido de los mensajes que envía a través de la Plataforma y de contar con el consentimiento de los destinatarios.",
      "El Cliente se obliga a cumplir las políticas de WhatsApp Business y de Meta, así como la legislación aplicable en materia de publicidad, telecomunicaciones y protección al consumidor. Zuhma no será responsable por sanciones derivadas del incumplimiento del Cliente.",
    ],
  },
  {
    title: "13. Propiedad intelectual",
    content: [
      "La Plataforma, su software, código fuente, diseño, interfaces, marcas, logotipos y demás elementos son propiedad exclusiva de Zuhma o de sus licenciantes y están protegidos por la legislación de propiedad intelectual. Estos Términos no conceden al Cliente derecho alguno sobre ellos salvo la licencia limitada de uso.",
      "El Contenido del Cliente es y seguirá siendo propiedad del Cliente. El Cliente otorga a Zuhma una licencia limitada para alojar, procesar y transmitir dicho Contenido con el único fin de prestar el servicio.",
      "El Cliente autoriza a Zuhma a utilizar datos agregados y anonimizados (que no identifiquen a personas) para operar, mejorar y analizar la Plataforma.",
    ],
  },
  {
    title: "14. Disponibilidad y mantenimiento",
    content: [
      "La Plataforma se ofrece sin garantía de disponibilidad ininterrumpida. Zuhma no ofrece un acuerdo de nivel de servicio (SLA) ni garantiza tiempos de actividad, respuesta o corrección de errores.",
      "Zuhma podrá realizar mantenimientos, actualizaciones o suspensiones, programadas o no, sin responsabilidad, procurando reducir su impacto cuando sea razonablemente posible.",
    ],
  },
  {
    title: "15. Exclusión de garantías",
    content: [
      'La Plataforma se proporciona "TAL CUAL" y "SEGÚN DISPONIBILIDAD", con todos sus posibles defectos.',
      "En la máxima medida permitida por la ley, Zuhma rechaza toda garantía, expresa o implícita, incluyendo garantías de comerciabilidad, idoneidad para un fin particular, exactitud, integridad, no infracción y funcionamiento ininterrumpido o libre de errores.",
      "El Cliente utiliza la Plataforma bajo su propio riesgo y es responsable de evaluar su idoneidad para sus fines.",
    ],
  },
  {
    title: "16. Limitación de responsabilidad",
    content: [
      "En la máxima medida permitida por la ley, Zuhma, sus socios, administradores, empleados y proveedores NO serán responsables por daños indirectos, incidentales, especiales, consecuenciales o punitivos, ni por lucro cesante, pérdida de datos, pérdida de clientela, interrupción de negocio o daño reputacional, aun habiendo sido advertidos de su posibilidad.",
      "La responsabilidad total y acumulada de Zuhma derivada de o relacionada con la Plataforma y estos Términos no excederá, a elección de Zuhma, el equivalente a las cantidades efectivamente pagadas por el Cliente a Zuhma por el servicio en los tres (3) meses anteriores al evento que originó la reclamación o, si el servicio se prestó de forma gratuita, la cantidad de $1,000.00 M.N. (mil pesos 00/100 moneda nacional).",
      "Nada en estos Términos limita o excluye la responsabilidad que, conforme a la legislación aplicable, no pueda válidamente limitarse o excluirse (por ejemplo, la derivada de dolo o mala fe).",
    ],
  },
  {
    title: "17. Indemnización",
    content: [
      "El Cliente se obliga a sacar en paz y a salvo, defender e indemnizar a Zuhma y a sus partes relacionadas frente a cualquier reclamación, demanda, sanción, daño, pérdida, gasto u honorario (incluidos los legales razonables) que derive de:",
      [
        "El incumplimiento de estos Términos o de la ley por parte del Cliente o sus Usuarios Autorizados.",
        "El Contenido del Cliente y el tratamiento de datos de sus Pacientes.",
        "Las comunicaciones enviadas a través de la Plataforma.",
        "La violación de derechos de terceros.",
      ],
    ],
  },
  {
    title: "18. Suspensión y terminación",
    content: [
      "Zuhma podrá suspender o terminar el acceso del Cliente, total o parcialmente, de forma inmediata y sin responsabilidad, cuando exista incumplimiento de estos Términos, riesgo de seguridad, requerimiento legal, o a discreción de Zuhma con aviso razonable cuando el servicio sea gratuito.",
      "El Cliente podrá dejar de usar la Plataforma en cualquier momento y solicitar la baja de su cuenta.",
    ],
  },
  {
    title: "19. Efectos de la terminación",
    content: [
      "Al terminar la relación, cesará el derecho de uso del Cliente. Zuhma podrá poner a disposición del Cliente una exportación de su Contenido durante un periodo razonable y posteriormente podrá eliminarlo, salvo obligación legal de conservación.",
      "El Cliente es el único responsable de exportar y conservar su Contenido conforme a sus obligaciones legales antes de la baja.",
      "Sobrevivirán a la terminación las cláusulas que por su naturaleza deban permanecer vigentes (propiedad intelectual, protección de datos, exclusión de garantías, limitación de responsabilidad, indemnización, confidencialidad, ley aplicable y jurisdicción).",
    ],
  },
  {
    title: "20. Confidencialidad",
    content: [
      "Cada parte se obliga a mantener la confidencialidad de la información no pública de la otra a la que tenga acceso, y a utilizarla únicamente para los fines de estos Términos, salvo requerimiento legal o autorización previa.",
    ],
  },
  {
    title: "21. Modificaciones",
    content: [
      "Zuhma podrá modificar estos Términos y el servicio en cualquier momento. Las modificaciones surtirán efecto a partir de su publicación en esta página o de la notificación al Cliente.",
      "El uso continuado de la Plataforma tras la entrada en vigor de las modificaciones implica su aceptación. Si el Cliente no está de acuerdo, deberá dejar de usar la Plataforma.",
    ],
  },
  {
    title: "22. Comunicaciones electrónicas",
    content: [
      "El Cliente acepta recibir comunicaciones por medios electrónicos (correo y notificaciones dentro de la Plataforma) y reconoce que estas satisfacen cualquier requisito legal de comunicación por escrito.",
    ],
  },
  {
    title: "23. Caso fortuito y fuerza mayor",
    content: [
      "Zuhma no será responsable por incumplimientos o retrasos derivados de causas fuera de su control razonable, incluyendo fallas de terceros o de internet, ciberataques, cortes de energía, actos de autoridad, desastres naturales o pandemias.",
    ],
  },
  {
    title: "24. Cesión",
    content: [
      "El Cliente no podrá ceder estos Términos ni sus derechos u obligaciones sin consentimiento previo por escrito de Zuhma. Zuhma podrá cederlos libremente a sus afiliadas o en el marco de una reorganización o transmisión de activos.",
    ],
  },
  {
    title: "25. Disposiciones generales",
    content: [
      "Si alguna cláusula se declara inválida o inaplicable, las demás continuarán en pleno vigor, y dicha cláusula se interpretará en la medida que mejor refleje la intención original dentro de lo permitido por la ley.",
      "La tolerancia o falta de ejercicio de un derecho por parte de Zuhma no implica renuncia al mismo.",
      "Estos Términos, junto con el aviso de privacidad y las políticas referidas, constituyen el acuerdo íntegro entre las partes respecto de su objeto y sustituyen cualquier acuerdo previo.",
    ],
  },
  {
    title: "26. Ley aplicable y jurisdicción",
    content: [
      "Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos.",
      "Para la interpretación y cumplimiento de estos Términos, las partes se someten expresamente a la jurisdicción de los tribunales competentes de " + JURISDICCION + ", renunciando a cualquier otro fuero que pudiera corresponderles por su domicilio presente o futuro.",
    ],
  },
  {
    title: "27. Contacto",
    content: [
      "Para cualquier duda sobre estos Términos, contacte a Zuhma en " + CONTACTO + ".",
    ],
  },
];

export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-foreground">
      <h1 className="mb-2 text-2xl font-bold">Términos y Condiciones</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Versión {VERSION} · Entrada en vigor: {EFFECTIVE_DATE}
      </p>

      <p className="mb-8 text-sm leading-relaxed">
        Los presentes Términos y Condiciones regulan el acceso y uso de la
        plataforma operada por {LEGAL_NAME}. Lea este documento con atención
        antes de activar y utilizar la Plataforma.
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
