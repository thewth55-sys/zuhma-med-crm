"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  CLINICAL_PHOTO_MAX_BYTES,
  deleteClinicalPhoto,
  getClinicalPhotoUrl,
  uploadClinicalPhoto,
} from "@/lib/storage/clinical-photos";
import type { PatientProfile, VisitPhoto } from "@/types";

interface VisitPhotosTabProps {
  contactId: string;
}

interface PhotoWithUrl extends VisitPhoto {
  url: string | null;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Fotos tab — durable clinical photo history per patient, uploaded to
 * the private `clinical-photos` bucket (migration 067) and displayed
 * via short-lived signed URLs, never a public link. Only available
 * once the contact has a patient_profiles row (converted-patient gate).
 */
export function VisitPhotosTab({ contactId }: VisitPhotosTabProps) {
  const t = useTranslations("Contacts.detailView.photosTab");
  const supabase = createClient();
  const { accountId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [viewerPhoto, setViewerPhoto] = useState<PhotoWithUrl | null>(null);

  const fetchPhotos = useCallback(
    async (patientProfileId: string) => {
      const { data } = await supabase
        .from("visit_photos")
        .select("*")
        .eq("patient_profile_id", patientProfileId)
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as VisitPhoto[];
      const withUrls = await Promise.all(
        rows.map(async (p) => ({ ...p, url: await getClinicalPhotoUrl(p.storage_path) })),
      );
      setPhotos(withUrls);
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
      if (p) await fetchPhotos(p.id);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, supabase, fetchPhotos]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file || !profile || !accountId) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(t("invalidType"));
      return;
    }
    if (file.size > CLINICAL_PHOTO_MAX_BYTES) {
      toast.error(t("tooLarge"));
      return;
    }

    setUploading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const { path } = await uploadClinicalPhoto(accountId, profile.id, file);
      const { error } = await supabase.from("visit_photos").insert({
        account_id: accountId,
        patient_profile_id: profile.id,
        storage_path: path,
        uploaded_by: session?.user?.id ?? null,
      });
      if (error) throw error;
      toast.success(t("uploaded"));
      await fetchPhotos(profile.id);
    } catch (err) {
      console.error("Upload visit photo error:", err);
      toast.error(t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(photo: PhotoWithUrl) {
    setDeletingId(photo.id);
    try {
      const { error } = await supabase.from("visit_photos").delete().eq("id", photo.id);
      if (error) throw error;
      await deleteClinicalPhoto(photo.storage_path).catch(() => {});
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      if (viewerPhoto?.id === photo.id) setViewerPhoto(null);
      toast.success(t("deleted"));
    } catch (err) {
      console.error("Delete visit photo error:", err);
      toast.error(t("deleteFailed"));
    } finally {
      setDeletingId(null);
    }
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t("title")}
        </p>
        <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {t("upload")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          className="hidden"
          onChange={handleFileSelected}
        />
      </div>

      {photos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setViewerPhoto(photo)}
              className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
            >
              {photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL to a private bucket, not a Next-optimizable static asset
                <img src={photo.url} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!viewerPhoto} onOpenChange={(open) => !open && setViewerPhoto(null)}>
        <DialogContent className="sm:max-w-2xl">
          {viewerPhoto?.url && (
            // eslint-disable-next-line @next/next/no-img-element -- signed URL to a private bucket
            <img src={viewerPhoto.url} alt="" className="max-h-[70vh] w-full rounded-md object-contain" />
          )}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {viewerPhoto && new Date(viewerPhoto.created_at).toLocaleString()}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!viewerPhoto || deletingId === viewerPhoto.id}
                onClick={() => viewerPhoto && handleDelete(viewerPhoto)}
              >
                {viewerPhoto && deletingId === viewerPhoto.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                {t("delete")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setViewerPhoto(null)}>
                <X className="size-3.5" />
                {t("close")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
