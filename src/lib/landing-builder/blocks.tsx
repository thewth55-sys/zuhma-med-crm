import type { ComponentConfig } from "@puckeditor/core";
import { sanitizeHref } from "./safe-url";

/**
 * The block catalog for the landing page builder — VISUAL OUTPUT ONLY
 * (`render` + `defaultProps`, deliberately no `fields`). This module
 * is imported by the public `/site/[slug]` SERVER page, so it must
 * stay free of hooks/browser-only code — Next's RSC bundler statically
 * rejects any hook import reachable from a server component's import
 * graph, which is exactly what happened when the image-upload/color
 * custom fields (hook-based, see custom-fields.tsx) lived here.
 *
 * The editable `fields` for each of these blocks are defined
 * separately in editor-config.tsx (a "use client" module used only by
 * the two Puck editor components), which spreads these render configs
 * and layers `fields` on top. Puck's `fields` key is optional and
 * never read by the RSC-safe `<Render>` used on the public page, so
 * omitting it here costs nothing there.
 *
 * Blocks read the app's `--primary`/`--muted` etc. CSS variables by
 * default (see globals.css) so an unedited page still looks on-brand,
 * but accept optional `backgroundColor`/`buttonColor` overrides —
 * applied as inline styles, since a page-specific color can't come
 * from a shared CSS class.
 */

export interface HeroProps {
  headline: string;
  subheadline?: string;
  imageUrl?: string;
  ctaText?: string;
  ctaHref?: string;
  backgroundColor?: string;
  buttonColor?: string;
}

export const Hero: ComponentConfig<HeroProps> = {
  defaultProps: {
    headline: "Bienvenido a nuestra clínica",
    subheadline: "Atención médica de calidad, cerca de ti.",
    ctaText: "Agendar cita",
    ctaHref: "#",
  },
  render: ({ headline, subheadline, imageUrl, ctaText, ctaHref, backgroundColor, buttonColor }) => (
    <section
      className="flex flex-col items-center gap-6 px-6 py-16 text-center"
      style={backgroundColor ? { backgroundColor } : undefined}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary editor-supplied URL
        <img src={imageUrl} alt="" className="h-32 w-32 rounded-full object-cover" />
      ) : null}
      <h1 className="text-3xl font-bold text-foreground sm:text-4xl">{headline}</h1>
      {subheadline ? <p className="max-w-xl text-lg text-muted-foreground">{subheadline}</p> : null}
      {ctaText && sanitizeHref(ctaHref) ? (
        <a
          href={sanitizeHref(ctaHref)}
          className="rounded-lg px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
          style={{ backgroundColor: buttonColor || "var(--primary)" }}
        >
          {ctaText}
        </a>
      ) : null}
    </section>
  ),
};

export interface ContactCTAProps {
  heading?: string;
  whatsappNumber?: string;
  message?: string;
  backgroundColor?: string;
  buttonColor?: string;
}

export const ContactCTA: ComponentConfig<ContactCTAProps> = {
  defaultProps: {
    heading: "¿Tienes dudas? Escríbenos",
    message: "Hola, quisiera más información.",
  },
  render: ({ heading, whatsappNumber, message, backgroundColor, buttonColor }) => {
    const href = whatsappNumber
      ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}${
          message ? `?text=${encodeURIComponent(message)}` : ""
        }`
      : null;
    return (
      <section
        className="flex flex-col items-center gap-4 px-6 py-12 text-center"
        style={{ backgroundColor: backgroundColor || "var(--muted)" }}
      >
        {heading ? <h2 className="text-2xl font-semibold text-foreground">{heading}</h2> : null}
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
            style={{ backgroundColor: buttonColor || "var(--primary)" }}
          >
            Escríbenos por WhatsApp
          </a>
        ) : null}
      </section>
    );
  },
};

export interface ServiceListProps {
  title?: string;
  items: { name: string; description?: string }[];
  backgroundColor?: string;
}

export const ServiceList: ComponentConfig<ServiceListProps> = {
  defaultProps: {
    title: "Nuestros servicios",
    items: [{ name: "Consulta general", description: "" }],
  },
  render: ({ title, items, backgroundColor }) => (
    <section className="px-6 py-12" style={backgroundColor ? { backgroundColor } : undefined}>
      {title ? <h2 className="mb-6 text-center text-2xl font-semibold text-foreground">{title}</h2> : null}
      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {(items ?? []).map((item, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <p className="font-medium text-foreground">{item.name}</p>
            {item.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  ),
};

export interface TestimonialProps {
  quote: string;
  author?: string;
}

export const Testimonial: ComponentConfig<TestimonialProps> = {
  defaultProps: {
    quote: "Excelente atención, muy recomendado.",
  },
  render: ({ quote, author }) => (
    <section className="mx-auto max-w-xl px-6 py-12 text-center">
      <p className="text-lg italic text-foreground">&ldquo;{quote}&rdquo;</p>
      {author ? <p className="mt-3 text-sm text-muted-foreground">— {author}</p> : null}
    </section>
  ),
};

export interface DoctorBioProps {
  name: string;
  title?: string;
  photoUrl?: string;
  bio?: string;
}

export const DoctorBio: ComponentConfig<DoctorBioProps> = {
  defaultProps: {
    name: "Dr. Nombre Apellido",
  },
  render: ({ name, title, photoUrl, bio }) => (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-12 text-center">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary editor-supplied URL
        <img src={photoUrl} alt="" className="h-28 w-28 rounded-full object-cover" />
      ) : null}
      <h3 className="text-xl font-semibold text-foreground">{name}</h3>
      {title ? <p className="text-sm text-primary">{title}</p> : null}
      {bio ? <p className="text-sm text-muted-foreground">{bio}</p> : null}
    </section>
  ),
};

export interface GalleryProps {
  images: { url?: string }[];
}

export const Gallery: ComponentConfig<GalleryProps> = {
  defaultProps: { images: [] },
  render: ({ images }) => (
    <section className="grid grid-cols-2 gap-2 px-6 py-8 sm:grid-cols-3">
      {(images ?? []).map((img, i) =>
        img.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary editor-supplied URL
          <img key={i} src={img.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
        ) : null,
      )}
    </section>
  ),
};

export interface MapAddressProps {
  address: string;
  mapsUrl?: string;
}

export const MapAddress: ComponentConfig<MapAddressProps> = {
  defaultProps: { address: "" },
  render: ({ address, mapsUrl }) => (
    <section className="mx-auto max-w-xl px-6 py-8 text-center">
      {address ? <p className="text-sm text-muted-foreground">{address}</p> : null}
      {address && sanitizeHref(mapsUrl) ? (
        <a href={sanitizeHref(mapsUrl)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-primary hover:underline">
          Ver en Google Maps
        </a>
      ) : null}
    </section>
  ),
};
