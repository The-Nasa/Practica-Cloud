# Quickly: plan integral de backend e integración con frontend

Fecha del plan inicial: 26 de octubre de 2026. Estado de ejecución: F0–F5 implementadas localmente; F6 digital pendiente por elección de proveedor; F7 multitienda implementada y verificada por solicitud del usuario. Demás ampliaciones F7 y piloto F8 pendientes.

F8 incorpora preparación local de HTTPS/staging, recuperación DB+objetos, monitoreo y límites. El piloto y la operación pública siguen pendientes, junto con correcciones mayores de seguridad detectadas por auditoría. Criterios vigentes en [CHECKLIST_PILOTO_F8.md](docs/harness/CHECKLIST_PILOTO_F8.md); no confundir aprobación del harness con autorización de lanzamiento.

**Seguimiento de ejecución:** el estado actualizado y la evidencia por fase están en [docs/harness/ESTADO.md](docs/harness/ESTADO.md). Alcance actual de F7 en [OPERACION_F7.md](docs/harness/OPERACION_F7.md): compras de varias tiendas con envíos/cobros independientes; Google, GPS, promociones, carrito remoto y liquidaciones quedan pendientes. El diagnóstico siguiente conserva la situación inicial que motivó el plan; las decisiones posteriores registran los cambios de alcance.

## 1. Objetivo y alcance

Convertir el prototipo React en una aplicación con persistencia y autorización reales mediante la API NestJS y PostgreSQL. Cubrir cliente, comercio, repartidor y administración, conservando los flujos existentes y reemplazando sus simulaciones por casos de uso verificables.

El primer hito operativo será una compra de una sola tienda, pagada en efectivo, desde el catálogo hasta la entrega. El alcance completo también incluye soporte, favoritos, reseñas, reportes, notificaciones, administración, archivos y pagos digitales. Estos últimos requieren proveedores y decisiones de negocio; se planifican expresamente y no se consideran implementados por tener tablas o botones.

Este documento complementa [la arquitectura](backend/arquitectura-backend.md), tomando como referencia ejecutable [el esquema SQL](backend/001_schema.sql). Las rutas indicadas como propuestas deben formalizarse en OpenAPI durante cada fase.

## 2. Diagnóstico del repositorio

### 2.1. Evidencia revisada

- Frontend: `Frontend-Quickly/src/app/router.tsx`, inventario de `src/features`, `src/domain/types.ts`, stores de autenticación, datos y carrito; referencias a mocks y persistencia local en pantallas y componentes compartidos.
- Backend: controladores y servicios de `identity`, `geography`, `merchant`, `catalog`, `ordering`, `delivery` y `platform`; guards, conexión PostgreSQL y arranque HTTP.
- Base: `backend/001_schema.sql`, estructura de verificación `002_verificar.sql`, documentación y manifiestos de dependencias.

La revisión es estática. No se comprobó la instancia PostgreSQL que esté utilizando el desarrollador, ni se ejecutaron endpoints, compilaciones o pruebas. La validación contra una base nueva y contra la base de desarrollo forma parte de F0. Los resultados de verificación mencionados en el README son antecedentes del repositorio, no pruebas repetidas para este plan.

### 2.2. Estado real

| Componente | Existe | Falta para darlo por terminado |
| --- | --- | --- |
| Web | React, Vite, TypeScript, Zustand, formularios y pruebas de prototipo | Cliente HTTP, datos remotos, manejo asíncrono y autorización basada en sesión real |
| Autenticación web | Identidad guardada en `quickly_auth_v1`, accesos demo y Google ficticio | Credenciales reales, restaurar sesión desde API y eliminar creación automática de identidades |
| Datos web | `quickly_datastore_v4`, compatibilidad con v2/v3, seeds de direcciones y actividad | Reemplazar persistencia de negocio y carga global por consultas por usuario y recurso |
| Carrito | `quickly_cart_v1`, selección de una tienda | Identificadores SKU reales, revalidación de precios y stock, confirmación remota |
| API | NestJS 10, validación, Swagger, CORS, sesiones Bearer opacas, servicios SQL con `pg` | Corregir desajustes SQL, completar permisos por recurso y funcionalidades pendientes |
| DB | Baseline de 41 tablas, 10 schemas y 5 vistas, restricciones y triggers | Historial de migraciones, seeds operativos y ampliaciones justificadas |
| Arquitectura | Documento propone Prisma y capas limpias | Implementación actual usa `pg` directamente desde servicios de aplicación; resolver y documentar esa diferencia |
| Operación | Dockerfile, Compose y endpoint de salud | CI, pruebas integradas, backups/restauración, monitoreo y preparación para publicación |

### 2.3. Bloqueos prioritarios detectados

Corregir estas diferencias antes de tratar las rutas existentes como funcionales. La lista es una base de auditoría, no sustituye ejecutar cada consulta contra PostgreSQL.

| Área / archivo | Diferencia observada | Trabajo requerido |
| --- | --- | --- |
| `ordering.service.ts` | Usa `purchase_number`; SQL define `purchases.code` | Corregir consultas y formatear el código público en el DTO |
| `ordering.service.ts` | Usa `items_subtotal_cents` y `delivery_total_cents`; vistas exponen `subtotal_cents` y `delivery_fee_cents` | Alinear consultas y contrato monetario |
| `ordering.service.ts` | Eventos usan `version`, `from_status`, `to_status`; tabla define `order_version`, `status_code` | Alinear historial con tabla o agregar migración deliberada si se necesita otro modelo |
| Idempotencia | Servicio consulta `status_code` y escribe `response_code`; tabla define `response_status` | Corregir nombres, exigir clave en checkout y serializar solicitudes concurrentes |
| Comercios/pedidos | Consultas usan `accepts_orders`; SQL define `accepting_orders` | Unificar SQL y DTO |
| Membresías | Alta usa `role_in_store`; SQL define `membership_role` | Corregir y verificar autorización por membresía activa |
| Reparto | Usa `assigned` y `assigned_at`; SQL usa `accepted` y `accepted_at`. El perfil sí dispone de `is_online` | Corregir estados/fechas y aplicar disponibilidad al tomar una entrega |
| Notificaciones | Consulta `body`, `type`, `action_url`; tabla define `message`, `kind`, `relative_url` | Mapear explícitamente al contrato público |
| Auditoría | Inserta `resource_type`, `resource_id`, `user_id`; SQL exige `entity_type`, `entity_id`, `actor_user_id`, `request_id` | Corregir e integrar auditoría dentro de transacciones de negocio |
| Permisos | `OrderingService.updateStatus` no comprueba pertenencia a tienda; listar pedidos recibe `storeId` sin actor | Incorporar autorización de recurso; el rol `merchant` no da acceso a todas las tiendas |
| Alta de comercio | Crea tienda activa y habilitada inmediatamente | Crear pendiente, someter a aprobación y bloquear ventas hasta activación |
| Checkout | Repetición por clave no compara hash y el registro se realiza al final con `ON CONFLICT DO NOTHING` | Reserva atómica de clave, rechazo por payload diferente y respuesta estable ante carreras |
| Checkout | Consulta de disponibilidad no bloquea explícitamente stock como indica el comentario; no comprueba todos los estados de publicación | Bloquear filas físicas por SKU en orden estable y validar producto/SKU/comercio/cobertura/horarios |
| Contratos | Web usa nombres y estados en español y rol único; API/DB usan códigos en inglés y múltiples roles | Definir DTO canónico y adaptadores, evitando conversiones repartidas por componentes |

Además, la documentación que dice que aún no hay API quedó atrás respecto del código. Actualizar README y rutas de ejecución de SQL que todavía apuntan a `docs/backend/...`.

## 3. Decisiones de implementación

1. Mantener el monolito modular NestJS y PostgreSQL. No mover las carpetas actuales ni introducir microservicios para iniciar la integración.
2. Continuar inicialmente con `pg`, ya presente, detrás de puertos/adaptadores de persistencia. Registrar esta decisión frente a la propuesta anterior de Prisma. Si luego se adopta ORM, hacerlo en una tarea separada preservando SQL, restricciones y transacciones.
3. Usar `/api/v1`, DTO en camelCase y códigos de dominio canónicos en inglés. Etiquetas visibles en español mediante un único mapeo.
4. Para la web, adoptar sesión opaca en cookie `HttpOnly`, `Secure` en HTTPS y política `SameSite` acorde al despliegue. La API actual usa Bearer: migrar login, guard, logout, Swagger y pruebas juntos. Mantener Bearer solo si existe un cliente que lo necesita, mediante decisión explícita.
5. Resolver en F0 el origen web/API. Preferir mismo sitio mediante dominio/proxy; si quedan en sitios diferentes, validar cookies, CORS con credenciales y protección CSRF de extremo a extremo antes de cerrar autenticación.
6. Una tienda por compra y una entrega activa por repartidor. Mantener compra y pedido por comercio como entidades distintas.
7. El backend determina identidad, permisos, precios, tarifas, disponibilidad y transiciones. El frontend envía intención y representa resultados.
8. Importes enteros en céntimos y moneda explícita PEN en el contrato. Limitar valores al rango seguro compartido por DB/API/JavaScript; no convertir importes arbitrarios a `number` sin validación.
9. Mantener carrito e historial de búsquedas localmente en la primera versión. Su contenido no reserva inventario ni fija precios. Sincronizar carrito entre dispositivos queda como ampliación explícita.
10. Iniciar seguimiento con consultas periódicas autenticadas. Evolucionar a SSE/WebSocket y GPS cuando exista necesidad y contrato de privacidad definidos.

## 4. Mapeo funcional por módulos

Leyenda: **parcial** significa que existe código, pendiente de corrección y pruebas reales; **pendiente** significa que no se identificó el caso de uso completo en la API revisada. Todas las rutas de esta sección llevan el prefijo `/api/v1`. Las rutas agrupadas resumen varias operaciones y deben desglosarse en OpenAPI.

### M01. Identidad, sesiones y permisos

**Datos:** `identity.users`, `roles`, `user_roles`, `password_credentials`, `external_accounts`, `sessions`, `password_reset_tokens`.

| Funcionalidad | API existente o propuesta | Ajuste web / aceptación |
| --- | --- | --- |
| Registro cliente, login, logout y perfil | Parcial: `POST /auth/register`, `/auth/login`, `/auth/logout`; `GET /me` | Conectar RegisterCustomerPage y LoginPage; enviar contraseña real; recarga recupera identidad desde `/me` |
| Editar perfil | Pendiente: `PATCH /me` | CustomerProfilePage y perfiles por rol; solo campos permitidos, nunca roles o estado |
| Recuperar/cambiar contraseña | Pendiente: `POST /auth/password/forgot`, `/reset`, `/change` | RecoverPasswordPage; token de un uso con vencimiento, respuesta que no revele cuentas y revocación de sesiones según política |
| Sesiones | Completar cookie, expiración, revocación y cierre en otros dispositivos | `authStore` conserva solo estado de UI en memoria; 401 limpia cachés y redirige sin bucles |
| Roles y contexto de comercio | Pendiente: incluir roles y membresías autorizadas en `/me` | `switchRole` solo cambia vista entre roles otorgados; `switchMerchant` solo entre membresías reales |
| Google | Pendiente: flujo OAuth/OIDC con callback verificado | Reemplazar `loginGoogle` ficticio; activar únicamente al configurar proveedor |
| Registro comercio/repartidor | Pendiente: alta de cuenta + solicitud de perfil | RegisterMerchantPage y RegisterCourierPage muestran pendiente/aprobado/rechazado; ningún registro concede admin |

**Reglas:** validar correo y teléfono normalizados, unicidad, hash de contraseña con parámetros documentados, límites de intentos, sesión revocable y cuenta suspendida sin acceso operativo. Aprobar un perfil comercial o de reparto no debe conceder permisos de otros perfiles. Crear el primer administrador mediante procedimiento controlado de bootstrap, sin registro público.

**Prueba de salida:** dos usuarios no pueden editarse entre sí; modificar rol/ID en el navegador no concede acceso; sesión revocada deja de funcionar en la siguiente petición.

### M02. Geografía, direcciones y cobertura

**Datos:** `geography.coverage_zones`, `addresses`.

- Parcial: `GET /geography/zones`, `GET/POST /me/addresses`, `DELETE /me/addresses/:id`.
- Completar `PATCH /me/addresses/:id`, `PUT /me/addresses/:id/default` y CRUD administrativo de zonas con activación/desactivación.
- Validar propiedad, teléfono, coordenadas emparejadas y cobertura activa. Cambiar dirección predeterminada de forma transaccional; definir resultado al borrar la predeterminada.
- Una dirección guardada no cambia el destino histórico de compras anteriores. Desactivar zona impide nuevas compras sin romper pedidos en curso.
- Conectar CustomerAddressesPage, AddressForm, ZoneSelector, CheckoutPage y AdminZonesPage; retirar `ensureExampleAddresses` y seeds automáticos.
- Definir si la cobertura inicial es selección explícita de zona o validación geográfica con polígonos. No afirmar pertenencia geográfica por elegir una etiqueta.

**Salida:** una dirección creada aparece al iniciar sesión en otro navegador; solicitudes sobre direcciones ajenas fallan; tarifa proviene de la regla de servidor.

### M03. Comercios, solicitudes, miembros y horarios

**Datos:** `merchant.categories`, `stores`, `memberships`, `opening_intervals`, vista `ratings`.

- Parcial: `GET /stores`, `/stores/:id`, `POST /merchant/stores`, `POST /admin/stores/:id/approve`.
- Completar `GET /merchant/stores` para los comercios propios; edición de perfil, imágenes, mínimo de compra, tiempo de preparación, horario y recepción de pedidos.
- Agregar aprobar/rechazar/suspender/reactivar con motivo y auditoría; bandeja administrativa de solicitudes y detalle.
- Implementar miembros owner/manager/operator con permisos explícitos. Nadie puede modificar su propia membresía para elevar privilegios.
- Calcular `isOpen` con horario, zona horaria `America/Lima`, estado y pausa manual; dividir intervalos que cruzan medianoche o adaptar modelo mediante migración.
- Separar aprobación de cuenta, aprobación de comercio y pausa de recepción. Aplicar en listado público y en checkout.
- Conectar MerchantStorePage, MerchantSettingsPage, AdminMerchantsPage y registro comercial.

**Salida:** tienda pendiente no vende; un operador de A no consulta ni modifica B; la pausa se refleja en checkout aunque la pestaña del cliente tenga datos antiguos.

### M04. Catálogo, SKU, búsqueda e imágenes

**Datos:** `catalog.categories`, `products`, `skus`, `product_images`; consultas de disponibilidad y valoraciones.

- Parcial: `GET /catalog/categories`, `/stores/:id/products`, `/catalog/search`, `POST /merchant/stores/:id/products`.
- Completar detalle `GET /products/:id`; listado administrativo por tienda que incluya productos inactivos; edición, archivo lógico, orden e imágenes.
- Gestionar variantes como SKU vendibles, cada uno con precio absoluto, código y disponibilidad. Producto sin variantes visibles tiene SKU estándar.
- Agregar edición/alta/desactivación de SKU, unicidad de SKU/barcode y filtros por categoría, zona, tienda, precio, disponibilidad y paginación estable.
- Mantener separación entre categoría de comercio y categoría de producto; definir taxonomía y mapeo de códigos actuales.
- No borrar productos/SKU ya vendidos: conservar líneas históricas y evitar roturas por referencias.
- Conectar HomePage, MerchantsPage, MerchantDetailPage, ProductDetailPage, ProductDetailModal, MerchantProductsPage, ProductCard y secciones de portada.
- Revisar campos visibles `originalPriceCents`, `condition`, `brand`, `freeShipping`, `soldCount`, ratings y QR: algunos requieren ampliaciones o cálculos. No rellenarlos con valores ficticios. QR puede generarse desde URL/ID real sin columna propia si no es una identidad independiente.
- Portada y “tiendas oficiales”: definir criterios/curación reales; no inferir sello oficial de una lista mock. Cupones y promociones se tratan en M14.

**Salida:** producto y variantes creados por comercio se ven en otra sesión; precio modificado se revalida antes de comprar; búsqueda no expone tiendas suspendidas.

### M05. Inventario y reservas

**Datos:** `inventory.stock`, `reservations`, vista `availability`. No existe módulo Nest independiente revisado; hay lógica repartida en catálogo, pedidos y reparto.

- Crear fachada de inventario y casos de uso: consultar, inicializar, ajustar con motivo, alertar bajo stock, reservar, liberar, consumir y expirar.
- API propuesta: `GET /merchant/stores/:id/inventory`, `POST /merchant/skus/:id/stock-adjustments`; la reserva se ejecuta internamente desde compra.
- Disponibilidad = existencia física menos reservas activas. Agregar al carrito no reserva.
- Bloquear stock físico en orden estable antes de reservar/consumir/ajustar; mantener toda la transacción sobre el mismo cliente PostgreSQL.
- Al cancelar/rechazar se libera la reserva; al retirar se consume y disminuye existencia física en la misma transacción, sin doble decremento.
- Crear historial de movimientos mediante migración con actor, motivo, cantidad, referencia y fecha; `stock` actual no reemplaza una bitácora.
- Definir vencimiento de reservas y pedidos pendientes: un worker no debe liberar un pedido aceptado sin aplicar su política de negocio y transición correspondiente.
- MerchantProductsPage deja de sobrescribir stock directamente desde `Partial<Product>`.

**Salida:** dos compras concurrentes por la última unidad producen una sola reserva válida; reintentar retiro/cancelación no vuelve a descontar/devolver.

### M06. Carrito, cotización y checkout

**Datos:** carrito local como intención; compra, destino histórico, pedido, líneas, reservas e intento de pago en PostgreSQL.

- Mantener add/remove/update/select en `cartStore`, con SKU y cantidades; no enviar un objeto `Purchase` armado en navegador.
- Crear `POST /checkout/quote` con dirección, SKU, cantidad, notas y método. Responder precios, tarifa, total, disponibilidad y capacidades de pago. Revalidar siempre al crear; si se promete cotización vinculante, agregar token/versionado/expiración explícitos.
- Parcial: `POST /purchases`; completar idempotencia obligatoria y validación de producto activo, SKU activo, tienda activa/abierta, mínimo de compra, zona, método y cantidades.
- Transacción de compra: reclamar clave → validar recursos → bloquear stock → crear compra y destino → pedido/líneas históricas → reservas → intento de pago → evento/auditoría/outbox → guardar respuesta → commit.
- No llamar a proveedores externos dentro de la transacción SQL.
- Repetir una clave con el mismo contenido devuelve la compra original; contenido diferente produce conflicto. Resolver carreras y expiración sin duplicar compras.
- CheckoutPage y checkoutFlow pasan a `async`; retirar confirmación simulada y `isDemoError`. Deshabilitar envío mientras procesa; ante timeout consultar/reintentar con la misma clave.
- Vaciar solo los ítems comprados después de confirmar persistencia remota. Un error de red no significa que la compra no exista.
- Efectivo: definir importe con el que paga y cambio, validar que cubra total y guardar lo necesario mediante migración si no está modelado.

**Salida:** pestaña recargada puede recuperar la compra; total manipulado en navegador no afecta cobro; error transaccional deja cero compras/reservas parciales.

### M07. Pedidos, historial, cancelaciones y reseñas

**Datos:** `ordering.purchases`, `purchase_destinations`, `merchant_orders`, `order_items`, `order_events`, `reviews`, vistas de totales/estado.

- Parcial: `GET /me/purchases`, `GET /merchant/stores/:storeId/orders`, cancelación, aceptar, iniciar preparación y marcar listo.
- Completar `GET /me/purchases/:id`, detalle autorizado de pedido y timeline; listado administrativo paginado; rechazo por comercio con motivo.
- Aplicar transiciones del baseline: pendiente → confirmado → preparación → listo → en camino → entregado; cancelación/rechazo solo en los puntos permitidos. Revisar la matriz exacta contra `allowed_transitions`, sin ampliar permisos solo por tener un botón.
- Autorizar cada acción por actor y recurso. Admin requiere política explícita para intervención; no debe poder saltar cobro, inventario o asignación mediante cambio genérico de estado.
- Usar versión esperada en acciones para detectar pantallas obsoletas; persistir transición, reservas/pagos afectados, evento, auditoría y outbox atómicamente.
- Rechazo y cancelación liberan inventario y resuelven intento de efectivo o solicitud de reembolso digital según corresponda.
- Propuesta: `POST /orders/:id/reviews`, consulta paginada por tienda; solo comprador con entrega completada, calificación 1–5 y una reseña por pedido. Calcular agregados desde DB.
- Conectar CustomerOrdersPage, OrderDetailPage, TrackingPage, OrderTimeline, MerchantOrdersPage y AdminOrdersPage.
- Quitar del cliente derivaciones autoritativas de pago/reembolso y stock en `updateMerchantOrderStatus`; las reglas frontend quedan como ayudas visuales y pruebas de representación.

**Salida:** cliente solo ve compras propias; cambiar el nombre del producto no altera comprobación histórica; una transición repetida no duplica eventos ni efectos.

### M08. Repartidores y operación de entrega

**Datos:** `delivery.courier_profiles`, `assignments`, `incidents`; pedidos y datos mínimos de destino.

- Parcial: disponibles, asignación activa, tomar pedido, retiro y entrega en `/courier`.
- Completar perfil propio, solicitud/aprobación/rechazo/suspensión, vehículo/placa/zona y disponibilidad; validar perfil activo y disponible al tomar entrega.
- Completar historial con filtros y paginación, detalle, incidencias y asignación manual administrativa con motivo.
- Proteger carreras por el mismo pedido y por dos pedidos para el mismo repartidor usando locks e índices parciales. Traducir violaciones esperables a 409 comprensible.
- Definir cancelación/reasignación antes de retiro; después del retiro exigir resolución operativa de incidencia, sin liberar inventario vendido automáticamente.
- Retiro: asignación aceptada → picked_up y pedido listo → en camino; consumo de reservas atómico. Entrega: asignación y pedido terminan juntos, registrando efectivo cuando corresponda.
- Limitar datos del destino antes de asignación; solo el repartidor asignado accede a información necesaria para entregar.
- Ganancias: sumar tarifas acordadas de entregas elegibles; definir comisión, efectivo en custodia y liquidaciones por separado. El 80% fijo encontrado en `claimOrder` requiere decisión de negocio y configuración versionada.
- Conectar CourierRequestsPage, CourierActiveDeliveryPage, CourierHistoryPage, CourierEarningsPage, CourierProfilePage y AdminCouriersPage. Quitar `courierActivityData` de modo real.

**Salida:** una sola entrega activa por repartidor; otro repartidor no confirma retiro/entrega ajena; las ganancias coinciden con las asignaciones persistidas.

### M09. Cobros, efectivo, pagos digitales y reembolsos

**Datos:** `billing.payment_methods`, `payment_attempts`, `refunds`, `webhook_receipts`. Crear módulo Nest `billing` con adaptadores de proveedor.

- Primera salida: efectivo pendiente al comprar y cobrado al entregar, con cobrador, importe y `succeeded_at` coherentes con restricciones.
- API propuesta: `GET /payment-methods`, `GET /me/purchases/:id/payments`; registrar efectivo desde el caso de entrega, no desde un botón de cliente.
- Digital: elegir proveedor compatible con métodos requeridos; iniciar intento con clave propia, devolver redirección/token seguro, verificar webhook firmado y confirmar estado desde servidor.
- Propuesta: `POST /purchases/:id/payment-attempts`, `POST /billing/webhooks/:provider`, `POST /admin/orders/:id/refunds`, consultas de estado y conciliación.
- Deduplicar eventos externos, validar monto/moneda/compra, manejar eventos fuera de orden y reintentos; retorno del navegador no prueba pago.
- Resolver pago tardío después de cancelación, reservas vencidas, proveedor indisponible y devolución pendiente/fallida mediante conciliación y outbox.
- Mantener alcance inicial de reembolso conforme al baseline: pedido cancelado/rechazado y pago digital cobrado. Devolución posterior a entrega o parcial requiere política y cambios explícitos.
- No recopilar PAN/CVV en el propio backend. Adaptar CheckoutPage al SDK o checkout alojado del proveedor elegido; `cardLastFour` debe proceder del proveedor.
- Yape/Plin no se consideran confirmados por mostrar QR o adjuntar captura. Si se elige cobro manual, diseñar conciliación, evidencias y permisos como alternativa separada.

**Salida:** efectivo se cobra una vez; webhook duplicado no duplica cobros; devolución nunca excede cobrado; UI muestra pendiente hasta confirmación verificable.

### M10. Favoritos, notificaciones y preferencias

**Datos:** `catalog.favorites`, `platform.notifications`, `outbox_events`.

- Favoritos pendientes: `GET /me/favorites`, `PUT/DELETE /me/favorites/products/:id` y `/stores/:id`. Operaciones de estado deseado idempotentes, por usuario.
- Notificaciones parciales: `GET /notifications`, `PATCH /notifications/:id/read`; corregir SQL, paginar y agregar lectura masiva y contador propio.
- Crear notificaciones desde eventos confirmados de pedido, aprobación, soporte y reparto. No confiar en textos/URLs arbitrarios enviados por clientes.
- Worker de outbox con reintentos, backoff, reclamación concurrente, recuperación de trabajos y deduplicación. “Al menos una vez” exige consumidores idempotentes.
- Correo/push externos y preferencias por canal se implementan después del canal interno, con proveedor y migraciones necesarios.
- Conectar CustomerFavoritesPage, CustomerNotificationsPage, Navbar y tarjetas. Cerrar sesión limpia cachés para que otro usuario no vea favoritos/notificaciones previos.

**Salida:** favoritos sobreviven entre dispositivos y están aislados; leer una notificación ajena no produce cambios; eventos reintentados no duplican avisos.

### M11. Soporte e incidencias

**Datos:** `support.tickets`, `ticket_messages`, `delivery.incidents`. Crear módulo Nest `support`.

- API propuesta: `GET/POST /me/tickets`, `GET /me/tickets/:id`, `POST /tickets/:id/messages`; bandeja admin y acciones de prioridad, revisión y resolución.
- Modelo conversacional: descripción inicial y respuesta son mensajes, no un único campo sobrescrito como en el prototipo.
- Comprobar relación del solicitante con el pedido y permisos de lectura; usar UUID de pedido, no código mostrado como FK.
- Incidencia de entrega registra asignación, reportante, motivo y fecha; crear/vincular ticket operativo en la misma operación. Si la relación no existe en SQL, agregarla por migración.
- Resolver ticket no equivale a marcar pedido entregado ni a ejecutar reembolso. Coordinar acciones explícitas y auditadas.
- Conectar CustomerHelpPage, AdminTicketsPage y reporte de CourierActiveDeliveryPage; reemplazar textos que prometen reembolsos simulados inmediatos.

**Salida:** conversación visible a participantes autorizados; resolución guarda mensaje y fecha; incidencia reintentada no duplica ticket.

### M12. Administración y auditoría

**Datos:** entidades de cada módulo y `platform.audit_entries`. Administración coordina fachadas de módulos, no duplica tablas de negocio.

- Crear endpoints administrativos paginados para usuarios, solicitudes, comercios, repartidores, pedidos, zonas, tickets y auditoría.
- Implementar aprobar/rechazar/suspender/reactivar con motivo, actor, fecha y efectos definidos: revocar sesiones, impedir nuevas operaciones y gestionar entregas existentes sin abandonarlas.
- No equiparar indisponibilidad voluntaria del repartidor con suspensión administrativa.
- Auditoría append-only escrita por servidor con `request_id`, actor, entidad, acción y detalles filtrados; no guardar contraseñas, tokens ni datos de tarjeta.
- Conectar AdminOverviewPage, AdminUsersPage, AdminMerchantsPage, AdminCouriersPage, AdminOrdersPage, AdminZonesPage, AdminTicketsPage y AdminAuditPage.
- El frontend deja de comprobar éxito buscando un objeto modificado en `useDataStore.getState()`; usa respuesta remota y recarga/invalida consulta.

**Salida:** cada intervención produce una entrada consultable; usuario no administrador recibe 403 incluso si abre una URL administrativa manualmente.

### M13. Paneles, reportes, ganancias y exportación

- API propuesta: `GET /merchant/stores/:id/dashboard`, `/reports`, `GET /courier/earnings`, `GET /admin/dashboard`, `/admin/reports`; exportación con mismos filtros y permisos.
- Consultas de lectura desde vistas/joins, sin enviar toda la base a Zustand para sumar en navegador.
- Definir indicadores: pedidos por estado, ventas entregadas, cobros confirmados, devoluciones, comisiones, tarifas de reparto y tiempos operativos. Ventas, dinero cobrado y saldo a liquidar son magnitudes diferentes.
- Establecer rango, zona horaria, fechas inclusivas/exclusivas y tratamiento de cancelaciones; expresar la definición de cada KPI en el contrato.
- Conectar MerchantDashboardPage, MerchantReportsPage, CourierEarningsPage, AdminOverviewPage y AdminReportsPage. Quitar contadores y tiempos ficticios.
- Si hay liquidación real a comercios/repartidores, agregar libro de movimientos y liquidaciones; el esquema actual de intentos y asignaciones no equivale a contabilidad completa.

**Salida:** total mostrado coincide con consultas SQL de control para un conjunto conocido de ventas, cancelaciones y devoluciones.

### M14. Archivos, promociones y capacidades complementarias

- Archivos: carga autorizada para avatar, logo, banner y productos; validación de tamaño/tipo/contenido, claves generadas por servidor, confirmación de carga y limpieza de huérfanos. Elegir almacenamiento de objetos; DB guarda clave y API entrega URL utilizable.
- Propuesta: `POST /media/uploads`, `POST /media/uploads/:id/confirm`; publicar imágenes solo tras autorización y confirmación.
- Cupones/beneficios: revisar CouponsModal y cualquier descuento visible. No existe módulo promocional en los 10 schemas: si se activa, crear campañas, reglas, vigencia, canjes, límites y concurrencia mediante migraciones. Recalcular descuentos en servidor y conservar descuento histórico por compra/línea.
- Seguimiento: SchematicMap sigue siendo ilustrativo hasta incorporar coordenadas reales, captura con permiso, API de posición por asignación, acceso restringido, frecuencia y retención. No mostrar movimiento inventado en modo real.
- PlayModal y elementos promocionales de interfaz: clasificarlos como contenido o funcionalidad comercial antes de asignarles backend. Si no hay beneficio implementado, ocultar la acción o mostrar su disponibilidad real.
- Carrito remoto, multitienda, valoraciones de producto/repartidor, devolución posterior a entrega y liquidaciones automatizadas son ampliaciones: requieren reglas y migraciones; no se obtienen automáticamente del modelo actual.

**Salida:** ninguna pantalla comunica descuento, ubicación, calificación o pago real con datos inventados.

## 5. Contrato de integración frontend/backend

### 5.1. Cliente HTTP y estructura propuesta

```text
Frontend-Quickly/src/
  services/api/
    apiClient.ts             # URL base, credenciales, errores y request ID
    contracts/               # tipos generados desde OpenAPI
    identityApi.ts
    catalogApi.ts
    orderingApi.ts
    ...
  features/<modulo>/
    hooks/                   # consultas/mutaciones y estados de red
    adapters/                # DTO -> modelo de vista si hace falta
  store/
    authStore.ts             # sesión en memoria y contexto autorizado
    cartStore.ts             # intención local
```

Elegir un mecanismo único de caché remota en F1: biblioteca de consultas o hooks propios con invalidación definida. Zustand puede seguir para estado de interfaz; evitar que `dataStore` sea una copia persistente de toda la DB.

- Configurar `VITE_API_BASE_URL`; ejemplo local `http://localhost:3000/api/v1`. Nunca exponer credenciales PostgreSQL al bundle.
- Cliente con `credentials: 'include'` para sesión cookie; CSRF según política acordada; abort/timeout y cancelación de búsquedas obsoletas.
- Error uniforme propuesto: `{ code, message, details?, requestId }`; formalizar DTO sin filtrar SQL o stacktrace.
- Distinguir 400/422 validación, 401 sesión, 403 permiso, 404 recurso no visible, 409 stock/estado/idempotencia y 429 límite de intentos.
- Listas con `{ items, nextCursor }`, orden estable y límite máximo. Filtros y fechas tipados, sin descargar todos los pedidos.
- Respuestas con IDs UUID opacos, fechas ISO UTC, importes en céntimos y moneda. El código `QK-...` es etiqueta, no clave relacional.
- Nunca enviar `actorUserId`, rol, estado de pago o total calculado por UI como autoridad. El servidor los determina.
- Desplegar cambios incompatibles de DTO con coordinación o compatibilidad temporal documentada; no corregir cada consumidor con un `any`.

### 5.2. Mapeos obligatorios

| Prototipo | Contrato objetivo |
| --- | --- |
| `cliente/comercio/repartidor/admin` | `customer/merchant/courier/admin`, múltiples roles y contexto de vista |
| `pendiente/confirmado/en_preparacion/listo_recoger/en_camino/entregado` | `pending/confirmed/preparing/ready/in_transit/delivered`, conforme al baseline |
| `cancelado/rechazado` | `cancelled/rejected` |
| `efectivo/yape_plin/tarjeta` | códigos de métodos publicados por API y habilitados realmente |
| `Product.stock` | disponibilidad de SKU; stock físico solo en vistas autorizadas |
| Variante con diferencia de precio | SKU con precio absoluto |
| `Merchant.isOpen` y horario de texto | estado calculado y horarios estructurados |
| `Purchase.addressSnapshot` con ID local | destino histórico independiente de dirección editable |
| `SupportTicket.description/response` | conversación con mensajes ordenados |
| `Notification.isRead` | derivado de `readAt`; `promo` se adapta a `promotion` si corresponde |
| `Courier.id` y `ownerUserId` | identificar por contrato; no asumir que perfil y usuario tienen UUID distintos |

### 5.3. Retiro progresivo del modo prototipo

1. Separar explícitamente demo y real por configuración de build; modo real nunca cae a mocks ante un fallo HTTP.
2. Reemplazar `loginDemo`, `loginGoogle` ficticio, fallback de login, `resetToSeed`, seeds de direcciones y actividad en los recorridos reales.
3. Migrar cada pantalla con estados loading, vacío, error, reintento y operación en curso. Mostrar éxito solo después de confirmación remota.
4. Retirar de `dataStore` cada dominio al conectarlo; invalidar consultas relacionadas después de mutación.
5. Dejar de leer/escribir `quickly_auth_v1` y `quickly_datastore_v2/v3/v4` en modo real; limpiar únicamente esas claves antiguas una vez mediante migración versionada. No ejecutar `localStorage.clear()`.
6. Versionar carrito: los IDs mock no se convierten automáticamente en UUID. Explicar y descartar entradas no resolubles o permitir reconstrucción desde catálogo real.
7. Limpiar cachés privadas al cerrar/cambiar sesión; cancelar peticiones anteriores para evitar mezclas entre cuentas.
8. Actualizar pruebas que hoy esperan simulaciones; mantener mocks solo como fixtures aislados de pruebas/demo.

## 6. Plan PostgreSQL y migraciones

### 6.1. Aprovechar el baseline

Conservar claves foráneas, índices parciales, snapshots históricos, restricciones de cobro y triggers. No debilitar restricciones para hacer pasar consultas incorrectas. La API debe traducir conflictos esperables a errores de dominio.

- Inventariar DB real: versión, tablas, columnas, índices, triggers, vistas y datos. Comparar con `001_schema.sql` y registrar divergencias sin exportar secretos.
- Elegir un ejecutor SQL de migraciones versionadas; usar el baseline una sola vez en base vacía. Si ya está instalado, registrar baseline verificado, no reejecutarlo.
- Crear rol de migración y roles runtime/worker con permisos limitados; configuración por ambiente y sin contraseñas por defecto fuera de desarrollo.
- Separar seeds de catálogos obligatorios, bootstrap admin y fixtures de prueba. Cargar comercios/productos reales mediante proceso validado, con SKU y existencias iniciales.
- No importar usuarios, identidades, cobros, pedidos ni ganancias simuladas del navegador como registros reales.

### 6.2. Backlog de cambios de datos

| Cambio | Cuándo | Criterio |
| --- | --- | --- |
| Movimientos de inventario | F3 | Ajustes y consumo trazables, sin reemplazar reservas existentes |
| Auditoría de solicitudes/aprobaciones | F2/F5 | Conservar motivos y fechas, no solo último estado; evaluar si audit_entries cubre consultas requeridas |
| Datos de efectivo/cambio | F4 | Guardar solo los campos pactados necesarios y validar totales |
| Relación incidencia-ticket | F5 | Un vínculo inequívoco sin depender de códigos de texto |
| Deducción de notificaciones y ejecución de outbox | F5 | Restricción/registro por evento y destinatario; mecanismo de reclamación/reintento verificable |
| Archivos y estados de carga | F3 | Usar claves existentes y agregar metadatos/estado si el flujo lo necesita |
| Posiciones/retención GPS | F7 opcional | Datos limitados a entregas activas y acceso autorizado |
| Promociones y descuentos históricos | F7 opcional | Nuevas entidades/reglas; totales y reembolsos consistentes |
| Liquidaciones/libro monetario | F7 según negocio | Separar ventas, cobros, custodia de efectivo y pagos a participantes |

Cada migración debe incluir propósito, compatibilidad, verificación y estrategia de recuperación. No cambiar un baseline ya aplicado para introducir funcionalidades nuevas.

## 7. Fases de trabajo, dependencias y entregables

Los esfuerzos son orientativos para una persona con experiencia y dedicación completa. Incluyen implementación y validación de cada fase, no espera de proveedores ni cambios de alcance. Reestimar después de F0; no son fechas comprometidas.

| Fase | Tareas y entregables | Depende de | Salida verificable | Esfuerzo |
| --- | --- | --- | --- | --- |
| F0. Línea base y reparación | Inventario DB/API; ejecutar instalación/verificación en DB aislada; corregir consultas/estados/DTO; decidir sesión, persistencia y reglas operativas; actualizar README | Ninguna | API arranca contra baseline, consultas existentes pasan pruebas integradas y decisiones registradas | 4–7 días |
| F1. Infraestructura de integración | Cliente HTTP, OpenAPI, errores, request ID, caché y CI; sesión real, guard de rutas y permisos de recursos; fixtures independientes | F0 | Login/logout/recarga reales; 401/403 comprobados; ausencia de identidad local autoritativa | 5–8 días |
| F2. Cuentas y operación inicial | Perfiles, solicitudes/aprobaciones, miembros, zonas, direcciones, horarios y administración mínima; bootstrap admin | F1 | Comercio/repartidor se registran, admin aprueba y roles autorizados pueden operar | 6–10 días |
| F3. Catálogo e inventario | CRUD producto/SKU, búsqueda, imágenes, movimientos y control de disponibilidad; integrar catálogo y gestión comercial | F2 | Comercio publica y cliente compra SKU reales con stock consistente | 6–10 días |
| F4. Compra a entrega con efectivo | Cotización, checkout idempotente, transiciones, cancelación/rechazo, asignación/retiro/entrega y cobro efectivo; integrar 4 roles | F3 | Recorrido completo entre navegadores, sin mocks y con pruebas de concurrencia | 8–12 días |
| F5. Operación completa | Soporte/incidencias, favoritos, reseñas, notificaciones/outbox, auditoría, historial, reportes y ganancias | F4 | Todos los módulos operativos del prototipo tienen datos reales y permisos verificados | 7–12 días |
| F6. Pagos digitales | Proveedor sandbox, webhooks, conciliación, cancelación/cobro tardío y reembolsos; integrar UX de pago | F4 y worker F5 | Cobro y devolución sandbox confirmados por servidor; repetición de eventos segura | 6–12 días más habilitación externa |
| F7. Ampliaciones decididas | Google, GPS, promociones, carrito remoto, liquidaciones o multitienda, cada una con alcance propio | Núcleo estable; dependencias por función | Sin botones prometiendo capacidades no activadas | Estimar por iniciativa |
| F8. Preparación y piloto | Pruebas de recorrido y carga, revisión de permisos, despliegue staging, backup/restauración, alertas, manual de operación y piloto | F5; F6 si se habilita digital | Criterios de lanzamiento satisfechos y recuperación ensayada | 4–7 días |

Núcleo con efectivo y operación completa: aproximadamente 36–59 días de trabajo, sumando F0–F5 y F8. Con digital: 42–71 días, más habilitación del proveedor. F7 no está incluido. La programación concreta depende de los hallazgos de F0 y disponibilidad del equipo.

**Orden recomendado:** terminar cada flujo vertical con API, DB, pantalla y pruebas antes de abrir el siguiente. Incorporar auditoría y eventos en cada mutación desde su fase, aunque su panel y worker se completen en F5. No dejar seguridad, pruebas o integración web para el final.

### 7.1. Plantilla de tarea ejecutable

Cada tarea del tablero debe contener:

- ID del módulo y fase; caso de uso y actor.
- Tablas/consultas/migración involucradas.
- Ruta, DTO, permisos y errores documentados.
- Pantallas/acciones del store que reemplaza.
- Pruebas positivas, de permiso, de conflicto y rollback aplicables.
- Criterio de aceptación visible y evidencia de validación.

Ejemplo: `F4-M06-01 Crear compra idempotente`: misma clave/payload produce una sola compra; clave distinta disputando última unidad genera 409; total manipulado es ignorado/rechazado; CheckoutPage recupera respuesta tras timeout sin vaciar otros ítems.

## 8. Pruebas y controles de calidad

### 8.1. Por capa

- Dominio: matriz de transiciones, cancelación, mínimo/tarifa, cantidades, redondeo de comisión y autorización de acciones.
- Integración con PostgreSQL real: todas las consultas, restricciones, transacciones, vistas, expiraciones y rollback. No sustituir esta capa por repositorios mock.
- HTTP: validación DTO, cookies/CSRF/CORS, sesión, pertenencia a recursos, paginación y contrato OpenAPI.
- Frontend: adaptadores, estados asíncronos, 401/403/409, restauración de sesión, reintentos y aislamiento de caché.
- Recorridos E2E: cliente → comercio → repartidor → cliente/admin, usando sesiones independientes.

### 8.2. Escenarios obligatorios antes del piloto

1. Registro/login reales; logout y suspensión invalidan acceso.
2. Usuario A no consulta compra, dirección, ticket ni notificación de B.
3. Comercio A no administra productos, inventario ni pedidos de B.
4. Dos solicitudes simultáneas por la última unidad: una compra válida, sin stock negativo.
5. Dos solicitudes con misma clave de checkout: una compra; misma clave/payload diferente: conflicto.
6. Dos repartidores toman un pedido: uno gana; un repartidor toma dos pedidos: solo una asignación activa.
7. Cancelación/rechazo restaura disponibilidad una vez; retiro repetido no consume dos veces.
8. Recarga y timeout durante checkout permiten recuperar resultado sin duplicar compra.
9. Producto/comercio/zona desactivados durante checkout impiden compra inválida.
10. Entrega en efectivo registra cobro y cobrador con importes correctos.
11. Fallo al escribir evento/auditoría/outbox revierte mutación completa cuando forman parte de la transacción.
12. Worker reintenta sin duplicar notificaciones; caída no pierde evento confirmado.
13. Reportes coinciden con dataset de control incluyendo cancelaciones.
14. Si digital está activo: webhook duplicado, inválido y fuera de orden; cobro tardío; reembolso concurrente; proveedor indisponible y conciliación.
15. Backup restaurado en entorno aislado mantiene integridad y permite recorrido de lectura/operación.

### 8.3. Comandos de validación previstos

Ejecutar desde cada directorio con el gestor correspondiente al lockfile; confirmar dependencias antes de automatizar.

```text
backend/:          npm run build
backend/:          npm test -- --runInBand
backend/:          npm run test:e2e           # crear/configurar suite si aún no existe
backend/:          npm run db:verify         # solo sobre entorno aislado configurado
Frontend-Quickly/: npm run build
Frontend-Quickly/: npm test
```

Agregar CI para migrar DB temporal, verificar SQL y ejecutar integración/E2E. El script `test:e2e` declarado no acredita que exista una suite completa. Evitar usar datos operativos en pruebas.

## 9. Preparación de ambientes y operación

- Desarrollo: DB local aislada, seeds reproducibles y proveedor sandbox. Variables backend y URL pública de API separadas.
- Staging: topología web/API, cookies, TLS y archivos equivalentes a producción; cuentas por rol y dataset de aceptación.
- Producción: migraciones controladas, API/worker con misma versión compatible, secretos fuera del repositorio, readiness de DB y liveness separados.
- Registrar request ID, latencia, errores por ruta y eventos operativos sin secretos. Alertar fallos de checkout, worker atrasado, conciliación pendiente y conexiones DB agotadas.
- Definir timeouts, pool, límites de payload, rate limits y política de reintentos. No reintentar mutaciones automáticamente sin idempotencia.
- Backups programados, retención y restauración ensayada; procedimiento de reversión de versión y recuperación de migración.
- Manual operativo: aprobación, suspensión, pedido atascado, incidente después de retiro, efectivo, pago tardío y reembolso fallido.

## 10. Decisiones de negocio pendientes y supuestos para avanzar

Estas decisiones deben cerrarse en la fase indicada; no bloquean la elaboración del plan ni requieren rehacer la arquitectura completa.

| Decisión | Supuesto inicial del plan | Cerrar en |
| --- | --- | --- |
| Una o varias tiendas por compra | Una tienda seleccionada; multitienda fuera del primer lanzamiento | F0 |
| Cobro inicial | Efectivo; digital deshabilitado hasta completar F6 | F0 |
| Tarifa de envío | Regla de zona calculada por servidor; resolver diferencias con tarifa por comercio del prototipo | F0 |
| Comisión/ganancia reparto | No adoptar automáticamente el 80% del código; acordar fórmula y guardar tarifa pactada | F0/F4 |
| Aprobación | Cliente activo; comercio/repartidor con habilitación operativa aprobada | F0/F2 |
| Preparación y vencimiento | Definir plazos, actor que cancela y efectos en reservas/pagos | F0/F4 |
| Incidencia después de retiro | Resolución por soporte/admin, sin devolución automática de stock | F4/F5 |
| Liquidación efectivo | Acordar quién cobra, quién conserva y cómo concilia con comercio/repartidor | F4, antes de piloto |
| Topología web/API | Preferir mismo sitio; probar restricciones reales del navegador | F0/F1 |
| Google, GPS y cupones | No activos hasta implementar su módulo y validación | F7 |
| Liquidaciones monetarias | Panel de ganancias informa tarifas; pago real requiere libro y conciliación | F5/F7 |
| Campos comerciales adicionales | Catalogar cada campo de producto y decidir persistir, derivar u ocultar | F3 |

## 11. Definición de terminado

Una funcionalidad está terminada cuando tiene caso de uso y permisos en servidor, SQL/migraciones verificadas, contrato OpenAPI, pantalla integrada con estados de red y evidencia de pruebas relevantes. Existir como tabla, ruta o botón no basta.

El primer hito se cumple cuando cliente, comercio, repartidor y administrador operan una compra real en efectivo desde navegadores separados, con persistencia PostgreSQL, sin modificar datos de negocio en localStorage, con aislamiento entre cuentas, inventario consistente y auditoría.

El alcance completo se cumple cuando todas las pantallas inventariadas consumen datos reales o presentan explícitamente una capacidad deshabilitada, y los módulos acordados de F5/F6/F7 han pasado sus criterios. Registrar cualquier capacidad diferida como decisión de alcance visible; no sustituirla por simulaciones silenciosas.
