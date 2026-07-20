"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, X, AlertTriangle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { hasConflict } from "@/lib/scheduling/availability";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Appointment, AppointmentStatus, Contact, Doctor, Room, ServiceType } from "@/types";

export type AppointmentDraft =
  | { mode: "create"; startAt: string; endAt: string; doctorId?: string; roomId?: string }
  | { mode: "edit"; appointment: Appointment };

interface AppointmentEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: AppointmentDraft | null;
  doctors: Doctor[];
  rooms: Room[];
  serviceTypes: ServiceType[];
  canEdit: boolean;
  onSaved: () => void;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_OPTIONS: AppointmentStatus[] = ["pending", "confirmed", "completed", "cancelled", "no_show"];

export function AppointmentEditorDialog({
  open,
  onOpenChange,
  draft,
  doctors,
  rooms,
  serviceTypes,
  canEdit,
  onSaved,
}: AppointmentEditorDialogProps) {
  const t = useTranslations("Agenda");
  const tAppt = useTranslations("Pipelines.appointments");
  const supabase = createClient();

  const [serviceTypeId, setServiceTypeId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [status, setStatus] = useState<AppointmentStatus>("pending");
  const [notes, setNotes] = useState("");
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [contact, setContact] = useState<Contact | null>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [contactResults, setContactResults] = useState<Contact[]>([]);
  const [searchingContact, setSearchingContact] = useState(false);
  const contactSearchSeq = useRef(0);

  const editingId = draft?.mode === "edit" ? draft.appointment.id : null;

  useEffect(() => {
    if (!draft) return;
    if (draft.mode === "edit") {
      const appt = draft.appointment;
      setServiceTypeId(appt.service_type_id ?? "");
      setDoctorId(appt.doctor_id ?? "");
      setRoomId(appt.room_id ?? "");
      setStartAt(toLocalInputValue(appt.start_at));
      setDurationMinutes(
        Math.round((new Date(appt.end_at).getTime() - new Date(appt.start_at).getTime()) / 60000)
      );
      setStatus(appt.status);
      setNotes(appt.notes ?? "");
      setContact(appt.contact ?? null);
    } else {
      setServiceTypeId("");
      setDoctorId(draft.doctorId ?? "");
      setRoomId(draft.roomId ?? "");
      setStartAt(toLocalInputValue(draft.startAt));
      setDurationMinutes(
        Math.max(5, Math.round((new Date(draft.endAt).getTime() - new Date(draft.startAt).getTime()) / 60000))
      );
      setStatus("pending");
      setNotes("");
      setContact(null);
    }
    setContactQuery("");
    setContactResults([]);
    setConflictWarning(null);
  }, [draft]);

  const checkConflict = useCallback(
    async (startIso: string, endIso: string, dId: string, rId: string) => {
      setConflictWarning(null);
      if (!startIso || !endIso || (!dId && !rId)) return;
      try {
        if (dId) {
          const params = new URLSearchParams({ from: startIso, to: endIso, doctor_id: dId });
          const res = await fetch(`/api/appointments?${params.toString()}`);
          const data = await res.json();
          const others: Appointment[] = (data.appointments ?? []).filter(
            (a: Appointment) => a.id !== editingId
          );
          if (hasConflict(others, { start_at: startIso, end_at: endIso })) {
            setConflictWarning(tAppt("conflictDoctor"));
            return;
          }
        }
        if (rId) {
          const params = new URLSearchParams({ from: startIso, to: endIso, room_id: rId });
          const res = await fetch(`/api/appointments?${params.toString()}`);
          const data = await res.json();
          const others: Appointment[] = (data.appointments ?? []).filter(
            (a: Appointment) => a.id !== editingId
          );
          if (hasConflict(others, { start_at: startIso, end_at: endIso })) {
            setConflictWarning(tAppt("conflictRoom"));
            return;
          }
        }
        if (dId) {
          const params = new URLSearchParams({ doctor_id: dId, from: startIso, to: endIso });
          const res = await fetch(`/api/google-calendar/freebusy?${params.toString()}`);
          const data = await res.json().catch(() => null);
          if (data?.busy) {
            setConflictWarning(tAppt("conflictGoogleCalendar"));
          }
        }
      } catch (err) {
        console.error("Conflict check failed:", err);
      }
    },
    [editingId, tAppt]
  );

  function recheck(nextStart: string, nextDuration: number, nextDoctorId: string, nextRoomId: string) {
    if (!nextStart) return;
    const start = new Date(nextStart);
    const end = new Date(start.getTime() + nextDuration * 60000);
    void checkConflict(start.toISOString(), end.toISOString(), nextDoctorId, nextRoomId);
  }

  useEffect(() => {
    if (!contactQuery.trim()) {
      setContactResults([]);
      return;
    }
    const seq = ++contactSearchSeq.current;
    const handle = setTimeout(async () => {
      setSearchingContact(true);
      const like = `%${contactQuery.trim()}%`;
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .or(`name.ilike.${like},phone.ilike.${like}`)
        .limit(8);
      if (seq !== contactSearchSeq.current) return;
      setContactResults((data ?? []) as Contact[]);
      setSearchingContact(false);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactQuery]);

  async function handleSubmit() {
    if (!startAt) {
      toast.error(tAppt("timeRequired"));
      return;
    }
    const start = new Date(startAt);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    setSaving(true);
    try {
      if (draft?.mode === "edit") {
        const res = await fetch(`/api/appointments/${draft.appointment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_type_id: serviceTypeId || null,
            doctor_id: doctorId || null,
            room_id: roomId || null,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            status,
            notes: notes || null,
          }),
        });
        if (!res.ok) throw new Error("update failed");
        toast.success(tAppt("updated"));
      } else {
        const res = await fetch("/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact_id: contact?.id || null,
            service_type_id: serviceTypeId || null,
            doctor_id: doctorId || null,
            room_id: roomId || null,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
            notes: notes || null,
          }),
        });
        if (!res.ok) throw new Error("create failed");
        toast.success(tAppt("created"));
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error("Save appointment error:", err);
      toast.error(tAppt("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (draft?.mode !== "edit") return;
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/appointments/${draft.appointment.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      toast.success(t("deleted"));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      console.error("Delete appointment error:", err);
      toast.error(t("deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md sm:max-w-md bg-popover text-popover-foreground">
        <DialogHeader>
          <DialogTitle>{draft?.mode === "edit" ? t("editAppointment") : t("newAppointment")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {draft?.mode === "create" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("contact")}</Label>
              {contact ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{contact.name || contact.phone}</p>
                    <p className="truncate text-xs text-muted-foreground">{contact.phone}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setContact(null)}
                    className="shrink-0 text-xs text-primary hover:text-primary/80"
                  >
                    {t("changeContact")}
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={contactQuery}
                    onChange={(e) => setContactQuery(e.target.value)}
                    placeholder={t("searchContactPlaceholder")}
                    className="h-8 border-border bg-muted pl-8 text-xs text-foreground"
                  />
                  {contactQuery.trim() && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
                      {searchingContact ? (
                        <div className="flex items-center justify-center py-3">
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                        </div>
                      ) : contactResults.length > 0 ? (
                        contactResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setContact(c);
                              setContactQuery("");
                              setContactResults([]);
                            }}
                            className="flex w-full flex-col items-start px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            <span className="text-foreground">{c.name || c.phone}</span>
                            <span className="text-muted-foreground">{c.phone}</span>
                          </button>
                        ))
                      ) : (
                        <p className="px-2.5 py-2 text-xs text-muted-foreground">{t("noContactSelected")}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {draft?.mode === "edit" && (
            <div className="rounded-md border border-border bg-muted px-2.5 py-1.5 text-sm">
              <p className="text-foreground">
                {draft.appointment.contact?.name || draft.appointment.contact?.phone || t("noContactSelected")}
              </p>
              {draft.appointment.contact?.phone && (
                <p className="text-xs text-muted-foreground">{draft.appointment.contact.phone}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{tAppt("serviceType")}</Label>
            <select
              value={serviceTypeId}
              disabled={!canEdit}
              onChange={(e) => {
                const st = serviceTypes.find((s) => s.id === e.target.value);
                setServiceTypeId(e.target.value);
                const nextDuration = st ? st.duration_minutes : durationMinutes;
                if (st) setDurationMinutes(st.duration_minutes);
                recheck(startAt, nextDuration, doctorId, roomId);
              }}
              className="h-8 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="">{tAppt("selectServiceType")}</option>
              {serviceTypes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.duration_minutes}m)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{tAppt("doctor")}</Label>
              <select
                value={doctorId}
                disabled={!canEdit}
                onChange={(e) => {
                  setDoctorId(e.target.value);
                  recheck(startAt, durationMinutes, e.target.value, roomId);
                }}
                className="h-8 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">{tAppt("selectDoctor")}</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{tAppt("room")}</Label>
              <select
                value={roomId}
                disabled={!canEdit}
                onChange={(e) => {
                  setRoomId(e.target.value);
                  recheck(startAt, durationMinutes, doctorId, e.target.value);
                }}
                className="h-8 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
              >
                <option value="">{tAppt("selectRoom")}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_90px] gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{tAppt("startTime")}</Label>
              <Input
                type="datetime-local"
                value={startAt}
                disabled={!canEdit}
                onChange={(e) => {
                  setStartAt(e.target.value);
                  recheck(e.target.value, durationMinutes, doctorId, roomId);
                }}
                className="h-8 border-border bg-muted text-xs text-foreground disabled:opacity-60"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{tAppt("durationMin")}</Label>
              <Input
                type="number"
                min={5}
                value={durationMinutes}
                disabled={!canEdit}
                onChange={(e) => {
                  const next = Number(e.target.value) || 30;
                  setDurationMinutes(next);
                  recheck(startAt, next, doctorId, roomId);
                }}
                className="h-8 border-border bg-muted text-xs text-foreground disabled:opacity-60"
              />
            </div>
          </div>

          {draft?.mode === "edit" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{tAppt("statusLabel")}</Label>
              <select
                value={status}
                disabled={!canEdit}
                onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                className="h-8 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary disabled:opacity-60"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {tAppt(`status.${s}`)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{tAppt("notes")}</Label>
            <Input
              value={notes}
              disabled={!canEdit}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8 border-border bg-muted text-xs text-foreground disabled:opacity-60"
            />
          </div>

          {conflictWarning && (
            <p className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" />
              {conflictWarning}
            </p>
          )}
        </div>

        {canEdit && (
          <DialogFooter>
            {draft?.mode === "edit" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="mr-auto text-xs text-red-400 hover:text-red-300"
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={saving || deleting || !startAt}
              className="bg-primary text-xs text-primary-foreground hover:bg-primary/90"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : tAppt("save")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
