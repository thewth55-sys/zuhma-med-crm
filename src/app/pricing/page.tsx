import Link from "next/link";
import type { Metadata } from "next";
import { Check, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PLAN_CONFIG } from "@/lib/billing-platform/plans";
import { LocalPriceEstimate } from "@/components/pricing/local-price-estimate";

export const metadata: Metadata = {
  title: "Precios — Zentro Med",
  description: "Planes de Zentro Med: prueba gratis 30 días, CRM independiente por asiento, o el bundle Zentro Salud con marketing incluido.",
};

const numberFormatter = new Intl.NumberFormat("es-MX");

function patientLimitLabel(limit: number | null): string {
  return limit === null ? "Pacientes ilimitados" : `Hasta ${numberFormatter.format(limit)} pacientes activos`;
}

interface ExcludedFeature {
  label: string;
  note?: string;
}

interface PlanCardProps {
  badge: { label: string; className: string };
  title: string;
  price: string;
  /** Raw USD monthly price, for the local-currency estimate. Omit for $0. */
  priceUsd?: number;
  priceNote: string;
  features: string[];
  excluded?: ExcludedFeature[];
  cta: { label: string; href: string };
  variant?: "default" | "highlight" | "dark";
}

export default function PricingPage() {
  const standalone = PLAN_CONFIG.standalone;
  const starter = PLAN_CONFIG.zentro_salud_starter;
  const pro = PLAN_CONFIG.zentro_salud_pro;

  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          {/* The wordmark PNG bakes in black text, which disappears against
              the app's dark-mode default — an isotipo (color, mode-agnostic)
              plus real text (follows --foreground) works in both modes. */}
          <div className="mb-8 flex items-center justify-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
            <img src="/zentro-isotipo.png" alt="" className="h-7 w-7" />
            <span className="text-lg font-semibold text-foreground">Zentro</span>
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">Un CRM médico. Un solo proveedor.</h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            30 días de prueba sin tarjeta. Después, elige el CRM solo o el bundle
            Zentro Salud con marketing gestionado incluido.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <PlanCard
            badge={{ label: "30 DÍAS GRATIS", className: "border-sky-500/30 bg-sky-500/10 text-sky-400" }}
            title="Prueba gratuita"
            price="$0"
            priceNote="Sin tarjeta de crédito"
            features={[
              "Pipeline de pacientes (CRM)",
              "Agenda de citas online 24/7",
              "Perfil del contacto (citas + notas)",
              "Cotizaciones y cobros",
              "1 usuario incluido",
            ]}
            excluded={[{ label: "WhatsApp IA", note: "requiere plan de pago" }]}
            cta={{ label: "Empezar gratis", href: "/signup" }}
          />

          <PlanCard
            badge={{ label: "SOLO CRM", className: "border-border bg-muted text-muted-foreground" }}
            title="Zentro Med"
            price={`$${standalone.basePriceUsd}`}
            priceUsd={standalone.basePriceUsd}
            priceNote={`+$${standalone.seatPriceUsd} USD por usuario adicional`}
            features={[
              "Todo lo del plan gratuito",
              patientLimitLabel(standalone.patientLimit),
              "Automatizaciones y flows",
              "Recordatorios WhatsApp automáticos",
              "Soporte por WhatsApp",
            ]}
            excluded={[{ label: "Sin marketing gestionado" }]}
            cta={{ label: "Suscribirme", href: "/signup?plan=standalone" }}
          />

          <PlanCard
            badge={{ label: "★ MÁS POPULAR", className: "border-primary/40 bg-primary/10 text-primary" }}
            title="Zentro Salud Starter"
            price={`$${starter.basePriceUsd}`}
            priceUsd={starter.basePriceUsd}
            priceNote={`${starter.includedSeats} usuarios incluidos · +$${starter.seatPriceUsd}/usuario extra`}
            features={[
              "Todo lo de Zentro Med",
              patientLimitLabel(starter.patientLimit),
              "Contenido mensual (8 piezas + stories)",
              "Meta Ads gestionado",
              "Landing de especialidad",
              "Dashboard semanal",
              "Soporte prioritario 24h",
            ]}
            cta={{ label: "Empezar con Starter", href: "/signup?plan=zentro_salud_starter" }}
            variant="highlight"
          />

          <PlanCard
            badge={{ label: "PRO", className: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" }}
            title="Zentro Salud Pro"
            price={`$${pro.basePriceUsd}`}
            priceUsd={pro.basePriceUsd}
            priceNote={`${pro.includedSeats} usuarios incluidos · +$${pro.seatPriceUsd}/usuario extra`}
            features={[
              "Todo lo de Starter",
              patientLimitLabel(pro.patientLimit),
              "Google Ads + SEO local",
              "20 piezas + 6 reels/mes",
              "Dashboard captación vs. retención",
              "2 sesiones de estrategia/mes",
              "Account manager exclusivo · 4h respuesta",
            ]}
            cta={{ label: "Empezar con Pro", href: "/signup?plan=zentro_salud_pro" }}
            variant="dark"
          />
        </div>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Inicia sesión
          </Link>{" "}
          y activa tu plan desde Ajustes → Suscripción.
        </p>
      </div>
    </div>
  );
}

function PlanCard({ badge, title, price, priceUsd, priceNote, features, excluded, cta, variant = "default" }: PlanCardProps) {
  const isDark = variant === "dark";
  const isHighlight = variant === "highlight";

  return (
    <div
      className={`flex flex-col rounded-xl border p-6 ${
        isDark
          ? "border-transparent bg-neutral-950 text-neutral-50"
          : isHighlight
            ? "border-primary bg-primary/5 ring-1 ring-primary/40"
            : "border-border bg-card"
      }`}
    >
      <span
        className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badge.className}`}
      >
        {badge.label}
      </span>
      <h2 className={`mt-3 text-lg font-semibold ${isDark ? "text-neutral-50" : "text-foreground"}`}>{title}</h2>
      <p className={`mt-1 text-3xl font-bold ${isDark ? "text-neutral-50" : "text-foreground"}`}>
        {price}
        <span className={`text-sm font-normal ${isDark ? "text-neutral-400" : "text-muted-foreground"}`}>/mes</span>
      </p>
      {priceUsd ? <LocalPriceEstimate usd={priceUsd} /> : null}
      <p className={`mt-2 text-sm ${isDark ? "text-neutral-400" : "text-muted-foreground"}`}>{priceNote}</p>
      <ul className="mt-4 flex-1 space-y-2 border-t pt-4 border-inherit">
        {features.map((f) => (
          <li key={f} className={`flex items-start gap-2 text-sm ${isDark ? "text-neutral-100" : "text-foreground"}`}>
            <Check className={`mt-0.5 size-4 shrink-0 ${isDark ? "text-emerald-400" : "text-primary"}`} />
            {f}
          </li>
        ))}
        {excluded?.map((f) => (
          <li key={f.label} className="flex items-start gap-2 text-sm text-muted-foreground/70">
            <X className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
            <span>
              {f.label}
              {f.note ? <span className="ml-1 text-xs">({f.note})</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <Button
        render={<Link href={cta.href} />}
        className={`mt-6 w-full ${isDark ? "bg-emerald-500 text-neutral-950 hover:bg-emerald-400" : ""}`}
      >
        {isHighlight ? <Sparkles className="size-4" /> : null}
        {cta.label}
      </Button>
    </div>
  );
}
