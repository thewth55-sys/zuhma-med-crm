// ============================================================
// Cliente mínimo de Odoo por JSON-RPC (sin dependencias).
//
// Se usa el endpoint {ODOO_URL}/jsonrpc de la API externa de Odoo, que
// funciona en Odoo Online (*.odoo.com) y self-hosted, Community o
// Enterprise. La autenticación usa una API Key de Odoo (Ajustes →
// Usuarios → Cuenta → Llaves de API), no la contraseña de la cuenta.
//
// Config por variables de entorno:
//   ODOO_URL       p.ej. https://miempresa.odoo.com
//   ODOO_DB        nombre de la base de datos
//   ODOO_USERNAME  login del usuario integrador
//   ODOO_API_KEY   API key de ese usuario
// ============================================================

const ODOO_URL = process.env.ODOO_URL;
const ODOO_DB = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY = process.env.ODOO_API_KEY;

export function odooConfigured(): boolean {
  return Boolean(ODOO_URL && ODOO_DB && ODOO_USERNAME && ODOO_API_KEY);
}

function baseUrl(): string {
  return (ODOO_URL ?? "").replace(/\/+$/, "");
}

async function jsonRpc(service: string, method: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(`${baseUrl()}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: 1,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`Odoo respondió HTTP ${res.status}`);

  const data = (await res.json()) as {
    result?: unknown;
    error?: { message?: string; data?: { message?: string } };
  };
  if (data.error) {
    throw new Error(data.error.data?.message || data.error.message || "Error de Odoo");
  }
  return data.result;
}

// El uid rara vez cambia; se cachea a nivel de módulo. En un entorno
// serverless se re-autentica de forma natural en la siguiente instancia.
let cachedUid: number | null = null;

async function authenticate(): Promise<number> {
  if (!odooConfigured()) {
    throw new Error("Odoo no está configurado (ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY).");
  }
  if (cachedUid) return cachedUid;
  const uid = (await jsonRpc("common", "authenticate", [ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}])) as
    | number
    | false;
  if (!uid) throw new Error("Autenticación con Odoo fallida (revisa DB, usuario y API key).");
  cachedUid = uid;
  return uid;
}

/**
 * Llama a un método de un modelo de Odoo (equivalente a execute_kw del
 * XML-RPC clásico). `args` son los argumentos posicionales del método y
 * `kwargs` los nombrados (fields, order, etc.).
 */
export async function odooExecuteKw<T = unknown>(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<T> {
  const uid = await authenticate();
  return jsonRpc("object", "execute_kw", [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs]) as Promise<T>;
}
