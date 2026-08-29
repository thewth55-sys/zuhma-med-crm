"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Loader2, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { hasConflict } from "@/lib/scheduling/availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Appointment, AppointmentStatus, Doctor, Room, ServiceType } from "@/types";

interface DealAppointmentPanelProps {
  dealId: string;
  contactId: string;
}

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  confirmed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  completed: "bg-primary/10 text-primary border-primary/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  no_show: "bg-red-500/10 text-red-400 border-red-500/30",
};

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Cita panel inside the deal sheet — lists appointments linked to this
 * deal and lets staff create/edit one. Doctor + room + service type
 * assignment is manual (per the scheduling module plan); Google
 * Calendar / Cal.com sync land in later phases at the PATCH endpoint
 * this panel already calls, so no changes will be needed here then.
 */
export function DealAppointmentPanel({ dealId, contactId }: DealAppointmentPanelProps) {
  const t = useTranslations("Pipelines.appointments");
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAppointments = useCallback(async () => {
    try {
      const res = await fetch(`/api/appointments?deal_id=${dealId}`);
      const data = await res.json();
      setAppointments(data.appointments ?? []);
    } catch (err) {
      console.error("Failed to fetch appointments:", err);
    }
  }, [dealId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [d, r, s] = await Promise.all([
        supabase.from("doctors").select("*").eq("is_active", true).order("name"),
        supabase.from("rooms").select("*").eq("is_active", true).order("name"),
        supabase.from("service_types").select("*").eq("is_active", true).order("name"),
      ]);
      if (cancelled) return;
      setDoctors((d.data ?? []) as Doctor[]);
      setRooms((r.data ?? []) as Room[]);
      setServiceTypes((s.data ?? []) as ServiceType[]);
      await fetchAppointments();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId]);

  function openCreateForm() {
    setEditingId(null);
    setServiceTypeId("");
    setDoctorId("");
    setRoomId("");
    setStartAt("");
    setDurationMinutes(30);
    setConflictWarning(null);
    setFormOpen(true);
  }

  function openEditForm(appt: Appointment) {
    setEditingId(appt.id);
    setServiceTypeId(appt.service_type_id ?? "");
    setDoctorId(appt.doctor_id ?? "");
    setRoomId(appt.room_id ?? "");
    setStartAt(toLocalInputValue(appt.start_at));
    setDurationMinutes(
      Math.round((new Date(appt.end_at).getTime() - new Date(appt.start_at).getTime()) / 60000)
    );
    setConflictWarning(null);
    setFormOpen(true);
  }

  async function checkConflict(startIso: string, endIso: string) {
    setConflictWarning(null);
    if (!startIso || !endIso || (!doctorId && !roomId)) return;
    try {
      const params = new URLSearchParams({ from: startIso, to: endIso });
      if (doctorId) params.set("doctor_id", doctorId);
      const res = await fetch(`/api/appointments?${params.toString()}`);
      const data = await res.json();
      const others: Appointment[] = (data.appointments ?? []).filter(
        (a: Appointment) => a.id !== editingId
      );
      const doctorConflict = doctorId
        ? hasConflict(
            others.filter((a) => a.doctor_id === doctorId),
            { start_at: startIso, end_at: endIso }
          )
        : false;
      if (doctorConflict) {
        setConflictWarning(t("conflictDoctor"));
        return;
      }
      if (roomId) {
        const roomParams = new URLSearchParams({ from: startIso, to: endIso, room_id: roomId });
        const roomRes = await fetch(`/api/appointments?${roomParams.toString()}`);
        const roomData = await roomRes.json();
        const roomOthers: Appointment[] = (roomData.appointments ?? []).filter(
          (a: Appointment) => a.id !== editingId
        );
        if (hasConflict(roomOthers, { start_at: startIso, end_at: endIso })) {
          setConflictWarning(t("conflictRoom"));
        }
      }
    } catch (err) {
      console.error("Conflict check failed:", err);
    }
  }

  function handleTimeChange(value: string) {
    setStartAt(value);
    if (!value) return;
    const start = new Date(value);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    void checkConflict(start.toISOString(), end.toISOString());
  }

  async function handleSubmit() {
    if (!startAt) {
      toast.error(t("timeRequired"));
      return;
    }
    const start = new Date(startAt);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    setSaving(true);
    try {
      if (editingId) {
        const res = await fetch(`/api/appointments/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service_type_id: serviceTypeId || null,
            doctor_id: doctorId || null,
            room_id: roomId || null,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
          }),
        });
        if (!res.ok) throw new Error("update failed");
        toast.success(t("updated"));
      } else {
        const res = await fetch("/api/appointments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deal_id: dealId,
            contact_id: contactId || null,
            service_type_id: serviceTypeId || null,
            doctor_id: doctorId || null,
            room_id: roomId || null,
            start_at: start.toISOString(),
            end_at: end.toISOString(),
          }),
        });
        if (!res.ok) throw new Error("create failed");
        toast.success(t("created"));
      }
      setFormOpen(false);
      await fetchAppointments();
    } catch (err) {
      console.error("Save appointment error:", err);
      toast.error(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(appt: Appointment) {
    try {
      const res = await fetch(`/api/appointments/${appt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error("cancel failed");
      toast.success(t("cancelled"));
      await fetchAppointments();
    } catch (err) {
      console.error("Cancel appointment error:", err);
      toast.error(t("saveFailed"));
    }
  }

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("title")}
        </p>
        {!formOpen && (
          <Button type="button" variant="ghost" size="sm" onClick={openCreateForm} className="h-7 text-xs">
            <CalendarPlus className="mr-1 h-3.5 w-3.5" />
            {t("newAppointment")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="size-4 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {appointments.length > 0 && (
            <div className="space-y-2">
              {appointments.map((appt) => (
                <div key={appt.id} className="rounded-md border border-border bg-card px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground">{dateFormatter.format(new Date(appt.start_at))}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[appt.status]}`}
                    >
                      {t(`status.${appt.status}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {appt.service_type?.name || t("noServiceType")} ·{" "}
                    {appt.doctor?.name || t("noDoctor")} · {appt.room?.name || t("noRoom")}
                  </p>
                  {appt.status !== "cancelled" && appt.status !== "completed" && (
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(appt)}
                        className="text-xs text-primary hover:text-primary/80"
                      >
                        {t("edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCancel(appt)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        {t("cancel")}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {appointments.length === 0 && !formOpen && (
            <p className="text-xs text-muted-foreground">{t("empty")}</p>
          )}

          {formOpen && (
            <div className="space-y-2 rounded-md border border-border bg-card p-2.5">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{t("serviceType")}</Label>
                <select
                  value={serviceTypeId}
                  onChange={(e) => {
                    const st = serviceTypes.find((s) => s.id === e.target.value);
                    setServiceTypeId(e.target.value);
                    if (st) setDurationMinutes(st.duration_minutes);
                  }}
                  className="h-8 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="">{t("selectServiceType")}</option>
                  {serviceTypes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes}m)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("doctor")}</Label>
                  <select
                    value={doctorId}
                    onChange={(e) => {
                      setDoctorId(e.target.value);
                      if (startAt) handleTimeChange(startAt);
                    }}
                    className="h-8 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary"
                  >
                    <option value="">{t("selectDoctor")}</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("room")}</Label>
                  <select
                    value={roomId}
                    onChange={(e) => {
                      setRoomId(e.target.value);
                      if (startAt) handleTimeChange(startAt);
                    }}
                    className="h-8 w-full rounded-md border border-border bg-muted px-2 text-xs text-foreground outline-none focus:border-primary"
                  >
                    <option value="">{t("selectRoom")}</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-[1fr_90px] gap-2">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("startTime")}</Label>
                  <Input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => handleTimeChange(e.target.value)}
                    className="h-8 border-border bg-muted text-xs text-foreground"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t("durationMin")}</Label>
                  <Input
                    type="number"
                    min={5}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value) || 30)}
                    className="h-8 border-border bg-muted text-xs text-foreground"
                  />
                </div>
              </div>

              {conflictWarning && (
                <p className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  {conflictWarning}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setFormOpen(false)}
                  disabled={saving}
                  className="flex-1 text-xs"
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={saving || !startAt}
                  className="flex-1 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : t("save")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
