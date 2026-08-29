'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Loader2 } from 'lucide-react';

import { useCan } from '@/hooks/use-can';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';

/** Monday-first display order; values match Postgres DOW / JS getDay(). */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Curated IANA zones covering Mexico's offsets + a couple of neighbors. */
const TIMEZONES = [
  'America/Mexico_City',
  'America/Cancun',
  'America/Merida',
  'America/Monterrey',
  'America/Chihuahua',
  'America/Mazatlan',
  'America/Hermosillo',
  'America/Tijuana',
  'America/Bogota',
  'America/Guatemala',
];

interface DayState {
  enabled: boolean;
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

function emptyWeek(): Record<number, DayState> {
  const week: Record<number, DayState> = {};
  for (const wd of WEEKDAY_ORDER) week[wd] = { enabled: false, open: '09:00', close: '18:00' };
  return week;
}

/** "HH:MM:SS" | "HH:MM" → "HH:MM" for the <input type="time">. */
function toHM(t: string): string {
  return t.slice(0, 5);
}

/**
 * Feature C — brand/clinic general schedule. Sets the account's service
 * days/hours (and timezone) that the public booking page uses as the
 * base availability. Saved via /api/settings/business-hours (admin+).
 */
export function BusinessHoursManager() {
  const t = useTranslations('Settings.scheduling.businessHours');
  const canEdit = useCan('edit-settings');
  const { accountId } = useAuth();
  const supabase = createClient();

  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [timezone, setTimezone] = useState('America/Mexico_City');
  const [week, setWeek] = useState<Record<number, DayState>>(emptyWeek);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [roomId, setRoomId] = useState('');

  // Carga los consultorios (ubicaciones) de la cuenta.
  useEffect(() => {
    if (!accountId) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('rooms')
        .select('id, name')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .order('name');
      if (!active) return;
      setRooms(data ?? []);
      if (data && data[0]) setRoomId(data[0].id);
      setLoadingRooms(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  // Carga el horario del consultorio seleccionado.
  useEffect(() => {
    if (!roomId) return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/settings/business-hours?room_id=${encodeURIComponent(roomId)}`);
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as {
          timezone: string;
          days: { weekday: number; open_time: string; close_time: string }[];
        };
        if (!active) return;
        const next = emptyWeek();
        for (const d of data.days) {
          if (next[d.weekday]) {
            next[d.weekday] = { enabled: true, open: toHM(d.open_time), close: toHM(d.close_time) };
          }
        }
        setTimezone(data.timezone || 'America/Mexico_City');
        setWeek(next);
      } catch (err) {
        console.error('Failed to load business hours:', err);
        if (active) toast.error(t('loadFailed'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  function setDay(wd: number, patch: Partial<DayState>) {
    setWeek((prev) => ({ ...prev, [wd]: { ...prev[wd], ...patch } }));
  }

  async function handleSave() {
    // Validate enabled days before sending.
    for (const wd of WEEKDAY_ORDER) {
      const d = week[wd];
      if (d.enabled && d.close <= d.open) {
        toast.error(t('invalidRange'));
        return;
      }
    }
    const days = WEEKDAY_ORDER.filter((wd) => week[wd].enabled).map((wd) => ({
      weekday: wd,
      open_time: week[wd].open,
      close_time: week[wd].close,
    }));

    try {
      setSaving(true);
      const res = await fetch('/api/settings/business-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone, days, room_id: roomId }),
      });
      if (!res.ok) throw new Error('save failed');
      toast.success(t('saved'));
    } catch (err) {
      console.error('Save business hours error:', err);
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <CalendarClock className="size-4 text-primary" />
          {t('title')}
        </CardTitle>
        <CardDescription className="text-muted-foreground">{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingRooms ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noRooms')}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">{t('roomLabel')}</label>
                <select
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="rounded-md border border-border bg-muted px-2 py-1 text-sm text-foreground"
                >
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">{t('timezoneLabel')}</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  disabled={!canEdit}
                  className="rounded-md border border-border bg-muted px-2 py-1 text-sm text-foreground disabled:opacity-50"
                >
                  {(TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((tz) => (
                    <option key={tz} value={tz}>
                      {tz.replace('America/', '')}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-5 animate-spin text-primary" />
              </div>
            ) : (
              <>
            <div className="space-y-1.5">
              {WEEKDAY_ORDER.map((wd) => {
                const d = week[wd];
                return (
                  <div
                    key={wd}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
                  >
                    <div className="flex min-w-[130px] items-center gap-2">
                      <Switch
                        checked={d.enabled}
                        onCheckedChange={(v) => setDay(wd, { enabled: v })}
                        disabled={!canEdit}
                      />
                      <span className="text-sm text-foreground">{t(`days.${wd}`)}</span>
                    </div>
                    {d.enabled ? (
                      <div className="flex flex-1 items-center justify-end gap-2 text-sm">
                        <span className="text-xs text-muted-foreground">{t('open')}</span>
                        <Input
                          type="time"
                          value={d.open}
                          onChange={(e) => setDay(wd, { open: e.target.value })}
                          disabled={!canEdit}
                          className="w-[110px]"
                        />
                        <span className="text-xs text-muted-foreground">{t('close')}</span>
                        <Input
                          type="time"
                          value={d.close}
                          onChange={(e) => setDay(wd, { close: e.target.value })}
                          disabled={!canEdit}
                          className="w-[110px]"
                        />
                      </div>
                    ) : (
                      <span className="flex-1 text-right text-xs text-muted-foreground">
                        {t('closed')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {canEdit && (
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  {saving ? t('saving') : t('save')}
                </Button>
              </div>
            )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
