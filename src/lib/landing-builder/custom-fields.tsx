"use client";

import { useState, type ChangeEvent } from "react";
import type { CustomField } from "@puckeditor/core";
import { uploadAccountMedia, MEDIA_MAX_BYTES_BY_KIND } from "@/lib/storage/upload-media";

/**
 * "use client" is required even though these `render` functions are
 * only ever invoked inside the `<Puck>` editor — Next's RSC bundler
 * statically rejects any hook import reachable from a server
 * component's module graph, and this module is only reachable from
 * editor-config.tsx (client-only), never from blocks.tsx or
 * puck-config.tsx (both server-safe, no fields) — see blocks.tsx's
 * top comment for the full split.
 */

function ImageUploadFieldInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MEDIA_MAX_BYTES_BY_KIND.image) {
      setError("Imagen demasiado grande (máx. 5 MB)");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const { publicUrl } = await uploadAccountMedia("landing-media", file);
      onChange(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la imagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element -- editor preview of an arbitrary uploaded image
        <img src={value} alt="" className="h-24 w-full rounded-md border border-border object-cover" />
      ) : null}
      <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary">
        {uploading ? "Subiendo…" : value ? "Cambiar imagen" : `Subir ${label.toLowerCase()}`}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFile} disabled={uploading} />
      </label>
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="text-left text-xs text-muted-foreground underline hover:text-destructive"
        >
          Quitar imagen
        </button>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function imageUploadField(label: string): CustomField<string | undefined> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange }) => (
      <ImageUploadFieldInput value={value || ""} onChange={onChange} label={label} />
    ),
  };
}

export function colorField(label: string, defaultHex = "#4ade5a"): CustomField<string | undefined> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange }) => (
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || defaultHex}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
        />
        <input
          type="text"
          value={value || ""}
          placeholder={defaultHex}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border bg-transparent px-2 py-1 text-sm"
        />
      </div>
    ),
  };
}
