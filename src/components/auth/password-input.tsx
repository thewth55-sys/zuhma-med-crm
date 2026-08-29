'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, 'type'> & {
  /** Etiquetas accesibles del botón mostrar/ocultar. */
  showLabel?: string;
  hideLabel?: string;
};

/**
 * Input de contraseña con toggle mostrar/ocultar (el "ojito"). Reenvía
 * todas las props al Input base; solo controla el `type`.
 */
export function PasswordInput({ className, showLabel = 'Mostrar contraseña', hideLabel = 'Ocultar contraseña', ...props }: PasswordInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className={cn('pr-10', className)} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? hideLabel : showLabel}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
