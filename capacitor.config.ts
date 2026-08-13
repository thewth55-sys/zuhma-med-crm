import type { CapacitorConfig } from "@capacitor/cli";

/**
 * La app Android es un wrapper delgado — sin build web empaquetado.
 * `server.url` apunta el WebView directo a producción, así que un
 * deploy web es automáticamente lo que muestra la app; solo los cambios
 * NATIVOS (este archivo, el proyecto android/, config de plugins)
 * requieren una nueva APK/AAB.
 *
 * Arranca en /login, no en la raíz — el middleware ya redirige a un
 * visitante autenticado de /login a /dashboard, así que un usuario con
 * sesión pasa directo; uno sin sesión ve el login de inmediato.
 */
const config: CapacitorConfig = {
  appId: "com.zuhma.med",
  appName: "Zuhma Med",
  webDir: "mobile-www",
  server: {
    url: "https://medcrm.zuhma.online/login",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
