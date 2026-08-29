"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Appointment, AppointmentStatus } from "@/types";

interface AppointmentsTabProps {
  contactId: string;
}

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  confirmed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  completed: "bg-primary/10 text-primary border-primary/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  no_show: "bg-red-500/10 text-red-400 border-red-500/30",
};

/**
 * Read-only appointment history for a patient — pulls every
 * appointment linked to this contact regardless of which deal (or no
 * deal at all) created it. Creating/editing stays in the deal panel
 * and the Agenda view; this tab is purely "what happened so far".
 */
export function AppointmentsTab({ contactId }: AppointmentsTabProps) {
  const t = useTranslations("Contacts.detailView.appointmentsTab");
  const tAppt = useTranslations("Pipelines.appointments");

  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/appointments?contact_id=${contactId}`);
      if (!res.ok) throw new Error("failed");
      const data = await res.json();
      setAppointments((data.appointments ?? []) as Appointment[]);
    } catch (err) {
      console.error("Failed to fetch appointment history:", err);
      toast.error(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [contactId, t]);

  useEffect(() => {
    void fetchAppointments();
  }, [fetchAppointments]);

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CalendarClock className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {appointments.map((appt) => (
        <div key={appt.id} className="rounded-md border border-border bg-card px-3 py-2.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-foreground">
              {dateFormatter.format(new Date(appt.start_at))}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[appt.status]}`}
            >
              {tAppt(`status.${appt.status}`)}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {appt.service_type?.name || tAppt("noServiceType")} ·{" "}
            {appt.doctor?.name || tAppt("noDoctor")} · {appt.room?.name || tAppt("noRoom")}
          </p>
          {appt.notes && <p className="mt-1 text-xs text-muted-foreground">{appt.notes}</p>}
        </div>
      ))}
    </div>
  );
}
