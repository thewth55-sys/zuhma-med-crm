import { notFound } from "next/navigation";
import type { Data } from "@puckeditor/core";
import { Render } from "@puckeditor/core/rsc";

import { supabaseAdmin } from "@/lib/supabase/admin-client";
import { fullConfig, type LandingProps } from "@/lib/landing-builder/puck-config";

/**
 * Public landing page render (/site/[slug]) — server component, zero
 * client JS. Always renders with `fullConfig` regardless of which
 * config (basic or premium) built the page: fullConfig is a superset,
 * so any page built with basicConfig renders identically here, and
 * this route never needs to know which tier a given page came from.
 */
async function loadPage(slug: string) {
  const { data } = await supabaseAdmin()
    .from("landing_pages")
    .select("content, published")
    .eq("slug", slug)
    .maybeSingle();
  if (!data || !data.published) return null;
  // The DB stores Puck's Data shape verbatim as untyped jsonb — cast
  // to the concrete component-prop union fullConfig expects.
  return data.content as Data<LandingProps>;
}

// Deliberately no dynamic generateMetadata here (see the identical
// note in agendar/[slug]/page.tsx) — Next's build-time route analysis
// can invoke it speculatively, and a live Supabase call there hung
// the build indefinitely on a container that apparently can't reach
// Supabase at build time.

export default async function PublicLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const content = await loadPage(slug);

  if (!content) notFound();

  return <Render config={fullConfig} data={content} />;
}
