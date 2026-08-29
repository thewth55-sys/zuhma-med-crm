import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import {
  MessageCircle,
  Phone,
  MapPin,
  Mail,
  Camera,
  Users,
  Globe,
  Music2,
  Plus,
} from "lucide-react";

import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { getPublicBookingConfig } from "@/lib/scheduling/public-booking";
import { BookingWidget } from "@/components/public-booking/booking-widget";

export const metadata: Metadata = { title: "Agendar cita" };

const DEFAULT_ACCENT = "#F94B5A";

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export default async function PublicBookingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const config = await getPublicBookingConfig(supabaseAdmin(), slug);

  if (!config) notFound();

  const p = config.page ?? {};
  const accent = p.accentColor || DEFAULT_ACCENT;
  const logo = p.logoUrl || config.accountLogoUrl;
  const headline = p.headline || config.accountName;
  const tagline = p.tagline;
  const cover = p.coverImageUrl;
  const coverColor = p.coverColor || accent;
  const showServices = p.showServices !== false;
  const address = p.showAddress === false ? null : config.address;

  // Aplica el color de acento de la clínica sobreescribiendo los tokens
  // del tema en este subárbol (recolorea el widget de reserva completo).
  const accentVars = {
    "--primary": accent,
    "--primary-hover": accent,
    "--primary-foreground": "#ffffff",
    "--ring": accent,
    "--primary-soft": `color-mix(in srgb, ${accent} 12%, transparent)`,
    "--primary-soft-2": `color-mix(in srgb, ${accent} 22%, transparent)`,
  } as CSSProperties;

  const contact = p.contact ?? {};
  const social = p.social ?? {};
  const mapHref =
    contact.mapUrl || (address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : null);

  const socialLinks = [
    { url: social.instagram, Icon: Camera, label: "Instagram" },
    { url: social.facebook, Icon: Users, label: "Facebook" },
    { url: social.tiktok, Icon: Music2, label: "TikTok" },
    { url: social.web, Icon: Globe, label: "Sitio web" },
  ].filter((s) => !!s.url);

  return (
    <div style={accentVars} className="min-h-screen bg-muted/40 px-4 py-8 text-foreground">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card">
        {/* Portada + logo */}
        <div
          className="relative h-28 bg-center bg-cover"
          style={cover ? { backgroundImage: `url(${cover})` } : { backgroundColor: coverColor }}
        >
          <div className="absolute -bottom-9 left-1/2 flex size-[72px] -translate-x-1/2 items-center justify-center overflow-hidden rounded-full border-[3px] border-card bg-primary-soft">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- account-controlled upload
              <img src={logo} alt="" className="size-full object-cover" />
            ) : (
              <Plus className="size-9" style={{ color: accent }} />
            )}
          </div>
        </div>

        {/* Cabecera */}
        <div className="px-5 pb-2 pt-12 text-center">
          <h1 className="text-lg font-semibold">{headline}</h1>
          {tagline ? <p className="mt-0.5 text-sm text-muted-foreground">{tagline}</p> : null}
          {p.bio ? (
            <p className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{p.bio}</p>
          ) : null}
        </div>

        {/* Botones de contacto (estilo link-bio) */}
        <div className="flex flex-col gap-2 px-5 pb-1 pt-3">
          {contact.whatsapp ? (
            <a
              href={`https://wa.me/${onlyDigits(contact.whatsapp)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium"
              style={{ border: `1.5px solid ${accent}`, color: accent }}
            >
              <MessageCircle className="size-[18px]" /> Escríbenos por WhatsApp
            </a>
          ) : null}
          {(contact.phone || mapHref || socialLinks.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {contact.phone ? (
                <a
                  href={`tel:${contact.phone}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border px-3 py-2.5 text-xs font-medium"
                >
                  <Phone className="size-4" style={{ color: accent }} /> Llamar
                </a>
              ) : null}
              {mapHref ? (
                <a
                  href={mapHref}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border px-3 py-2.5 text-xs font-medium"
                >
                  <MapPin className="size-4" style={{ color: accent }} /> Cómo llegar
                </a>
              ) : null}
              {contact.email ? (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border px-3 py-2.5 text-xs font-medium"
                >
                  <Mail className="size-4" style={{ color: accent }} /> Correo
                </a>
              ) : null}
              {socialLinks.map(({ url, Icon, label }) => (
                <a
                  key={label}
                  href={url!}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border px-3 py-2.5 text-xs font-medium"
                >
                  <Icon className="size-4" style={{ color: accent }} /> {label}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Widget de reserva (CTA principal) */}
        <div className="p-4">
          <BookingWidget slug={slug} config={config} />
        </div>

        {/* Tarjetas de servicios */}
        {showServices && config.serviceTypes.length > 0 ? (
          <div className="px-4 pb-4">
            <p className="mb-2 ml-1 text-xs text-muted-foreground">Nuestros servicios</p>
            <div className="grid grid-cols-2 gap-2">
              {config.serviceTypes.slice(0, 6).map((s) => (
                <div key={s.id} className="rounded-xl border border-border p-3">
                  <Plus className="size-[18px]" style={{ color: accent }} />
                  <div className="mt-1 text-xs font-medium">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">{s.duration_minutes} min</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Footer */}
        {address ? (
          <div className="border-t border-border px-5 py-3 text-center text-[11px] text-muted-foreground">
            {address}
          </div>
        ) : null}
      </div>
    </div>
  );
}
