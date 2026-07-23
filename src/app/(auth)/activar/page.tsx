"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPasswordStrengthError } from "@/lib/password-strength";
import { Loader2 } from "lucide-react";

// Activación de cuenta por CÓDIGO. El dueño llega aquí desde el correo
// (no desde un link de un solo uso). Ingresa correo + código + contraseña
// y acepta los T&C; luego queda logueado automáticamente.
export default function ActivatePage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (getPasswordStrengthError(password)) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (!termsAccepted) {
      setError("Debes aceptar los Términos y Condiciones.");
      return;
    }

    setLoading(true);

    const res = await fetch("/api/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        code: code.trim(),
        password,
        termsAccepted,
      }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? "No se pudo activar la cuenta.");
      setLoading(false);
      return;
    }

    // Cuenta activada: iniciar sesión con la contraseña recién creada.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (signInErr) {
      // Activó correctamente pero el auto-login falló; que entre manual.
      router.replace("/login?activated=1");
      return;
    }
    router.replace("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
    <Card className="w-full max-w-md border-border bg-card">
      <CardHeader>
        <CardTitle>Activa tu cuenta</CardTitle>
        <CardDescription>
          Ingresa el código que recibiste por correo y define tu contraseña.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Código de activación</Label>
            <Input
              id="code"
              inputMode="text"
              autoCapitalize="characters"
              placeholder="Ej. K7M2QRXA"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono tracking-widest"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Nueva contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
            />
            <span>
              Acepto los{" "}
              <Link href="/terminos" target="_blank" className="text-primary underline">
                Términos y Condiciones
              </Link>{" "}
              de la plataforma.
            </span>
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Activar mi cuenta
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          ¿Ya activaste tu cuenta?{" "}
          <Link href="/login" className="text-primary underline">
            Inicia sesión
          </Link>
        </p>
      </CardContent>
    </Card>
    </div>
  );
}
