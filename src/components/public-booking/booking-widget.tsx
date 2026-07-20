"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PublicBookingConfig } from "@/lib/scheduling/public-booking";

interface Slot {
  start_at: string;
  end_at: string;
}

const timeFormatter = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" });
const dateFormatter = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });

/** Today, formatted as YYYY-MM-DD for the date input's min/default. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BookingWidget({
  slug,
  config,
}: {
  slug: string;
  config: PublicBookingConfig;
}) {
  const [serviceTypeId, setServiceTypeId] = useState(config.serviceTypes[0]?.id ?? "");
  const [doctorId, setDoctorId] = useState(config.doctors[0]?.id ?? "");
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Slot | null>(null);

  useEffect(() => {
    if (!serviceTypeId || !doctorId || !date) return;
    setSelectedSlot(null);
    setSlotsLoading(true);
    const params = new URLSearchParams({ doctor_id: doctorId, service_type_id: serviceTypeId, date });
    fetch(`/api/public/booking/${encodeURIComponent(slug)}/slots?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setSlots(data.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [slug, serviceTypeId, doctorId, date]);

  const canSubmit = useMemo(
    () => !!selectedSlot && name.trim().length > 1 && phone.trim().length >= 8,
    [selectedSlot, name, phone],
  );

  async function handleSubmit() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/booking/${encodeURIComponent(slug)}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctor_id: doctorId,
          service_type_id: serviceTypeId,
          start_at: selectedSlot.start_at,
          name,
          phone,
          email: email || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo agendar la cita. Intenta de nuevo.");
        return;
      }
      setConfirmed(selectedSlot);
    } catch {
      setError("No se pudo agendar la cita. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-8 text-center">
        <CalendarCheck className="mx-auto size-10 text-primary" />
        <h2 className="mt-4 text-xl font-semibold text-foreground">Cita agendada</h2>
        <p className="mt-2 text-muted-foreground">
          {dateFormatter.format(new Date(confirmed.start_at))} a las{" "}
          {timeFormatter.format(new Date(confirmed.start_at))}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Te contactaremos para confirmar los detalles.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card p-6">
      {config.serviceTypes.length === 0 || config.doctors.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Este consultorio aún no tiene horarios disponibles para agendar en línea.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Servicio</Label>
              <Select value={serviceTypeId} onValueChange={(v) => setServiceTypeId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elige un servicio" />
                </SelectTrigger>
                <SelectContent>
                  {config.serviceTypes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.duration_minutes} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Doctor</Label>
              <Select value={doctorId} onValueChange={(v) => setDoctorId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elige un doctor" />
                </SelectTrigger>
                <SelectContent>
                  {config.doctors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.specialty ? ` — ${d.specialty}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="booking-date">Fecha</Label>
            <Input
              id="booking-date"
              type="date"
              min={todayIso()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-fit"
            />
          </div>

          <div className="space-y-2">
            <Label>Horarios disponibles</Label>
            {slotsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Buscando horarios…
              </div>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay horarios disponibles ese día. Prueba otra fecha.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot.start_at}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      selectedSlot?.start_at === slot.start_at
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/50"
                    }`}
                  >
                    {timeFormatter.format(new Date(slot.start_at))}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedSlot && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="booking-name">Nombre completo</Label>
                  <Input id="booking-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-phone">Teléfono (WhatsApp)</Label>
                  <Input id="booking-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-email">Correo (opcional)</Label>
                <Input
                  id="booking-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="w-full sm:w-auto">
                {submitting ? "Agendando…" : "Confirmar cita"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
