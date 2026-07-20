"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Doctor, DoctorAvailabilityBlock } from "@/types";

export function MyAvailabilityView() {
  const t = useTranslations("Agenda.mine");
  const { user, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [blocks, setBlocks] = useState<DoctorAvailabilityBlock[]>([]);

  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    (async () => {
      setLoading(true);
      const { data: doctorRow } = await supabase
        .from("doctors")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      setDoctor((doctorRow as Doctor) ?? null);
      if (doctorRow) {
        const { data: blockRows } = await supabase
          .from("doctor_availability_blocks")
          .select("*")
          .eq("doctor_id", doctorRow.id)
          .order("start_at", { ascending: true });
        setBlocks((blockRows ?? []) as DoctorAvailabilityBlock[]);
      }
      setLoading(false);
    })();
  }, [authLoading, user, supabase]);

  async function refreshBlocks(doctorId: string) {
    const { data } = await supabase
      .from("doctor_availability_blocks")
      .select("*")
      .eq("doctor_id", doctorId)
      .order("start_at", { ascending: true });
    setBlocks((data ?? []) as DoctorAvailabilityBlock[]);
  }

  async function handleAdd() {
    if (!doctor || !startAt || !endAt) return;
    if (new Date(endAt) <= new Date(startAt)) {
      toast.error(t("endBeforeStart"));
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("doctor_availability_blocks").insert({
        account_id: doctor.account_id,
        doctor_id: doctor.id,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        notes: notes || null,
      });
      if (error) throw error;
      toast.success(t("created"));
      setStartAt("");
      setEndAt("");
      setNotes("");
      await refreshBlocks(doctor.id);
    } catch (err) {
      console.error("Failed to add availability block:", err);
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!doctor) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("doctor_availability_blocks").delete().eq("id", id);
      if (error) throw error;
      toast.success(t("deleted"));
      await refreshBlocks(doctor.id);
    } catch (err) {
      console.error("Failed to delete availability block:", err);
      toast.error(t("saveFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!doctor) {
    return (
      <div className="mx-auto max-w-md space-y-2 rounded-lg border border-border bg-card p-6 text-center">
        <CalendarClock className="mx-auto size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold text-foreground">{t("notDoctorTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("notDoctorBody")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <CalendarClock className="size-6 text-primary" />
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("startTime")}</Label>
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              className="h-9 border-border bg-muted text-sm text-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("endTime")}</Label>
            <Input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="h-9 border-border bg-muted text-sm text-foreground"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("notesPlaceholder")}</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            className="h-9 border-border bg-muted text-sm text-foreground"
          />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          disabled={saving || !startAt || !endAt}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          {t("addBlock")}
        </Button>
      </div>

      <div className="space-y-2">
        {blocks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          blocks.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="text-foreground">
                  {dateFormatter.format(new Date(b.start_at))} — {dateFormatter.format(new Date(b.end_at))}
                </p>
                {b.notes && <p className="truncate text-xs text-muted-foreground">{b.notes}</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t("deleteConfirm"))) void handleDelete(b.id);
                }}
                disabled={deletingId === b.id}
                className="shrink-0 text-red-400 hover:text-red-300 disabled:opacity-50"
                aria-label={t("delete")}
              >
                {deletingId === b.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
