# Evidencia F1: integración de identidad web

Fecha: 26 de octubre de 2026. Estado: implementada y validada en desarrollo local. Despliegue público/HTTPS no realizado.

## Resultado funcional

La aplicación en modo real permite registrar una cuenta con contraseña, iniciar sesión, recuperar identidad tras recargar, consultar/editar perfil y cerrar/revocar sesión. Los datos persisten en PostgreSQL Docker. El servidor determina roles y membresías; modificar localStorage o elegir una ruta de administrador no otorga permisos.

Las pantallas de negocio pendientes no simulan operaciones con esa identidad. El prototipo completo se mantiene mediante `npm run dev:demo`, con sus fixtures y pruebas aislados. En modo real se muestran las capacidades disponibles, sin compras, aprobaciones o solicitudes ficticias.

## Implementación

### Backend

- `web-session.ts`: cookie opaca `quickly_session`, HttpOnly, Path=/, SameSite=Lax; Secure según ambiente HTTPS. La DB conserva únicamente hash de credencial.
- `AuthGuard`: valida cookie, revocación, vencimiento y usuario activo; para mutaciones valida CSRF derivado de esa sesión. Bearer deja de ser una vía de autenticación.
- `configure-http.ts`: Origin exacto para mutaciones, CORS con credenciales, request ID, no-store en identidad y límite por IP/ruta en login/registro (30 por minuto por defecto).
- Registro/login emiten cookie y `{ user, csrfToken, expiresAt }`; no devuelven token de sesión. Rotan y revocan la cookie previa presentada. Logout revoca el registro y limpia cookie.
- `GET /auth/session`: restauración; `GET /me`: perfil con roles/membresías/courierId; `PATCH /me`: solo nombre, correo y teléfono propios.
- DTO validados y error uniforme documentado; perfil no admite roles/estado/IDs enviados por cliente.
- OpenAPI generado en `backend/openapi.json`, con comprobación de drift antes de pruebas. No fue necesario modificar el baseline SQL.

### Frontend

- `apiClient.ts`: credenciales incluidas, CSRF en memoria, errores de API/red, timeout y abort, respuesta 204, política 401/403 y descarte de respuestas de otra generación de sesión. Sin reintentos automáticos de mutaciones.
- `identityApi.ts`: tipos generados desde OpenAPI y validación de respuesta con Zod.
- `authStore.ts`: identidad/cache en memoria, restauración, operaciones asíncronas y contexto limitado a roles/membresías concedidos. Las credenciales no se guardan en localStorage.
- `SessionBoundary` y `RequireSession`: estados de verificación/conexión, reintento, navegación protegida y denegación de rol.
- Formularios reales de registro/login/perfil, con éxito solo tras respuesta persistida y error visible cuando falla.
- `BroadcastChannel` y refresco al recuperar foco sincronizan sesiones; se invalidan datos privados y peticiones anteriores. El cierre fallido por red no se anuncia como exitoso.
- Vite proxy `/api` conserva Origin y sirve web/API bajo el mismo origen local. Producción necesita configurar el proxy hacia la API desplegada.
- `VITE_APP_MODE=real` predeterminado; `.env.demo` habilita exclusivamente el prototipo en 5175. Identidad/localStorage/Google demo no autentican la aplicación real.

## Harness y contratos

Comando integral desde la raíz:

```powershell
node scripts/check-workspace.cjs
```

Equivalente desde backend: `npm run harness:full`. El servicio Docker de pruebas tiene credenciales, puerto y almacenamiento distintos al de desarrollo. Cada suite SQL/HTTP o navegador usa una DB aleatoria con baseline instalado y verificado.

- API: Jest + pruebas HTTP/SQL con PostgreSQL real.
- Frontend: sincronización OpenAPI, TypeScript/Vite y Vitest.
- Navegador: Playwright usa Edge instalado en Windows; API y Vite temporales en 3001/5174. El runner rechaza nombres de DB fuera del patrón temporal y no reutiliza servidores existentes.
- CI backend y frontend validan sus respectivos repositorios. La ejecución conjunta remota necesita ambos checkouts; no se publicó ni ejecutó CI remota en esta sesión.

Si cambia un contrato:

```text
backend/:          npm run build
backend/:          npm run contracts:export
Frontend-Quickly/: npm run contracts:sync
raíz/:            node scripts/check-workspace.cjs
```

## Validación final

Entorno: Node 22.17.0, PostgreSQL 17 en Docker, Edge sin ventana visible. Comando integral final: código de salida 0.

| Control | Resultado |
| --- | --- |
| Compilación backend y comprobación OpenAPI | Aprobadas |
| Unitarias backend | 5/5 |
| Instalación/verificación SQL | Aprobada |
| Escenarios HTTP F0/F1 | 23/23 |
| Contratos frontend y compilación TypeScript/Vite | Aprobados |
| Pruebas frontend | 88/88, en 18 archivos |
| Recorridos Playwright | 4/4 |
| Total de pruebas automatizadas | 120 aprobadas |

Recorridos reales de navegador:

1. Crear cuenta, verificar HttpOnly/SameSite y ausencia de credencial en JS/storage, guardar perfil, recargar y cerrar sesión.
2. Contraseña incorrecta sin sesión, login correcto, denegación de panel admin al cliente y bloqueo de checkout simulado.
3. Perfil usable en ancho móvil de 390 px sin desbordamiento; logout sincronizado entre dos pestañas.
4. Identidad manipulada en storage sin privilegios; error de red con reintento y recuperación.

Además, API/HTTP comprueban origen/CSRF faltantes o ajenos, cookie rotada/revocada/vencida, ausencia de credencial JSON, datos propios, elevación de privilegios rechazada, membresías reales y límite de autenticación con 429/Retry-After. Las pruebas de stock, idempotencia, cancelación y reparto de F0 siguen aprobadas.

## Límites y siguiente fase

- F2 conecta cuentas operativas, solicitudes, aprobaciones, miembros, zonas/direcciones y horarios. No se habilitan esas operaciones desde fixtures en modo real.
- Catálogo, checkout, pagos, soporte, notificaciones y reportes se integran en sus fases. Sus contratos históricos aún no están todos normalizados; F1 tipa/valida identidad y establece el mecanismo común.
- Google y recuperación de contraseña no están habilitados en la experiencia real; requieren su implementación prevista.
- El contador inicial de intentos vive por proceso. Revisar un almacén compartido al escalar la API.
- Antes del piloto, validar HTTPS, Secure, CORS y proxy en staging público. La configuración SPA de Vercel necesita un destino `/api` real cuando la API se despliegue.
- No se hizo deploy ni commit. Los contenedores/servidores de pruebas se detuvieron y las bases temporales se eliminaron; el volumen de desarrollo permanece independiente.
- Comprobación final de solo lectura sobre desarrollo: 0 usuarios y 0 compras, confirmando que los fixtures quedaron en bases temporales.
