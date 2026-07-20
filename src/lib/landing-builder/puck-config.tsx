import type { Config } from "@puckeditor/core";
import {
  Hero,
  ContactCTA,
  ServiceList,
  Testimonial,
  DoctorBio,
  Gallery,
  MapAddress,
  type HeroProps,
  type ContactCTAProps,
  type ServiceListProps,
  type TestimonialProps,
  type DoctorBioProps,
  type GalleryProps,
  type MapAddressProps,
} from "./blocks";

export interface LandingProps {
  Hero: HeroProps;
  ContactCTA: ContactCTAProps;
  ServiceList: ServiceListProps;
  Testimonial: TestimonialProps;
  DoctorBio: DoctorBioProps;
  Gallery: GalleryProps;
  MapAddress: MapAddressProps;
}

/**
 * Server-safe, render-only config for the public `/site/[slug]` page
 * (uses Puck's RSC-safe `Render`, which only ever calls each
 * component's `render` — never reads `fields`). The editable configs
 * WITH fields (including the hook-based image-upload/color pickers)
 * live in editor-config.tsx, a "use client" module used only by the
 * two Puck editor components — importing it here would pull hooks
 * into this server component's module graph and fail the build. This
 * config is always the full block set: it's a rendering superset, so
 * it renders a page built with either tier's editor identically.
 */
export const fullConfig: Config<LandingProps> = {
  components: { Hero, ServiceList, ContactCTA, Testimonial, DoctorBio, Gallery, MapAddress },
};
