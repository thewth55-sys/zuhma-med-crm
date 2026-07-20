"use client";

import type { Config } from "@puckeditor/core";
import { colorField, imageUploadField } from "./custom-fields";
import { Hero, ContactCTA, ServiceList, Testimonial, DoctorBio, Gallery, MapAddress } from "./blocks";
import type { LandingProps } from "./puck-config";

/**
 * Editable configs (render + fields) for the two Puck editor
 * components (landing-page-editor.tsx, admin-landing-editor.tsx) —
 * both "use client" already. Layers `fields` (including the
 * hook-based custom fields from custom-fields.tsx) on top of each
 * block's server-safe render config from blocks.tsx. Kept in its own
 * "use client" module, separate from puck-config.tsx's render-only
 * `fullConfig`, so the public `/site/[slug]` server page never pulls
 * in hook-using code — see blocks.tsx's top comment for the full
 * rationale.
 */

/**
 * Self-serve tier (Zuhma Med CRM / "solo CRM" plan and up): a doctor
 * builds their own page. Deliberately just 3 blocks — enough for a
 * one-page "who we are + how to reach us" site without the surface
 * area to produce something that looks broken or off-brand
 * unsupervised.
 */
export const basicConfig: Config<Pick<LandingProps, "Hero" | "ServiceList" | "ContactCTA">> = {
  components: {
    Hero: {
      ...Hero,
      fields: {
        headline: { type: "text", label: "Título" },
        subheadline: { type: "textarea", label: "Subtítulo" },
        imageUrl: imageUploadField("Imagen"),
        ctaText: { type: "text", label: "Texto del botón" },
        ctaHref: { type: "text", label: "Enlace del botón (WhatsApp o agenda)" },
        backgroundColor: colorField("Color de fondo", "#0a0a0a"),
        buttonColor: colorField("Color del botón"),
      },
    },
    ServiceList: {
      ...ServiceList,
      fields: {
        title: { type: "text", label: "Título" },
        items: {
          type: "array",
          label: "Servicios",
          arrayFields: {
            name: { type: "text", label: "Nombre" },
            description: { type: "textarea", label: "Descripción" },
          },
          defaultItemProps: { name: "Servicio", description: "" },
        },
        backgroundColor: colorField("Color de fondo", "#ffffff"),
      },
    },
    ContactCTA: {
      ...ContactCTA,
      fields: {
        heading: { type: "text", label: "Título" },
        whatsappNumber: { type: "text", label: "Número de WhatsApp (con código de país)" },
        message: { type: "textarea", label: "Mensaje prellenado" },
        backgroundColor: colorField("Color de fondo", "#f4f4f5"),
        buttonColor: colorField("Color del botón"),
      },
    },
  },
};

/**
 * Full tier: everything, used exclusively by Zuhma's internal
 * design team from the platform-admin editor (see
 * /admin/accounts/[accountId]/landing) to fulfil the "Landing de
 * especialidad" line item on the Starter/Pro plans as a white-glove
 * service — clients on those plans don't get self-serve access to
 * this wider palette, staff builds it for them.
 */
export const fullConfig: Config<LandingProps> = {
  components: {
    ...basicConfig.components,
    Testimonial: {
      ...Testimonial,
      fields: {
        quote: { type: "textarea", label: "Testimonio" },
        author: { type: "text", label: "Autor" },
      },
    },
    DoctorBio: {
      ...DoctorBio,
      fields: {
        name: { type: "text", label: "Nombre" },
        title: { type: "text", label: "Título / especialidad" },
        photoUrl: imageUploadField("Foto"),
        bio: { type: "textarea", label: "Biografía" },
      },
    },
    Gallery: {
      ...Gallery,
      fields: {
        images: {
          type: "array",
          label: "Imágenes",
          arrayFields: { url: imageUploadField("imagen") },
          defaultItemProps: { url: "" },
        },
      },
    },
    MapAddress: {
      ...MapAddress,
      fields: {
        address: { type: "textarea", label: "Dirección" },
        mapsUrl: { type: "text", label: "Enlace a Google Maps (opcional)" },
      },
    },
  },
};
