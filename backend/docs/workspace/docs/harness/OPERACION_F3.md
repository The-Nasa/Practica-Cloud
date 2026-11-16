# Operación local de catálogo, archivos e inventario

## Configuración y persistencia

Backend: `npm run dev:db` aplica las migraciones pendientes sin sobrescribir `.env`; `npm run start:dev` inicia la API y su procesador periódico de vencimientos. Frontend: `npm run dev`. El modo real no carga fixtures de negocio.

`MEDIA_ROOT` es el directorio persistente de objetos de imagen; el valor local predeterminado es `.media`, relativo al proceso API. La base guarda claves generadas por servidor y los endpoints devuelven URLs utilizables. Los archivos de producto, avatar, logo y banner comparten el mismo adaptador, validación y limpieza.

Docker Compose configura `/app/media` y monta `./.media` del backend; `MEDIA_HOST_PATH` permite elegir otro directorio de host. El Dockerfile prepara el directorio para el usuario de aplicación y establece `MEDIA_ROOT=/app/media` incluso fuera de Compose. En Linux, el directorio de host elegido debe permitir escritura al UID 1001 del contenedor; limitar ese permiso al directorio de imágenes. La configuración se valida con `docker compose config --quiet`, sin imprimir secretos.

La implementación local y el reinicio de API con las mismas referencias/objetos están verificados en DB aislada. Esto cubre operación de una instancia. Despliegue HTTPS, almacenamiento compartido para varias instancias y ensayo de restauración siguen siendo verificaciones de despliegue/piloto de F8.

Para respaldar una instancia, detener los escritores de archivos/API, realizar un respaldo PostgreSQL y copiar íntegramente `MEDIA_ROOT` como un mismo conjunto fechado, fuera de Git. Restaurar ambos elementos del mismo conjunto antes de reiniciar la API. No asumir que el backup de PostgreSQL contiene las imágenes. No borrar volúmenes para detener servicios. La prueba completa de restauración se ejecutará en F8.

## Contratos de archivos

| Recurso | Consulta | Publicación | Retiro |
| --- | --- | --- | --- |
| Avatar propio | `GET /me/avatar` | `PUT /me/avatar` | `DELETE /me/avatar` |
| Logo/banner de tienda propia | `GET /merchant/stores/:id/branding` | `PUT /merchant/stores/:id/branding/:kind` | `DELETE /merchant/stores/:id/branding/:kind` |
| Logo/banner público | `GET /stores/:id/branding` | Solo mediante gestión autorizada | Solo mediante gestión autorizada |
| Imágenes de producto | Detalle público/comercial de producto | `POST /merchant/products/:id/images` | `DELETE /merchant/products/:id/images/:imageId` |

Las rutas se entienden bajo `/api/v1`. `kind` solo permite `logo` o `banner`. Avatar devuelve `{ url }`; branding devuelve `{ logoUrl, bannerUrl }`; cada valor puede ser `null` si no existe imagen. Las URLs incluyen la clave vigente. No hay asignación de claves, usuario o permisos desde el cuerpo de carga.

Publicación de avatar/branding recibe `{ content }` con PNG base64 sin prefijo data URL. Producto añade `altText` y `position`. El navegador prepara PNG desde PNG/JPEG/WebP de hasta 10 MB; el servidor valida independientemente PNG RGB/RGBA de 8 bits sin entrelazado, hasta 1600 × 1600 y 2 MB, estructura/CRC y descompresión limitada. Se rechazan SVG y animación; se eliminan metadatos. JSON excesivo responde 413 sin copiar contenido al error.

La petición valida, escribe el objeto, vuelve a comprobar permisos y confirma la referencia con auditoría/outbox en una transacción. Una falla de la transacción conserva la referencia anterior y elimina el objeto nuevo. Reemplazo/eliminación solo retira el objeto anterior si ninguna tabla conserva su clave. El archivo sin referencia nunca concede acceso público.

Avatar requiere sesión de la misma cuenta; no existe acceso por ID de otro usuario. Las URLs de avatar son privadas y responden `no-store`. Propietario/encargado y administración gestionan branding conforme a F2; operador consulta. Una solicitud pendiente puede preparar imágenes en privado, pero una tienda suspendida no publica cambios. Logo/banner solo son públicos con tienda activa y zona habilitada; estado de recepción/horario no oculta la identidad de una tienda aprobada.

`npm run media:cleanup` simula la limpieza. Con todos los escritores detenidos, `npm run media:cleanup -- --apply` elimina únicamente archivos con nombre administrado, sin referencia en productos/cuentas/tiendas y de más de 24 horas. No recorre directorios ni elimina archivos ajenos o recientes. Cada suite del harness usa su propio directorio temporal.

## Vencimiento de aceptación

| Configuración | Predeterminado | Efecto |
| --- | --- | --- |
| `PENDING_ORDER_TTL_MINUTES` | `15` | Plazo de aceptación de pedidos nuevos; entero 1–1440. `0` crea pedidos sin vencimiento automático |
| `ORDER_EXPIRATION_INTERVAL_SECONDS` | `30` | Intervalo del worker dentro de la API; entero 1–3600. `0` detiene el intervalo |

El plazo se fija con reloj PostgreSQL al crear la compra y se replica en sus reservas. Cambiar configuración o reintentar una clave idempotente no amplía un plazo existente. Pedidos anteriores a la migración 003 conservan `acceptance_expires_at = null` y gestión manual.

Solo se vencen pedidos `pending`, de compra con una sola tienda, con intentos de efectivo aún `pending` y sin asignación de reparto. En la misma transacción se cambia el pedido a `cancelled`, se liberan reservas activas, se cancelan los intentos de efectivo y se registran evento de pedido, auditoría y outbox. Existencia física no cambia. El actor de sistema es `null`, con request ID y origen `pending-order-expiration`; no se crea una cuenta artificial.

Una aceptación que llega tarde devuelve 409 y deja confirmada la cancelación cuando el pedido es elegible. Pagos en proceso/digitales, asignaciones y compras multitienda requieren revisión y no liberan reservas automáticamente. La aceptación y el worker bloquean la misma fila del pedido; los workers concurrentes usan `SKIP LOCKED`. Los locks físicos por SKU mantienen orden estable. Un fallo revierte también reservas, pago y auditoría.

Un pedido aceptado (`confirmed`) conserva sus reservas aunque pase el plazo de aceptación. Lo mismo sucede durante preparación, listo y reparto. La fecha de reserva no libera stock por sí sola: debe existir una transición autorizada del pedido. Plazos de preparación y resolución de incidencias posteriores corresponden a F4, y la conciliación de pagos digitales a F6.

Para un lote manual: `npm run orders:expire -- --limit=50` (1–500 pedidos). Inicia contexto de aplicación sin servidor HTTP ni intervalo, procesa el lote y cierra conexiones. Solo imprime el número de pedidos vencidos; no acepta reloj o IDs arbitrarios del cliente. En pruebas se desactiva el intervalo del proceso principal y se verifican tanto el worker periódico como el comando sobre DB aislada.

La respuesta idempotente de creación sigue siendo el recibo original, incluso si luego vence el pedido. El consumidor debe consultar el estado vigente; reintentar esa clave no crea otra compra ni reserva de nuevo. El checkout web y la presentación de ese estado se completan en F4.
