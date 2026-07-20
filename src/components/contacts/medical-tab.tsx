"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ClinicalNote, ClinicalNoteAddendum, Doctor, PatientProfile } from "@/types";

interface MedicalTabProps {
  contactId: string;
}

/**
 * Médico tab — patient medical profile (editable) + clinical notes
 * timeline. Clinical notes are immutable once saved (enforced by a DB
 * trigger, see migration 038) — there is deliberately no edit action
 * for a note here, only "Agregar adenda" which appends a correction
 * without touching the original.
 */
export function MedicalTab({ contactId }: MedicalTabProps) {
  const t = useTranslations("Contacts.detailView.medicalTab");
  const supabase = createClient();
  const { accountId } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [addendaByNote, setAddendaByNote] = useState<Record<string, ClinicalNoteAddendum[]>>({});

  // Profile form state
  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [chronicConditions, setChronicConditions] = useState("");
  const [currentMedications, setCurrentMedications] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [assignedDoctorId, setAssignedDoctorId] = useState("");
  const [generalNotes, setGeneralNotes] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);

  // New clinical note form
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [findingsAndPlan, setFindingsAndPlan] = useState("");
  const [noteDoctorId, setNoteDoctorId] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Addendum forms, keyed by clinical_note_id
  const [addendumOpenFor, setAddendumOpenFor] = useState<string | null>(null);
  const [addendumText, setAddendumText] = useState("");
  const [savingAddendum, setSavingAddendum] = useState(false);

  const fetchNotes = useCallback(
    async (patientProfileId: string) => {
      const { data } = await supabase
        .from("clinical_notes")
        .select("*, doctor:doctors(*)")
        .eq("patient_profile_id", patientProfileId)
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as ClinicalNote[];
      setNotes(rows);

      if (rows.length > 0) {
        const { data: addenda } = await supabase
          .from("clinical_note_addenda")
          .select("*")
          .in("clinical_note_id", rows.map((n) => n.id))
          .order("created_at", { ascending: true });
        const grouped: Record<string, ClinicalNoteAddendum[]> = {};
        for (const a of (addenda ?? []) as ClinicalNoteAddendum[]) {
          (grouped[a.clinical_note_id] ??= []).push(a);
        }
        setAddendaByNote(grouped);
      }
    },
    [supabase]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [profileRes, doctorsRes] = await Promise.all([
        supabase.from("patient_profiles").select("*").eq("contact_id", contactId).maybeSingle(),
        supabase.from("doctors").select("*").eq("is_active", true).order("name"),
      ]);
      if (cancelled) return;
      const p = (profileRes.data ?? null) as PatientProfile | null;
      setProfile(p);
      setDoctors((doctorsRes.data ?? []) as Doctor[]);
      if (p) {
        setBloodType(p.blood_type ?? "");
        setAllergies(p.allergies ?? "");
        setChronicConditions(p.chronic_conditions ?? "");
        setCurrentMedications(p.current_medications ?? "");
        setEmergencyContactName(p.emergency_contact_name ?? "");
        setEmergencyContactPhone(p.emergency_contact_phone ?? "");
        setAssignedDoctorId(p.assigned_doctor_id ?? "");
        setGeneralNotes(p.notes ?? "");
        await fetchNotes(p.id);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  async function createProfile() {
    if (!accountId) return;
    setCreatingProfile(true);
    try {
      const { data, error } = await supabase
        .from("patient_profiles")
        .insert({ account_id: accountId, contact_id: contactId })
        .select("*")
        .single();
      if (error) throw error;
      setProfile(data as PatientProfile);
      toast.success(t("profileCreated"));
    } catch (err) {
      // Migration 064: converting a contact into a patient is what the
      // plan's patient-limit trigger now checks (moved off `contacts`
      // inserts, which should never be capped — see the migration's
      // doc comment) — surface an upgrade prompt instead of the raw
      // Postgres exception text.
      if (err instanceof Error && err.message.includes("ZENTRO_PATIENT_LIMIT")) {
        toast.error(t("profileLimitReached"));
        return;
      }
      console.error("Create patient profile error:", err);
      toast.error(t("profileCreateFailed"));
    } finally {
      setCreatingProfile(false);
    }
  }

  async function saveProfile() {
    if (!profile) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("patient_profiles")
        .update({
          blood_type: bloodType.trim() || null,
          allergies: allergies.trim() || null,
          chronic_conditions: chronicConditions.trim() || null,
          current_medications: currentMedications.trim() || null,
          emergency_contact_name: emergencyContactName.trim() || null,
          emergency_contact_phone: emergencyContactPhone.trim() || null,
          assigned_doctor_id: assignedDoctorId || null,
          notes: generalNotes.trim() || null,
        })
        .eq("id", profile.id);
      if (error) throw error;
      toast.success(t("profileSaved"));
    } catch (err) {
      console.error("Save patient profile error:", err);
      toast.error(t("profileSaveFailed"));
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveClinicalNote() {
    if (!profile || !accountId || !chiefComplaint.trim() || !findingsAndPlan.trim()) {
      toast.error(t("noteRequired"));
      return;
    }
    setSavingNote(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { error } = await supabase.from("clinical_notes").insert({
        account_id: accountId,
        patient_profile_id: profile.id,
        doctor_id: noteDoctorId || null,
        chief_complaint: chiefComplaint.trim(),
        findings_and_plan: findingsAndPlan.trim(),
        created_by: session?.user?.id ?? null,
      });
      if (error) throw error;
      toast.success(t("noteSigned"));
      setChiefComplaint("");
      setFindingsAndPlan("");
      setNoteDoctorId("");
      setNoteFormOpen(false);
      await fetchNotes(profile.id);
    } catch (err) {
      console.error("Save clinical note error:", err);
      toast.error(t("noteSaveFailed"));
    } finally {
      setSavingNote(false);
    }
  }

  async function saveAddendum(noteId: string) {
    if (!accountId || !addendumText.trim()) return;
    setSavingAddendum(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { error } = await supabase.from("clinical_note_addenda").insert({
        account_id: accountId,
        clinical_note_id: noteId,
        content: addendumText.trim(),
        created_by: session?.user?.id ?? null,
      });
      if (error) throw error;
      toast.success(t("addendumSaved"));
      setAddendumText("");
      setAddendumOpenFor(null);
      if (profile) await fetchNotes(profile.id);
    } catch (err) {
      console.error("Save addendum error:", err);
      toast.error(t("addendumSaveFailed"));
    } finally {
      setSavingAddendum(false);
    }
  }

  const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <p className="text-sm text-muted-foreground">{t("noProfile")}</p>
        <Button onClick={createProfile} disabled={creatingProfile} className="bg-primary text-primary-foreground hover:bg-primary/90" size="sm">
          {creatingProfile ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t("createProfile")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Medical profile */}
      <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("profileTitle")}</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("bloodType")}</Label>
            <Input value={bloodType} onChange={(e) => setBloodType(e.target.value)} className="h-8 bg-card text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("assignedDoctor")}</Label>
            <select
              value={assignedDoctorId}
              onChange={(e) => setAssignedDoctorId(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">{t("selectDoctor")}</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldAlert className="size-3.5 text-amber-400" />
            {t("allergies")}
          </Label>
          <Input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder={t("allergiesPlaceholder")} className="h-8 bg-card text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("chronicConditions")}</Label>
          <Input value={chronicConditions} onChange={(e) => setChronicConditions(e.target.value)} className="h-8 bg-card text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("currentMedications")}</Label>
          <Input value={currentMedications} onChange={(e) => setCurrentMedications(e.target.value)} className="h-8 bg-card text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("emergencyContactName")}</Label>
            <Input value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} className="h-8 bg-card text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("emergencyContactPhone")}</Label>
            <Input value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} className="h-8 bg-card text-sm" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("generalNotes")}</Label>
          <Textarea value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} className="min-h-[50px] bg-card text-sm" />
        </div>
        <Button onClick={saveProfile} disabled={savingProfile} size="sm" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
          {savingProfile ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          {t("saveProfile")}
        </Button>
      </div>

      {/* Clinical notes */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("notesTitle")}</p>
          {!noteFormOpen && (
            <Button variant="ghost" size="sm" onClick={() => setNoteFormOpen(true)} className="h-7 text-xs">
              <Plus className="mr-1 size-3.5" />
              {t("newNote")}
            </Button>
          )}
        </div>

        {noteFormOpen && (
          <div className="space-y-2 rounded-md border border-border bg-card p-2.5">
            <p className="text-[11px] text-muted-foreground">{t("noteImmutableHint")}</p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("doctor")}</Label>
              <select
                value={noteDoctorId}
                onChange={(e) => setNoteDoctorId(e.target.value)}
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("chiefComplaint")}</Label>
              <Textarea value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} className="min-h-[44px] bg-muted text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t("findingsAndPlan")}</Label>
              <Textarea value={findingsAndPlan} onChange={(e) => setFindingsAndPlan(e.target.value)} className="min-h-[64px] bg-muted text-xs" />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setNoteFormOpen(false)} disabled={savingNote} className="flex-1 text-xs">
                {t("cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={saveClinicalNote}
                disabled={savingNote || !chiefComplaint.trim() || !findingsAndPlan.trim()}
                className="flex-1 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
              >
                {savingNote ? <Loader2 className="size-3.5 animate-spin" /> : t("signAndSave")}
              </Button>
            </div>
          </div>
        )}

        {notes.length === 0 && !noteFormOpen && <p className="text-xs text-muted-foreground">{t("noNotes")}</p>}

        <div className="space-y-2">
          {notes.map((note) => (
            <div key={note.id} className="rounded-md border border-border bg-card px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{dateFormatter.format(new Date(note.signed_at))}</span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  {t("signed")}
                </span>
              </div>
              {note.doctor?.name && <p className="text-xs text-muted-foreground">{t("authoredBy", { name: note.doctor.name })}</p>}
              <p className="mt-1.5 text-xs font-medium text-foreground">{note.chief_complaint}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{note.findings_and_plan}</p>

              {(addendaByNote[note.id] ?? []).map((a) => (
                <div key={a.id} className="mt-2 rounded-md border-l-2 border-primary/40 bg-muted/50 px-2.5 py-2">
                  <p className="text-[10px] font-medium text-muted-foreground">
                    {t("addendumLabel")} · {dateFormatter.format(new Date(a.created_at))}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-foreground">{a.content}</p>
                </div>
              ))}

              {addendumOpenFor === note.id ? (
                <div className="mt-2 space-y-1.5">
                  <Textarea
                    value={addendumText}
                    onChange={(e) => setAddendumText(e.target.value)}
                    placeholder={t("addendumPlaceholder")}
                    className="min-h-[44px] bg-muted text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAddendumOpenFor(null);
                        setAddendumText("");
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveAddendum(note.id)}
                      disabled={savingAddendum || !addendumText.trim()}
                      className="text-xs font-medium text-primary hover:text-primary/80 disabled:opacity-50"
                    >
                      {savingAddendum ? t("saving") : t("saveAddendum")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddendumOpenFor(note.id)}
                  className="mt-2 text-xs text-primary hover:text-primary/80"
                >
                  {t("addAddendum")}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
