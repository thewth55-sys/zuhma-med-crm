"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { OdontogramTooth, PatientProfile, ToothCondition } from "@/types";

interface OdontogramTabProps {
  contactId: string;
}

// FDI/ISO two-digit numbering, laid out the way a chart is
// conventionally drawn (patient's right appears on the left of the
// page) — permanent adult dentition only, 32 teeth across 4 quadrants.
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

const CONDITIONS: ToothCondition[] = [
  "healthy",
  "caries",
  "filled",
  "crown",
  "root_canal",
  "missing",
  "extraction_planned",
  "implant",
  "bridge",
];

const CONDITION_STYLE: Record<ToothCondition, string> = {
  healthy: "border-border bg-muted/40 text-muted-foreground",
  caries: "border-red-500 bg-red-500/20 text-red-600",
  filled: "border-blue-500 bg-blue-500/20 text-blue-600",
  crown: "border-purple-500 bg-purple-500/20 text-purple-600",
  root_canal: "border-orange-500 bg-orange-500/20 text-orange-600",
  missing: "border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground/40",
  extraction_planned: "border-yellow-500 bg-yellow-500/20 text-yellow-700",
  implant: "border-teal-500 bg-teal-500/20 text-teal-600",
  bridge: "border-indigo-500 bg-indigo-500/20 text-indigo-600",
};

/**
 * Odontograma tab — current per-tooth status chart. Only available
 * once the contact has a patient_profiles row (migration 038's "a
 * contact becomes a patient when this row is created"); a lead that
 * hasn't been converted yet sees a pointer to the Médico tab instead.
 */
export function OdontogramTab({ contactId }: OdontogramTabProps) {
  const t = useTranslations("Contacts.detailView.odontogramTab");
  const supabase = createClient();
  const { accountId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [teeth, setTeeth] = useState<Record<number, OdontogramTooth>>({});
  const [openTooth, setOpenTooth] = useState<number | null>(null);
  const [draftCondition, setDraftCondition] = useState<ToothCondition>("healthy");
  const [draftNotes, setDraftNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchTeeth = useCallback(
    async (patientProfileId: string) => {
      const { data } = await supabase
        .from("odontogram_teeth")
        .select("*")
        .eq("patient_profile_id", patientProfileId);
      const map: Record<number, OdontogramTooth> = {};
      for (const row of (data ?? []) as OdontogramTooth[]) {
        map[row.tooth_number] = row;
      }
      setTeeth(map);
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("patient_profiles")
        .select("*")
        .eq("contact_id", contactId)
        .maybeSingle();
      if (cancelled) return;
      const p = (data ?? null) as PatientProfile | null;
      setProfile(p);
      if (p) await fetchTeeth(p.id);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, supabase, fetchTeeth]);

  function openToothEditor(toothNumber: number) {
    const existing = teeth[toothNumber];
    setDraftCondition(existing?.condition ?? "healthy");
    setDraftNotes(existing?.notes ?? "");
    setOpenTooth(toothNumber);
  }

  async function saveTooth() {
    if (!profile || !accountId || openTooth === null) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { data, error } = await supabase
        .from("odontogram_teeth")
        .upsert(
          {
            account_id: accountId,
            patient_profile_id: profile.id,
            tooth_number: openTooth,
            condition: draftCondition,
            notes: draftNotes.trim() || null,
            updated_by: session?.user?.id ?? null,
          },
          { onConflict: "patient_profile_id,tooth_number" },
        )
        .select("*")
        .single();
      if (error) throw error;
      setTeeth((prev) => ({ ...prev, [openTooth]: data as OdontogramTooth }));
      toast.success(t("toothSaved"));
      setOpenTooth(null);
    } catch (err) {
      console.error("Save tooth error:", err);
      toast.error(t("toothSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function ToothButton({ number }: { number: number }) {
    const tooth = teeth[number];
    const condition = tooth?.condition ?? "healthy";
    return (
      <Popover open={openTooth === number} onOpenChange={(open) => !open && setOpenTooth(null)}>
        <PopoverTrigger
          render={
            <button
              type="button"
              onClick={() => openToothEditor(number)}
              title={tooth?.notes ?? undefined}
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md border text-[11px] font-medium transition-colors hover:opacity-80",
                CONDITION_STYLE[condition],
              )}
            />
          }
        >
          {number}
        </PopoverTrigger>
        <PopoverContent className="w-64 space-y-3">
          <p className="text-sm font-medium text-popover-foreground">
            {t("toothLabel", { number })}
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("condition")}</Label>
            <Select value={draftCondition} onValueChange={(v) => v && setDraftCondition(v as ToothCondition)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`conditions.${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("notes")}</Label>
            <Textarea
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
          <Button size="sm" onClick={saveTooth} disabled={saving} className="w-full">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {t("save")}
          </Button>
        </PopoverContent>
      </Popover>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="text-sm text-muted-foreground">{t("noProfile")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2 overflow-x-auto rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex w-max items-center justify-center gap-1.5">
          {UPPER_RIGHT.map((n) => (
            <ToothButton key={n} number={n} />
          ))}
          <div className="mx-1 h-9 w-px bg-border" />
          {UPPER_LEFT.map((n) => (
            <ToothButton key={n} number={n} />
          ))}
        </div>
        <div className="flex w-max items-center justify-center gap-1.5">
          {LOWER_RIGHT.map((n) => (
            <ToothButton key={n} number={n} />
          ))}
          <div className="mx-1 h-9 w-px bg-border" />
          {LOWER_LEFT.map((n) => (
            <ToothButton key={n} number={n} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {CONDITIONS.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded border", CONDITION_STYLE[c])} />
            {t(`conditions.${c}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
