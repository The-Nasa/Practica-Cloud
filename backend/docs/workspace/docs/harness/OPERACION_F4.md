# Operación local de compra a entrega en efectivo

## Recorrido

1. Comercio aprobado con recepción habilitada y horario vigente publica producto/SKU y stock mediante F3.
2. Cliente agrega SKU al carrito real, selecciona productos de una tienda y elige dirección propia en zona activa. En esta primera operación tienda, destino y repartidor pertenecen a la misma zona.
3. Checkout solicita cotización al servidor. Solo efectivo está habilitado; el cliente declara importe exacto o billete previsto. Precios, disponibilidad, mínimo, envío, total y cambio proceden del servidor.
4. Al confirmar se conserva una intención por cuenta en sessionStorage y se envía una clave idempotente. Compra, destino histórico, líneas, reserva, efectivo pendiente, evento, auditoría/outbox y respuesta se confirman en la misma transacción.
5. Comercio acepta, inicia preparación y marca listo. El plazo de aceptación de F3 sigue vigente para pedidos pendientes.
6. Repartidor aprobado/disponible en esa zona toma una entrega. Antes de asignación no obtiene dirección ni teléfono del cliente. Solo mantiene una asignación activa.
7. Al retirar se consumen reserva y stock una sola vez; pedido pasa a `in_transit`. Al entregar, el repartidor confirma efectivo recibido; servidor verifica que cubra el total y registra entrega/cobro/cobrador/fecha atómicamente.
8. Cliente y administración consultan estado, importes y timeline remoto. Seguimiento representa estados reales; no hay posición geográfica simulada.

Cliente: `/carrito`, `/checkout`, `/cliente/pedidos`, `/cliente/pedidos/:id`. Comercio: `/comercio/pedidos?store=<id>`. Reparto: `/repartidor/solicitudes`, `/repartidor/entrega-activa`, `/repartidor/historial` y detalle del pedido. Administración: `/admin/pedidos` y detalle.

## Intenciones locales y recuperación

`quickly_cart_real_v2` guarda solo SKU/producto/tienda, cantidad, nota, selección y revisión local. No incorpora IDs mock del carrito anterior ni precios, perfiles o estados de negocio como hechos. Nombres, precios y disponibilidad se consultan en HTTP. Seleccionar otra tienda conserva los ítems no seleccionados. Confirmación retira únicamente las intenciones compradas que permanecen sin cambios; conserva otros ítems y ediciones posteriores.

La confirmación pendiente se guarda bajo una clave de sessionStorage por cuenta con UUID idempotente, payload y revisiones del carrito. No es una credencial. Tras una recarga o respuesta perdida, se consulta `GET /me/checkout-attempts/:key`; si aún no existe recibo confirmado se reenvía exactamente la misma intención y clave. No se emite una compra nueva mientras haya resultado incierto. Los errores HTTP de validación permiten corregir la intención después de recibir una respuesta definitiva. Un registro local dañado exige revisar pedidos antes de descartarlo.

La cotización no reserva ni garantiza stock. `expectedTotalCents` es el importe revisado: la compra recalcula todo y rechaza `PRICE_CHANGED` si el total difiere. El cliente puede entonces cotizar/revisar nuevamente. Ni total enviado, ni tienda del carrito, ni identidad del navegador sustituyen el cálculo/autorización del servidor.

La respuesta idempotente de creación conserva el recibo original. La recuperación y el detalle consultan el estado actual, incluyendo cancelación/vencimiento; no interpretan ese recibo como pedido todavía pendiente.

## Contratos principales

Rutas bajo `/api/v1`, sesión HttpOnly y CSRF/Origin en mutaciones:

| Ruta | Función |
| --- | --- |
| `POST /checkout/quote` | Cotización con dirección, SKU/cantidad/notas, efectivo previsto; no reserva |
| `POST /purchases` | Compra con `Idempotency-Key`, total revisado y efectivo previsto |
| `GET /me/checkout-attempts/:key` | Recuperación del pedido de esa cuenta por clave |
| `GET /me/orders` | Pedidos propios paginados |
| `GET /orders/:id` | Detalle/timeline autorizado por recurso |
| `GET /me/purchases/:id` | Detalle de compra propia |
| `GET /merchant/stores/:id/order-feed` | Pedidos paginados de tienda con membresía vigente |
| `POST /merchant/orders/:id/accept`, `/start-preparation`, `/mark-ready` | Transiciones comerciales permitidas |
| `POST /merchant/orders/:id/rejections` | Rechazo de pendiente con motivo |
| `POST /orders/:id/cancellations` | Cancelación de pendiente/confirmado con motivo y permiso |
| `GET /courier/orders?scope=available\|active\|history` | Listas del repartidor; disponibles sin destino personal |
| `POST /courier/orders/:id/claim` | Toma de pedido listo con perfil, zona y disponibilidad válidos |
| `POST /courier/assignments/:id/pickup` | Retiro propio, consumo y estado en camino |
| `POST /courier/assignments/:id/deliver` | Entrega propia y efectivo recibido confirmado |
| `POST /courier/assignments/:id/release` | Liberar asignación propia antes del retiro con motivo |
| `POST /courier/assignments/:id/incidents` | Reportar incidencia de asignación activa propia |
| `GET /admin/orders`, `/admin/courier-options` | Consulta administrativa y selección de perfiles disponibles |
| `POST /admin/orders/:id/assignment` | Asignación manual con motivo y mismas restricciones del reparto |
| `POST /admin/assignments/:id/release` | Retiro administrativo de asignación antes de recojo |

Listas nuevas usan `{ items, nextCursor }`, filtros por estado y cursor UUID estable. Consultas históricas `GET /me/purchases`, `/merchant/stores/:id/orders`, `/courier/available-orders` y `/courier/active-assignment` conservan formato anterior; las pantallas reales usan los contratos nuevos.

Las acciones públicas exigen `expectedVersion`. Para acciones comerciales/cancelación/asignación es la versión del pedido; para retiro/entrega/liberación/incidencia es la de asignación. Un conflicto devuelve 409 y exige recarga. DTOs públicos y tipos generados se actualizan mediante OpenAPI; llamadas antiguas sin versión deben adaptarse. Entrega exige además `cashReceivedCents`; no se confirma efectivo sin ese importe.

## Efectivo y límites operativos

Migración 004 agrega `cash_tender_cents` (previsto), `cash_received_cents` (recibido bruto confirmado), y versión de asignación. No modifica baselines ni migraciones aplicadas ni inventa importes históricos. El total neto cobrado es `payment_attempts.amount_cents`; cambio entregado se deriva de recibido menos total. El cliente puede cambiar de billete: al entregar se valida el recibido real, no se impone que coincida con el previsto.

Cobro pendiente al comprar; cobro `succeeded` solo con entrega, cobrador y fecha coherentes. Un fallo de auditoría/outbox revierte también entrega y efectivo. El retiro ya efectuado no se repite al reintentar entrega. Comisión configurable conserva la política provisional D06 (8000 puntos básicos) y la tarifa acordada se guarda en la asignación. Estos datos no representan liquidación a tienda/repartidor: definición de custodia, traspasos y liquidaciones se mantiene como decisión de negocio antes del piloto; no se simulan saldos pagados.

Cancelación de pedido solo en `pending`/`confirmed`; rechazo solo en `pending`, conforme al baseline. Se liberan reservas y se cancela efectivo pendiente, sin alterar existencia física. No se cancela automáticamente un pago en proceso/digital ni una compra multitienda. Una asignación se libera solo antes del retiro y conserva el pedido listo/reserva para reasignar. Después del retiro una incidencia permanece registrada para coordinación; no revierte stock vendido, cobra ni declara entrega. Gestión completa/resolución de soporte pertenece a F5; no se amplía la matriz SQL para inventar una devolución.

El repartidor histórico no recibe dirección después de entregar. Una asignación cancelada no conserva acceso al detalle del destino. Operadores de otra tienda y clientes ajenos no consultan ni mutan recursos de terceros. Administración consulta, cancela en estados permitidos o coordina asignación; no existe un cambio genérico para saltar retiro/cobro/entrega.

## Verificación acordada

- Durante implementación: backend `npm run test:f4`; frontend `npm test -- src/test/realShopping.test.ts`.
- Integración del recorrido: backend `npm run test:f4:browser`, que crea sus propias DB/objetos y ejecuta solo `purchase.spec.ts`.
- Cierre de fase: raíz `node scripts/check-workspace.cjs` (harness integral). Repetir únicamente ante correcciones que afecten resultados ya comprobados.

No ejecutar fixtures sobre desarrollo. `npm run dev:db` aplica la migración a la DB persistente después de validar el cierre. F5 conserva soporte/favoritos/reseñas/notificaciones/reportes; F6 pagos digitales; F8 validación HTTPS/staging, restauración y piloto.
