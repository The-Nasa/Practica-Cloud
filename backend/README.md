# Backend de Quickly

API NestJS con `pg` y PostgreSQL 17. F2 añade solicitudes comerciales y de reparto, administración, membresías, horarios, zonas y direcciones reales. La arquitectura original está en [arquitectura-backend.md](./arquitectura-backend.md); el plan global, las decisiones y el seguimiento viven en la raíz del workspace (`PLAN_IMPLEMENTACION_BACKEND_FRONTEND.md`, `docs/harness/`).

## Desarrollo de la API

F8 prepara staging HTTPS, monitoreo administrativo y respaldo/restauración DB+imágenes. Manual y criterios del piloto en `docs/workspace/docs/harness/OPERACION_F8.md` y `CHECKLIST_PILOTO_F8.md`. Hay hallazgos de dependencias pendientes; no se declara listo para publicar ni piloto completado. `npm run test:f8` ensaya operación/recuperación aisladas; `npm run test:staging` verifica imágenes Docker, proxy/cookies HTTPS locales y persistencia tras reinicio sin utilizar desarrollo.

F0–F5 integran catálogo, compra/entrega en efectivo y operación. F7 incorpora checkout de varias tiendas con confirmación atómica y compras/envíos/cobros independientes; ver `docs/workspace/docs/harness/OPERACION_F7.md`. F6 conserva solo consultas de métodos/historial; pasarela, cobros digitales y reembolsos externos pendientes. Las demás ampliaciones F7 también están pendientes.

Para continuar desde otra máquina: [relevo F2, ramas y reconstrucción del workspace](docs/RELEVO_F2.md). Incluye el plan y la evidencia compartidos, conservados dentro de este repositorio.

Desde `backend/`, con Node 22 y una base exclusiva de desarrollo:

```powershell
npm ci
npm run dev:setup
npm run dev:db
npm run build
npm run start:dev
```

`dev:setup` crea `.env` con contraseñas aleatorias y nunca sobrescribe uno existente. `dev:db` levanta PostgreSQL 17 en Docker, instala el baseline automáticamente solo en el primer arranque de un volumen vacío, espera a que esté saludable y aplica las migraciones pendientes. La DB queda en `127.0.0.1:5433`, base `quickly_db`, usuario `quickly_user`; la contraseña queda únicamente en `.env`. El volumen `quickly-postgres-data` conserva los datos al detener/reiniciar. Ejecutar `dev:db` antes de iniciar también la API opcional en contenedor.

La API se ejecuta localmente con Node para desarrollo y usa esa DB Docker. No requiere PostgreSQL instalado en Windows. Opcionalmente, `docker compose up -d --build api` ejecuta también la API en contenedor de desarrollo, conectándose internamente a `postgres:5432`. API en `http://localhost:3000/api/v1`; Swagger en `http://localhost:3000/api/docs`. `GET /api/v1/health` devuelve 503 si PostgreSQL no está disponible. Producción usa la configuración separada F8 con HTTPS/cookie Secure; el compose local conserva NODE_ENV de desarrollo por defecto.

Detener la DB con `npm run dev:db:stop`; iniciarla nuevamente con `npm run dev:db`. No usar `docker compose down -v` para detenerla: elimina el volumen de datos. Cambiar las variables de contraseña después de inicializar un volumen no cambia automáticamente la contraseña del usuario PostgreSQL.

F1 usa sesión opaca en cookie `quickly_session`, HttpOnly, SameSite=Lax y duración `SESSION_TTL_HOURS` (72 por defecto). No se devuelve la credencial en JSON ni se acepta Bearer como sustituto. Registro/login rotan la cookie y revocan la sesión previa presentada. No hay creación pública de administradores: el harness usa fixtures privados en su base temporal.

`GET /api/v1/auth/session` restaura `{ user, csrfToken, expiresAt }`. `GET /api/v1/me` devuelve el perfil canónico con roles/membresías; `PATCH /api/v1/me` permite solo nombre, correo y teléfono propios. Logout revoca la sesión y elimina la cookie. Respuestas de identidad llevan `Cache-Control: no-store`.

Todas las mutaciones exigen un `Origin` incluido en `CORS_ORIGIN`. Las autenticadas exigen también `X-CSRF-Token` obtenido al registrar, iniciar o restaurar sesión. Desarrollo usa `http://localhost:5173`; CORS con credenciales nunca usa `*`. Login/registro tienen límite inicial `AUTH_RATE_LIMIT` (30 por minuto por IP/ruta), con 429 y Retry-After. Este contador es por proceso; revisar su almacenamiento al escalar réplicas.

En HTTP local usar `SESSION_COOKIE_SECURE=false`; en despliegue HTTPS usar `true`. El diseño usa proxy/mismo sitio; un frontend y API en sitios independientes requieren revisar la política de cookies antes de publicar.

## Arranque administrativo de F2

1. Iniciar DB/API y frontend. Registrar tu cuenta personal en la web.
2. Desde `backend/`: `npm run admin:bootstrap -- --email tu-correo@ejemplo.com`. Debe corresponder a una cuenta activa ya registrada; el comando habilita únicamente al primer administrador, con auditoría. Repetirlo para esa cuenta es idempotente; otra cuenta se rechaza si ya existe administrador.
3. Restaurar la sesión o iniciar sesión nuevamente. Entrar a administración y crear las zonas de cobertura antes de solicitar comercio/reparto o guardar direcciones. No se insertan zonas ni cuentas de negocio de ejemplo en desarrollo.

Las solicitudes están disponibles a cualquier cuenta autenticada. La aprobación concede el rol operativo; el rechazo permite corregir y reenviar. La administración exige motivo al aprobar, rechazar, suspender o reactivar. Cambiar identidad comercial o vehículo/placa aprobado exige otra revisión. Suspender una cuenta revoca sesiones y pausa su operación; reactivarla exige nuevo login.

Propietario gestiona equipo e identidad; encargado gestiona perfil operativo/horarios; operador consulta. Los permisos se verifican en servidor por membresía activa y recurso. Horarios usan `America/Lima`; medianoche requiere dividir intervalos por día. Abrir pedidos exige comercio y zona activos, recepción habilitada y horario vigente. No se suspenden cuentas con pedidos/asignaciones activos que quedarían abandonados.

`npm run db:migrate` aplica migraciones versionadas sin reinstalar el baseline. `platform.schema_migrations` registra nombre/checksum; editar una migración aplicada produce error. Las mutaciones nuevas de F2 guardan auditoría y outbox en la misma transacción; el procesamiento externo de eventos queda para fases posteriores.

## Verificaciones reproducibles

Leer [test/README.md](test/README.md) para configurar PostgreSQL aislado y ejecutar `npm run harness:check`. Incluye compilación, pruebas unitarias, instalación/verificación SQL y recorridos HTTP de permisos, idempotencia, concurrencia, cancelación, retiro y entrega con efectivo.

Con Docker configurado, usar `npm run harness:docker`: levanta exclusivamente `postgres-test` en `127.0.0.1:15432`, ejecuta el harness y detiene ese servicio al terminar. Su almacenamiento es temporal y separado del volumen de desarrollo. `npm run db:verify` verifica restricciones/vistas en la DB de desarrollo mediante fixtures que se revierten.

F1 añade `npm run harness:browser` (recorridos reales de registro/perfil/recarga/logout) y `npm run harness:full` (backend + contrato y compilación/pruebas frontend + navegador). Requieren el repositorio hermano `Frontend-Quickly/` y sus dependencias. El mismo comando completo desde la raíz es `node scripts/check-workspace.cjs`. El runner impide conectar el navegador de pruebas a `quickly_db`.

`npm run contracts:export` genera `openapi.json` después de compilar. El harness comprueba que esté actualizado; el frontend genera sus tipos desde ese contrato. No exportar entidades de persistencia como contrato web.

`npm run db:inspect` inspecciona metadatos de la base configurada mediante `DATABASE_URL`, dentro de una transacción de solo lectura. No imprime credenciales ni registros de usuarios. No modifica ni aplica automáticamente el baseline sobre una base existente.

El workflow `.github/workflows/harness.yml` ejecuta el mismo harness con PostgreSQL 17 cuando este repositorio backend se publica en GitHub. Su ejecución remota no está acreditada por la verificación local.

## Contratos y límites actuales

- `POST /auth/register`, `/auth/login`, `/auth/logout` y `GET /me` implementan autenticación real en API.
- Zonas y direcciones: consulta, alta y archivo de direcciones del usuario.
- Comercios: listado/detalle público de activos, alta pendiente y aprobación por admin. El rol comercial se concede al aprobar.
- Catálogo: categorías, productos de tienda, búsqueda y creación de producto+SKU+stock, autorizada por tienda.
- Pedidos: creación con `Idempotency-Key` obligatorio (1–200 caracteres), historial propio, comandas de tienda, cancelación y transiciones comerciales explícitas.
- Reparto: disponibles sin dirección privada del cliente, asignación propia, retiro y entrega. Solo perfil habilitado/online puede tomar pedidos.
- Plataforma: notificaciones propias y lectura; adaptador de auditoría corregido. La instrumentación completa de todas las mutaciones y el worker siguen en las fases del plan.
- Solo `cash` está habilitado. `card` y `yape_plin` son catálogos futuros; no prueban integración con pasarela.
- `categoryId` es obligatorio al crear producto. F2 persiste razón social/RUC mediante migración aditiva; el RUC es opcional y valida formato de 11 dígitos, sin verificación tributaria externa.
- Estado de asignación inicial: `accepted`; fecha: `accepted_at`. Estado de pedido en camino: `in_transit`.
- F1 formaliza DTO y validación del dominio de identidad en camelCase. Las respuestas históricas de otros módulos aún combinan snake_case/camelCase; se migrarán junto con sus pantallas en su fase. Los mocks de negocio solo se presentan en el modo demo explícito.
- La política temporal `COURIER_FEE_BPS=8000` conserva el 80% para pruebas, pendiente de acuerdo comercial antes del piloto.

## Archivos

| Archivo | Uso |
| --- | --- |
| [001_schema.sql](./001_schema.sql) | Instala el modelo en una base PostgreSQL vacía. |
| [002_verificar.sql](./002_verificar.sql) | Comprueba restricciones y vistas con datos temporales que se revierten. |
| [arquitectura-backend.md](./arquitectura-backend.md) | Diseño de referencia y responsabilidades objetivo. |
| [test/README.md](./test/README.md) | Harness local y pruebas PostgreSQL/HTTP. |

## Requisitos

- PostgreSQL 17 o superior y cliente `psql`.
- Una base vacía exclusiva para desarrollo/pruebas; no usar una base operativa.
- Un usuario propietario de esa base con permiso para crear schemas y funciones.
- No se necesitan extensiones ni Docker para ejecutar los scripts.

El SQL no crea la base ni usuarios PostgreSQL y no contiene contraseñas. Tampoco elimina schemas existentes. El baseline se ejecuta una sola vez; una segunda instalación sobre la misma base falla y revierte esa ejecución, en lugar de ocultar diferencias con `IF NOT EXISTS`.

## Ejecución con psql

Desde la raíz del repositorio, adaptar host, puerto y usuario. La contraseña se solicita de forma interactiva; no escribirla dentro de los archivos ni de una URL guardada en el repositorio.

```powershell
createdb -h localhost -p 5432 -U postgres quickly_backend_dev

psql -X -h localhost -p 5432 -U postgres -d quickly_backend_dev -v ON_ERROR_STOP=1 -f backend/001_schema.sql

psql -X -h localhost -p 5432 -U postgres -d quickly_backend_dev -v ON_ERROR_STOP=1 -f backend/002_verificar.sql
```

Comprobar que cada comando termine con código 0 antes de continuar. En PowerShell, `$LASTEXITCODE` contiene el código del ejecutable anterior; lanzar una excepción si no es cero al automatizar la secuencia.

Si `psql` no está en PATH, usar su ruta de instalación. Por ejemplo, en Windows:

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -h localhost -p 5432 -U postgres -d quickly_backend_dev -v ON_ERROR_STOP=1 -f backend/001_schema.sql
```

El `BEGIN`/`COMMIT` del baseline hace transaccional la creación. `ON_ERROR_STOP` detiene `psql` ante el primer fallo. El script de verificación termina con un aviso `OK` y `ROLLBACK`: conserva tablas y catálogos, pero no sus datos de prueba.

## Ejecución desde pgAdmin

Crear una base vacía de desarrollo y abrir Query Tool sobre ella. Ejecutar completo `001_schema.sql`; comprobar `COMMIT`. Después ejecutar completo `002_verificar.sql` y comprobar el aviso `OK` y `ROLLBACK`. Si hay un error, revertir la transacción fallida antes de repetir en una base de pruebas limpia.

## Inspección rápida

```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema IN (
  'identity', 'geography', 'merchant', 'catalog', 'ordering',
  'inventory', 'billing', 'delivery', 'support', 'platform'
)
ORDER BY table_schema, table_name;

SELECT * FROM ordering.purchase_totals;
SELECT * FROM inventory.availability;
```

No importar directamente el `localStorage` del prototipo. Antes de migrar datos se necesitan validación de usuarios reales, mapeo de IDs a UUID, SKU, existencias por variante, roles aprobados y exclusión de pagos simulados.

## Límites

Los scripts SQL preparan el esquema y prueban su integridad. Los endpoints están en `src/` y se verifican mediante el harness. F0–F5 integran catálogo/inventario, compra a entrega en efectivo, soporte, favoritos/reseñas, notificaciones internas y reportes. Pasarela digital y preparación de piloto conservan F6/F8; ver `docs/workspace/docs/harness/ESTADO.md`. Crear tablas no equivale a completar la aplicación.

## Verificación realizada

El 22 de octubre de 2026 se instaló el baseline en una instancia temporal aislada de PostgreSQL 17.4 y se ejecutó `002_verificar.sql` satisfactoriamente. Se crearon 41 tablas en 10 schemas y 5 vistas. También se comprobaron, con dos conexiones simultáneas, la disputa por la última unidad de stock, la misma entrega y el mismo reembolso; la segunda operación esperó y fue rechazada en los tres casos.

La instancia de prueba se creó para esta tarea; los comandos de uso anteriores permiten repetir la instalación y las pruebas SQL en otra base vacía.
