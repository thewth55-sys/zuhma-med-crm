import { createClient } from "@/lib/supabase/client";
import { buildMediaPath } from "@/lib/storage/upload-media";

const BUCKET = "clinical-photos";

/** Matches the bucket's file_size_limit (migration 067). */
export const CLINICAL_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Uploads a clinical photo for a patient. Unlike uploadAccountMedia
 * (chat-media/flow-media/landing-media, all public buckets returning
 * a public URL), this bucket is PRIVATE — patient medical imagery,
 * not a WhatsApp attachment. Callers get back the storage path only;
 * use getClinicalPhotoUrl() for a short-lived signed URL to display it.
 *
 * Path: clinical-photos/account-<account_id>/patient-<patient_profile_id>/<timestamp>-<basename>.<ext>
 * — the extra patient segment on top of the account-scoped convention
 * (020/023) is cosmetic (RLS only checks the first, account- segment)
 * but keeps a patient's photos visually grouped in the Supabase
 * dashboard's storage browser.
 */
export async function uploadClinicalPhoto(
  accountId: string,
  patientProfileId: string,
  file: File,
): Promise<{ path: string }> {
  const supabase = createClient();
  const accountScopedPath = buildMediaPath(accountId, file.name);
  const path = accountScopedPath.replace(
    `account-${accountId}/`,
    `account-${accountId}/patient-${patientProfileId}/`,
  );

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(error.message);

  return { path };
}

/** Short-lived signed URL — the only way to read from this private bucket. */
export async function getClinicalPhotoUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) {
    console.error("createSignedUrl error:", error);
    return null;
  }
  return data.signedUrl;
}

export async function deleteClinicalPhoto(path: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}
