# F3 — catálogo, archivos e inventario

Fecha: 26 de octubre de 2026. F3 completada en desarrollo local. La evidencia del primer bloque se conserva más abajo como antecedente; F4–F8 mantienen su alcance pendiente.

## Verificación de cierre

`node scripts/check-workspace.cjs`: código 0 sobre la versión final. Compilaciones backend/frontend, OpenAPI y tipos generados vigentes; 181 pruebas aprobadas:

| Capa | Resultado |
| --- | --- |
| Unitarias backend | 7/7 |
| Integración API/PostgreSQL | 64/64 (23 F0/F1 + 12 F2 + 29 F3) |
| Frontend Vitest | 100/100 |
| Navegador real Playwright | 10/10 (4 F1 + 4 F2 + 2 F3) |

Cada suite instala baseline y aplica dos veces las migraciones en su DB aleatoria. Los objetos viven en directorios temporales separados; DB/objetos eliminados al finalizar y contenedor de pruebas detenido. El worker periódico se verifica en proceso de aplicación separado del proceso global de tests; el comando por lote usa esa misma DB aislada. Se verificó idempotencia después de vencimiento, sin nueva compra ni nueva reserva.

`npm run dev:db`: código 0, migración `003_f3_pending_order_expiration.sql` aplicada sobre desarrollo con configuración y volumen conservados. PostgreSQL saludable en 5433; no se ejecutaron fixtures sobre desarrollo. `docker compose config --quiet`: código 0. `git diff --check` de ambos repositorios: código 0.

Capturas revisadas: `.tmp/f3-store-branding-mobile.png`, `.tmp/f3-avatar-mobile.png`, `.tmp/f3-catalog-mobile.png` y `.tmp/f3-merchant-mobile.png`, con comprobación de ausencia de desbordamiento a 390 px. El fallo de carga de avatar conserva la imagen anterior y comunica el error; el modo real no usa datos demo.

## Ampliación que completa los pendientes registrados

- Avatar personal privado con consulta, publicación, reemplazo y eliminación desde el perfil real. La URL requiere sesión de la misma cuenta; el cliente no elige usuario ni clave.
- Logo y banner en gestión de tienda, con lectura de miembros y escritura de propietario/encargado/administración. Una tienda pendiente prepara imágenes en privado; una suspendida no publica cambios. La tienda pública y su listado muestran imágenes reales únicamente con comercio y zona habilitados.
- Módulo `media` compartido por todos los recursos, con validación PNG independiente del cliente, objetos UUID, límites, lectura autorizada y retiro solo cuando ninguna referencia los conserva. Se verifica rollback de outbox, referencias compartidas, cargas de más de 100 KB, límite 413 y persistencia al reiniciar API.
- Almacenamiento de una instancia definido y persistido también en Docker Compose. Configuración Compose validada sin desplegar; documentación de permisos y respaldo conjunto de objetos/DB. Ver [OPERACION_F3.md](OPERACION_F3.md).
- Migración aditiva `003_f3_pending_order_expiration.sql`, sin modificar la migración 002 aplicada. Los pedidos antiguos permanecen sin plazo automático; los nuevos fijan plazo de aceptación con reloj PostgreSQL, por defecto 15 minutos configurable, y el mismo vencimiento en sus reservas.
- Worker periódico en la API, por defecto cada 30 segundos, y comando `npm run orders:expire -- --limit=50`. Solo cancela `pending` de una tienda, con efectivo pendiente y sin asignación. Transición, liberación de reservas, cancelación de pago, evento, auditoría y outbox son atómicos; stock físico no se modifica. No requiere dependencias ni servicios adicionales.
- Aceptación tardía rechazada en la actualización SQL, con 409 después de confirmar cancelación cuando es elegible. Se conservan las reservas de pedidos aceptados y se exige revisión si hay pagos en proceso/digitales, compras multitienda o asignaciones. El reloj de una reserva no libera inventario por sí solo.
- Pruebas de dos workers, carrera de aceptación, autorización antes del vencimiento, rollback/recuperación, modo manual, idempotencia después de cancelar, worker periódico en proceso separado y comando operacional sobre DB aislada. Dos recorridos web F3 comprueban también avatar, logo/banner, privacidad, persistencia, eliminación y falla de red en móvil.

## Evidencia del primer bloque

## Alcance implementado

- Catálogo HTTP real en `/`, `/negocios`, `/negocios/:id` y `/producto/:id`, con detalle y vista rápida accesible. Filtros de búsqueda, categoría de producto, zona, tienda (API/detalle de negocio), precio, disponibilidad y cursor. Las respuestas públicas excluyen productos/SKU inactivos, comercios suspendidos y zonas deshabilitadas.
- Gestión comercial en `/comercio/productos`: publicación, edición y archivo lógico; variantes con SKU/barcode únicos, precio absoluto en céntimos, desactivación y umbral de stock bajo. El operador consulta; propietario/encargado modifican solo su recurso autorizado. Administración conserva la política explícita de F2.
- Migración aditiva `002_f3_catalog_inventory.sql`: posición de producto, umbral de alerta y bitácora append-only `inventory.movements`. Taxonomía de producto independiente del tipo de comercio. No se crean usuarios, comercios ni productos demo en desarrollo.
- Fachada transaccional `modules/inventory/public.ts` compartida por catálogo, compra y retiro: inicializar, bloquear disponibilidad, ajustar, reservar, liberar y consumir. Un solo cliente PostgreSQL por transacción, locks físicos en orden estable y disponibilidad física menos reservas activas. El ajuste es una variación con motivo, nunca una sobrescritura del stock reservado.
- Movimientos iniciales, ajustes y consumos con actor, cantidad, saldo, motivo y fecha; consumo vinculado a la línea del pedido. No se inventa bitácora histórica para existencias anteriores a la migración. Las nuevas mutaciones comerciales registran auditoría/outbox en la misma transacción.
- Imágenes de producto con validación de contenido, CRC, estructura PNG, dimensiones y descompresión limitada. El navegador prepara PNG desde PNG/JPEG/WebP; el servidor solo acepta PNG RGB/RGBA de 8 bits, sin entrelazado, hasta 1600 × 1600 y 2 MB. Se descartan metadatos y se rechaza animación/SVG. Diez posiciones, reemplazo y eliminación autorizados. La posición 0 es la portada.
- Adaptador de objetos local en `MEDIA_ROOT` (predeterminado `.media` relativo al proceso API). Claves aleatorias generadas por servidor; DB guarda la referencia, nunca base64. La confirmación/publicación se hace en una sola petición tras validar y comprobar permisos nuevamente. Los archivos sin referencia no son públicos. Los productos archivados tienen lectura privada autorizada para gestionar sus imágenes.
- Limpieza de huérfanos con simulación predeterminada y antigüedad mínima de 24 horas: `npm run media:cleanup`. Con escritores/API detenidos, `npm run media:cleanup -- --apply` elimina únicamente objetos propios no referenciados. El harness usa carpetas temporales distintas de desarrollo y limpia solo las que genera.
- OpenAPI exportado y tipos frontend generados, con validación Zod. Listados de catálogo pasan del formato histórico plano snake_case a `{ items, nextCursor }` y agregados camelCase por producto. Las pruebas F0 y los consumidores reales se adaptaron al contrato nuevo; el modo demo sigue explícitamente separado.
- No se muestran precios tachados, promociones, condición, envíos gratis, ventas, calificaciones ni sellos oficiales ficticios.

## Verificaciones

`node scripts/check-workspace.cjs`: código 0. Backend y frontend compilados, OpenAPI/tipos sincronizados y 162 pruebas aprobadas: 7 unitarias backend, 49 escenarios HTTP (23 F0/F1 + 12 F2 + 14 F3), 97 pruebas frontend y 9 recorridos de navegador real. Cada suite instala baseline y aplica dos veces las migraciones sobre su DB aleatoria; 43 tablas y 5 vistas. Bases y archivos temporales eliminados; contenedor exclusivo de pruebas detenido.

El recorrido F3 en navegador comprueba publicación, edición de precio, ajuste con motivo, consulta de movimientos, alta de otra presentación, carga de imagen y consulta desde otra sesión móvil; verifica archivo lógico, imagen servida y fallo de red sin datos demo. Se revisaron las capturas locales `.tmp/f3-catalog-mobile.png` y `.tmp/f3-merchant-mobile.png`; sin desbordamiento horizontal a 390 px. Se corrigió un reinicio de formularios durante la recarga del SKU que podía borrar un ajuste en edición.

`npm run dev:db`: código 0. PostgreSQL de desarrollo saludable y migración `002_f3_catalog_inventory.sql` aplicada mediante el runner versionado. Configuración y volumen existentes conservados; sin fixtures de usuarios, tiendas, productos o compras en desarrollo. Solo se agrega la taxonomía obligatoria del catálogo y la estructura de F3.

Los escenarios nuevos comprueban SKU/barcode/variante únicos, rollback de producto parcial, permisos por tienda, operador de lectura, archivo, precio vigente e histórico vendido, filtros/cursor, ajustes con reservas, ajustes/compras concurrentes por última unidad, contenido/tamaño de imágenes, lectura pública/privada y limpieza de huérfanos.

## Límites y siguientes fases

Los pendientes originales de avatar/logo/banner y aceptación con plazo se resuelven en la ampliación descrita arriba; D14 sustituye ese aplazamiento de D13. La duración de 15 minutos es configurable y debe ratificarse para el piloto. No se inventan vencimientos retroactivos ni se cancelan pedidos aceptados.

Al preparar despliegue, F8 verificará topología HTTPS, almacenamiento compartido si se eligen varias instancias y restauración conjunta de DB/objetos. La configuración de persistencia y el reinicio local no declaran esas pruebas de piloto terminadas.

Checkout web, carrito real y recorrido entre cuatro roles corresponden a F4. Este bloque verifica el contrato de compra ya existente por API para evitar regresiones de precio, reserva y consumo; no declara esos recorridos web completados.
