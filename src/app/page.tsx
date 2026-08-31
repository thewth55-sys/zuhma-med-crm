import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { LANDING_HTML } from "./landing-content";

// Public landing at `/` — describes what Zuhma Med does (also serves as
// the app's public homepage for Google OAuth verification). A visitor
// who already has a session is sent straight to the dashboard; everyone
// else sees the landing. The markup is a self-contained HTML string
// (its own <style>) rendered inside `.zl-root`, which paints an explicit
// light background so the app's dark mode never bleeds into it.
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return <div className="zl-root" dangerouslySetInnerHTML={{ __html: LANDING_HTML }} />;
}
