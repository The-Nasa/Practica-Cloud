# F5: operación real

## Persistencia y contratos

Migración aditiva `005_f5_engagement.sql`: favoritos por producto, deduplicación de notificaciones por evento/destinatario, versión de ticket y vínculo único incidencia-ticket. Favoritos por tienda y reseñas conservan las tablas del baseline. No se reconstruyen avisos ni tickets para incidencias históricas sin vínculo. Baseline y migraciones previas intactos.

OpenAPI es el contrato fuente; tipos frontend generados, respuestas validadas por Zod. No se importan favoritos, mensajes, ganancias ni notificaciones del prototipo/localStorage. El modo demo sigue separado.

## Favoritos y reseñas

- `GET /me/favorites`, paginado por UUID; productos y tiendas guardados por la cuenta actual. Los recursos deshabilitados se muestran como no disponibles y pueden eliminarse.
- `PUT/DELETE /me/favorites/products/:id` y `/stores/:id`: estado deseado idempotente, sin cuerpo de identidad ni precio. Altas requieren recurso público habilitado. Bajas no afectan favoritos de otra cuenta.
- `POST /orders/:id/reviews`: comprador, pedido entregado, puntuación entera 1–5, comentario máximo 1000 caracteres, una reseña por pedido. No admite modificar reseñas ajenas ni inventar entregas.
- `GET /stores/:id/reviews`: tienda pública habilitada, comentarios paginados y agregado calculado en PostgreSQL, sin publicar identidad/contacto del comprador.

Catálogo y detalle permiten guardar favoritos; la cuenta tiene listado propio. Tienda muestra reseñas y pedido entregado permite calificarlas.

## Soporte e incidencias

`GET/POST /me/tickets`, `GET /me/tickets/:id`, `POST /tickets/:id/messages`; administración usa `GET /admin/tickets`, `GET /admin/tickets/:id` y `POST /admin/tickets/:id/decisions`.

La descripción inicial y cada respuesta se guardan como mensajes separados. Asunto máximo 150 caracteres; mensajes máximo 3000, sin blancos. La cuenta solo consulta sus tickets; al vincular un pedido debe ser comprador, miembro activo de la tienda o repartidor relacionado. Administración requiere cuenta activa con rol verificado dentro de la transacción.

Decisión administrativa exige mensaje, versión esperada, estado (`open`, `in_review`, `resolved`) y prioridad (`low`, `normal`, `high`). Cada mensaje incrementa versión. Resolución guarda fecha y mensaje; un mensaje normal no reabre una resolución. Administración puede reabrir explícitamente con otra decisión auditada.

Incidencia de reparto crea ticket, mensaje, incidencia, auditoría y outbox en una transacción. El lock de la asignación serializa intentos: mismo reportante/asignación/descripción devuelve la incidencia y ticket existentes. Una descripción idéntica se interpreta como reintento; seguimiento adicional va en la conversación. Se conserva `expectedVersion` y autorización de la asignación. Resolver ticket actualiza fecha de resolución de la incidencia vinculada; no entrega/cancela el pedido, cobra/reembolsa dinero ni devuelve stock. Reasignación sigue la regla F4 anterior al retiro.

## Notificaciones internas y outbox

`GET /me/notifications`: página y contador propio sin leer; `PATCH /me/notifications/:id/read` y `/me/notifications/read-all`: lectura idempotente. Recurso ajeno devuelve 404. Rutas históricas `/notifications` se conservan por compatibilidad, pero las pantallas usan el nuevo contrato camelCase.

Worker en API: `NOTIFICATION_INTERVAL_SECONDS=30` por defecto; 0 desactiva intervalo, entorno `test` desactiva ejecución automática. El intervalo valida rango 0–3600 segundos. En pruebas se invoca `NotificationWorker.runBatch()` de forma explícita.

Un lote reclama hasta 25 eventos mediante `FOR UPDATE SKIP LOCKED`. Avisos y publicación se confirman juntos en el mismo cliente/transacción; no hay servicios externos bajo locks. Una caída revierte locks y efectos sin necesitar una concesión persistente. Savepoint por evento revierte avisos parciales ante fallo; conserva evento sin publicar, incrementa intentos y programa backoff exponencial de 5 segundos hasta una hora. El índice evento/usuario evita duplicados incluso al volver a procesar un evento publicado. Destrucción del módulo detiene intervalo y espera lote en curso.

Destinatarios proceden de joins del servidor: cliente, miembros activos y reparto relacionado para pedidos; solicitante/administradores para soporte; miembros o titular para decisiones de habilitación. Títulos, textos y URLs están definidos en código, sin copiar URLs o texto arbitrario del payload. El canal interno consume los eventos actuales; eventos sin aviso interno se reconocen sin inventar un aviso. F6 deberá coordinar consumidores adicionales antes de usar `published_at` como publicación a un proveedor.

La navegación muestra contador con actualización cada 30 segundos. La lista tiene actualización y lectura individual/masiva. Consultas se aíslan por cuenta y se cancelan al cambiar sesión. No se habilitan correo/push, ni preferencias por canales todavía inexistentes; requieren proveedor y alcance posterior, conforme a M10.

## Reportes, tarifas y auditoría

`GET /merchant/stores/:id/reports`, `/courier/earnings`, `/admin/reports`. Miembro de tienda/rol de reparto/administración se verifican en servidor. Reparto solo suma asignaciones entregadas del propio usuario; ningún cálculo monetario procede de Zustand.

Rango `from` inclusivo y `to` exclusivo, ISO 8601 con offset obligatorio; predeterminado últimos 30 días, máximo 366. Pantalla interpreta fecha/hora local y envía instantes ISO. Cohorte definida por creación del pedido y estado vigente, no por fecha de cobro o entrega. La definición y rango se devuelven en el contrato y se muestran antes de los indicadores.

Pedidos, entregados y cancelados/rechazados; ventas entregadas = total incluido envío de pedidos entregados; efectivo confirmado = importe neto debido de pagos cash succeeded de esa cohorte, sin sumar billetes ni cambio; tarifas = importes pactados de asignaciones entregadas. Se consultan como agregados independientes para evitar multiplicar filas por joins. Exportación CSV descarga exactamente los mismos resultados autorizados y filtrados, en céntimos; no exporta datos personales.

Las tarifas no declaran saldo pagadero, custodia ni liquidación financiera. No hay KPIs ficticios de reembolso digital, pagos efectivos al repartidor, comisión final o tiempos prometidos. Fórmula de tarifa de desarrollo D06 y conciliación/custodia conservan su decisión operativa antes del piloto.

`GET /admin/audit`: paginación descendente por ID bigint y filtro exacto de acción. Devuelve actor, acción, entidad, request ID y fecha; no expone indiscriminadamente el JSON de detalles ni credenciales. Auditoría de mutaciones se escribe dentro de su transacción y no tiene endpoint de edición/eliminación. Las acciones F2/F3/F4 y nuevas F5 comparten esta consulta.

## Verificación con menos repeticiones

Durante desarrollo: tipos y pruebas del bloque afectado. `npm run test:f5` compila, prepara DB aleatoria y prueba solo F5; `--keep-db` mantiene el contenedor de pruebas para siguientes bloques. Cada DB aleatoria se elimina siempre, independiente de conservar el contenedor. Alternativa después de compilar: `node test/run-e2e.cjs --suite=f5` sobre servidor de pruebas ya iniciado.

Cierre: `node scripts/check-workspace.cjs`, con registro automático completo y resultado/duración en `.tmp/workspace-check.log`. Admite `--keep-db` para conservar PostgreSQL durante correcciones. Si falla, corregir y repetir el bloque afectado, conservando evidencia vigente de los aprobados. Al finalizar: `docker compose --profile test stop postgres-test`. Nunca `down -v` ni pruebas sobre desarrollo.

Pruebas F5: favoritos aislados/idempotentes, reseña autorizada única, conversación/versiones y resolución independiente del pedido, incidencia con ticket único, consumidores concurrentes, reproducción sin duplicación, fallo con rollback/backoff y reportes comparados contra SQL. El recorrido web F4/F5 incluye favoritos persistentes, reseña pública, soporte cliente/admin, reporte comercio/tarifas reparto, exportación, auditoría y pantalla de avisos. Los avisos con eventos y reintentos se comprueban en integración; el navegador de pruebas tiene worker automático deshabilitado.
