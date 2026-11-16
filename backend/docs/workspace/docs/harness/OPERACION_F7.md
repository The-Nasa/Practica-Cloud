# F7: compras de varias tiendas

## Alcance acordado

El usuario eligió exclusivamente compras multitienda. Google, seguimiento GPS, cupones/promociones, carrito remoto y liquidaciones automatizadas quedan pendientes. F6 digital queda pendiente por decisión del usuario hasta elegir pasarela; efectivo sigue siendo el único método habilitado. F8/piloto no se declara realizado por cerrar esta iniciativa.

Una sola confirmación crea un grupo con una compra y pedido independientes por tienda. Cada tienda tiene mínimo, horario, disponibilidad, tarifa de envío, plazo de aceptación, reserva, asignación y cobro propios. No se promete un repartidor único ni llegada simultánea. Una dirección por confirmación; todas las tiendas deben cubrir su zona. Se admite hasta 10 tiendas y 100 líneas en total.

Cada envío cuesta la tarifa vigente de la zona de destino, conforme a F4. Dos tiendas con tarifa de S/ 3 generan S/ 6 de envíos. El checkout muestra productos, envío e importe a entregar por tienda y el total conjunto antes de confirmar. En multitienda se solicita efectivo exacto por entrega; un billete global no se divide ficticiamente entre repartidores. El repartidor confirma el efectivo realmente recibido y el cambio en su propia entrega según F4. Una tienda mantiene su flujo anterior, incluido efectivo previsto con cambio.

## Persistencia y atomicidad

Migración aditiva `006_f7_multistore_checkout.sql`: grupo inmutable `ordering.checkout_groups` y referencia nullable `ordering.purchases.checkout_group_id`, asociada en INSERT. Baseline y migraciones anteriores permanecen intactos; las compras previas conservan referencia nula. Se mantienen las restricciones de pago completo por compra y cobro en efectivo después de entrega; no se elimina la unicidad de pago exitoso ni se modifica el trigger financiero.

El servicio orquesta con un solo cliente/transacción. Serializa la clave idempotente del grupo, obtiene productos de las tiendas desde SQL y bloquea SKU/existencias globalmente en orden UUID. Cotiza y valida todas las tiendas; crea las compras hijas, reservas, pagos pendientes, eventos y auditoría/outbox atómicamente. Fallo de una tienda o de auditoría revierte todo. No se hacen llamadas externas bajo locks.

Tras confirmar, cada pedido opera por separado. Cancelar/rechazar/vencer uno solo libera sus reservas y cancela su pago pendiente; entregar otro solo cobra su total. El grupo conserva el total original confirmado y muestra estados actuales por pedido; no se presenta ese total histórico como saldo vigente exigible tras cancelaciones.

## API

| Ruta | Uso |
| --- | --- |
| `POST /checkout/groups/quote` | Cotización agrupada sin reservar; mismo DTO de intención que compra |
| `POST /checkout/groups` | Confirmación atómica con `Idempotency-Key`; valida total revisado |
| `GET /me/checkout-groups/:id` | Resumen actual del grupo, solo comprador |
| `GET /me/group-checkout-attempts/:key` | Recuperación autorizada y con estados actuales |

Rutas bajo `/api/v1`. Mutaciones requieren sesión/Origin/CSRF. Una clave reutilizada con contenido diferente o vencida recibe 409. Repetir una confirmación idéntica devuelve su respuesta original; recuperar consulta estados actuales. Terceros, incluidos miembros de tiendas, no pueden consultar el grupo completo. Comercios y repartidores usan sus permisos por pedido y no reciben datos de tiendas ajenas. Consultas privadas llevan `no-store`.

El contrato de pedido incorpora `checkoutGroupId` opcional/nullable para que el comprador vuelva al resumen. Las rutas antiguas de compra única conservan compatibilidad. Tipos se generan desde OpenAPI y se validan con Zod.

## Frontend y recuperación

El carrito conserva seleccionados SKU de varias tiendas al agregar, desmarcar y recargar. Guarda solo intención; precios/cobertura proceden de API. En multitienda consulta la cotización de grupo; en una tienda conserva el endpoint anterior.

Una confirmación se guarda por cuenta en sessionStorage con clave, cuerpo, snapshot y tipo de flujo antes del POST. Ante timeout o recarga se consulta la misma clave; solo un 404 permite reenviar el mismo cuerpo/clave. Una respuesta incierta no vacía el carrito ni inicia otra compra. Al confirmar se retiran únicamente las intenciones no editadas desde el snapshot. El formato admite las confirmaciones pendientes antiguas sin campo de grupo.

Resumen en `/cliente/compras/:id`: enlaces y estados de cada pedido, actualización y desglose; accesible también desde el detalle del pedido del comprador. Las cancelaciones se solicitan por pedido, sin botón de cancelación global ni resolución financiera implícita. El demo sigue independiente.

## Validación y mantenimiento

API dirigida: `node scripts/harness-docker.cjs --suite=f7` desde backend. Web dirigido: `node scripts/harness-docker.cjs --browser --spec=multistore.spec.ts`. Frontend dirigido: `npm test -- src/test/realShopping.test.ts`. Cierre por iniciativa: raíz `node scripts/check-workspace.cjs` y evidencia en `EVIDENCIA_F7.md`.

Integración cubre desglose sin reservas, idempotencia concurrente, permisos, precios obsoletos, dirección ajena, pausa/mínimos/stock por tienda, disputa de última unidad, rollback completo por auditoría, cancelación y entrega/cobro separados, y vencimiento independiente. Navegador cubre selección/recarga, tarifas visibles, recuperación de respuesta perdida sin duplicación, resumen/cancelación y móvil.

Recuperación de despliegue: aplicar migración antes de iniciar la API nueva y conservar respaldo habitual. La migración es aditiva; no borrar grupos/compras para revertir aplicación. Si se retira temporalmente la UI multitienda, continuar atendiendo los pedidos ya confirmados con sus pagos independientes. No ejecutar rollback destructivo ni modificar checksums de migraciones aplicadas.
