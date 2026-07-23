import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Términos y Condiciones — Zuhma",
  robots: { index: false, follow: false },
};

// PLACEHOLDER — reemplaza este contenido con los Términos y Condiciones
// legales reales de Zuhma antes de operar con clientes. La casilla de
// aceptación en /activar enlaza aquí.
export default function TerminosPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-foreground">
      <h1 className="mb-2 text-2xl font-bold">Términos y Condiciones</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Última actualización: por definir · Versión 2026-07-22
      </p>

      <div className="space-y-6 text-sm leading-relaxed">
        <p className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-muted-foreground">
          Este es un texto de marcador de posición. Sustitúyelo por los
          Términos y Condiciones legales definitivos de Zuhma. Cuando el
          documento cambie, actualiza también <code>TERMS_VERSION</code> en{" "}
          <code>src/lib/auth/activation-code.ts</code> para registrar qué
          versión aceptó cada usuario.
        </p>

        <section>
          <h2 className="mb-1 text-base font-semibold">1. Aceptación</h2>
          <p>
            Al activar una cuenta y utilizar la plataforma, el usuario acepta
            estos Términos y Condiciones.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold">2. Uso del servicio</h2>
          <p>
            La plataforma se ofrece como herramienta de gestión para clínicas.
            El usuario es responsable del uso adecuado de su cuenta y de la
            información de sus pacientes.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold">3. Privacidad de datos</h2>
          <p>
            El tratamiento de datos personales se rige por la Política de
            Privacidad de Zuhma.
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold">4. Contacto</h2>
          <p>Para dudas sobre estos términos, contacta a Zuhma.</p>
        </section>
      </div>
    </main>
  );
}
