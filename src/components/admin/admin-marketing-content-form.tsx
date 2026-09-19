"use client";

import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MAX_COMPLIANCE_ITEMS = 4;

type ContentType = "reel" | "carrusel" | "historia" | "";

interface AdminMarketingContentFormProps {
  accountId: string;
}

function isDriveUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname === "drive.google.com";
  } catch {
    return false;
  }
}

export function AdminMarketingContentForm({ accountId }: AdminMarketingContentFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState<ContentType>("");
  const [driveUrl, setDriveUrl] = useState("");
  const [scheduledPublishAt, setScheduledPublishAt] = useState("");
  const [complianceChecklist, setComplianceChecklist] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleTitleChange(e: ChangeEvent<HTMLInputElement>) {
    setTitle(e.target.value);
  }

  function handleDescriptionChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setDescription(e.target.value);
  }

  function handleComplianceChange(e: ChangeEvent<HTMLTextAreaElement>) {
    setComplianceChecklist(e.target.value);
  }

  function handleDriveUrlChange(e: ChangeEvent<HTMLInputElement>) {
    setDriveUrl(e.target.value);
  }

  function handleScheduledChange(e: ChangeEvent<HTMLInputElement>) {
    setScheduledPublishAt(e.target.value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim() || !driveUrl.trim() || !contentType) {
      toast.error("Todos los campos son requeridos");
      return;
    }

    if (!isDriveUrl(driveUrl)) {
      toast.error("La URL debe ser un link válido de drive.google.com");
      return;
    }

    setIsSubmitting(true);
    try {
      const compliance = complianceChecklist
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, MAX_COMPLIANCE_ITEMS);

      const res = await fetch(`/api/platform-admin/accounts/${accountId}/marketing-content`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          content_type: contentType,
          drive_url: driveUrl.trim(),
          scheduled_publish_at: scheduledPublishAt
            ? new Date(scheduledPublishAt).toISOString()
            : null,
          compliance_checklist: compliance.length > 0 ? compliance : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error ?? "No se pudo subir la pieza");
        return;
      }
      toast.success("Pieza subida");
      setTitle("");
      setDescription("");
      setContentType("");
      setDriveUrl("");
      setScheduledPublishAt("");
      setComplianceChecklist("");
    } catch (err) {
      console.error("[AdminMarketingContentForm] submit failed:", err);
      toast.error("No se pudo subir la pieza");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva pieza de contenido</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input id="title" value={title} onChange={handleTitleChange} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Bajada corta (opcional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={handleDescriptionChange}
              placeholder="Explicación breve que la clínica verá bajo el título"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="content_type">Tipo de contenido</Label>
            <Select
              value={contentType}
              onValueChange={(v) => v && setContentType(v as ContentType)}
            >
              <SelectTrigger id="content_type" className="w-full">
                <SelectValue placeholder="Selecciona un tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reel">Reel</SelectItem>
                <SelectItem value="carrusel">Carrusel</SelectItem>
                <SelectItem value="historia">Historia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="drive_url">URL de Google Drive</Label>
            <Input
              id="drive_url"
              type="url"
              value={driveUrl}
              onChange={handleDriveUrlChange}
              placeholder="https://drive.google.com/file/d/.../view"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scheduled_publish_at">
              Fecha y hora de publicación programada (opcional)
            </Label>
            <Input
              id="scheduled_publish_at"
              type="datetime-local"
              value={scheduledPublishAt}
              onChange={handleScheduledChange}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compliance_checklist">
              Checklist de cumplimiento (opcional, una línea por punto, máx. {MAX_COMPLIANCE_ITEMS})
            </Label>
            <Textarea
              id="compliance_checklist"
              value={complianceChecklist}
              onChange={handleComplianceChange}
              placeholder={"No promete resultados clínicos\nSin fotos de antes y después engañosas"}
              rows={4}
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Subir pieza
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
