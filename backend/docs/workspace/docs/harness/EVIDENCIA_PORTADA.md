# Portada: adaptación del prototipo a HTTP

Alcance: etapas 1 y 2 de `PLAN_PORTADA_Y_CARGA_CATALOGO.md`; etapas 3/4 de datos pendientes. No se integra `CatalogLanding.tsx`. Mapa por componente/API en [MAPEO_PORTADA.md](MAPEO_PORTADA.md).

## Implementación

- `HomePage.tsx` compone el carrusel extraído del prototipo, categorías, catálogo, comercios, cobertura, accesos a cuenta y afiliación. Conserva imágenes locales, marca verde/carbón, tarjetas redondeadas y composición adaptable.
- `CatalogBrowser` comparte el catálogo de portada y tienda: búsqueda, categoría UUID, zona, rango de precio en céntimos, stock, cursor, detalle por HTTP y selección SKU/cantidad con `RealProductContent`. El carrito guarda solo intención; la cotización y confirmación existentes siguen calculadas por servidor.
- Categorías, productos, comercio seleccionado, lista de comercios, zonas y vista rápida tienen estados de red separados. Los errores no se convierten en datos demo ni dejan visibles resultados de un filtro anterior.
- `CatalogNavbar` adapta la presentación del encabezado con buscador, sesión, enlaces a roles concedidos, logout y cantidad real del carrito. Navegación móvil y footer enlazan recorridos existentes. Controles táctiles de 44 px, verde oscuro para texto/acciones, foco y Dialog existentes.
- Favoritos de productos/comercios esperan confirmación HTTP. Se pueden retirar en Mis favoritos. No se inventa un estado inicial de favorito remoto: el botón permite guardar idempotentemente.
- Se retiran de la portada real nombres/precios fijos, fallback a otro producto, descuentos, sellos oficiales, calificaciones, pagos digitales, GPS/mapa/dirección simulados y plazos de llegada fijos. La cobertura muestra tarifas/estimaciones configuradas; el envío/cobro corresponde a cada tienda.
- `DemoHomePage.tsx` conserva el prototipo solo para el modo demo explícito; `OfficialStoresSection`, `BigStoreProductsSection`, `ProductDetailModal`, Navbar y MobileNav anteriores aún tienen consumidores demo. No se eliminan esos consumidores ni el borrador local ajeno.

## Verificación dirigida

Compilación TypeScript/Vite aprobada. `node scripts/harness-docker.cjs --browser --spec=home.spec.ts` aprobado: 2/2 escenarios con navegador real y PostgreSQL aislado. El primer intento se detuvo por suite no registrada; se añadió únicamente `home.spec.ts` a la lista permitida. Durante desarrollo se corrigieron dos supuestos del test: tamaño de página real de 24 y selección del texto compuesto del SKU en carrito.

| Criterio | Evidencia |
| --- | --- |
| Catálogo HTTP/PostgreSQL | Productos de tienda aprobada creados exclusivamente en DB temporal; precios, stock y nombre provienen de API |
| Filtros/paginación | Búsqueda, categoría, límite de precio sin resultados y cursor entre páginas |
| Producto a carrito | Vista rápida, variante Grande, cantidad 2, badge reactivo y SKU persistido; agregar agotado bloqueado |
| Favoritos | Guardar producto desde tarjeta, consultar persistencia y quitar desde Mis favoritos; guardar comercio desde portada |
| Comercios | Tarjeta del servidor y navegación a productos de su tienda |
| Carga/vacío/error/reintento | Respuestas retrasadas, error de catálogo/categorías independientes, reintento por sección y resultados vacíos sin mocks |
| Adaptación visual | Capturas a 390, 768 y 1440 px y comprobación de ausencia de scroll horizontal; cierre del modal por Escape |

Capturas locales reproducibles: `.tmp/portada-390.png`, `.tmp/portada-768.png`, `.tmp/portada-1440.png`, `.tmp/portada-vacia-mobile.png` y `.tmp/portada-mobile-viewport.png`. Son fixtures sintéticos; no acreditan un catálogo de negocio cargado. Una captura de página completa representa las barras fijas en el borde de su viewport; durante navegación permanecen ancladas al dispositivo.

## Cierre integral

`node scripts/check-workspace.cjs` aprobado con código 0 en 357,0 segundos. Registro local: `.tmp/workspace-check.log`.

| Bloque | Resultado |
| --- | --- |
| Contratos y compilaciones backend/frontend | Aprobados |
| Unitarias backend | 11/11 |
| API/PostgreSQL F0–F8 | 102/102 |
| Frontend (23 archivos) | 115/115 |
| Navegador real (incluye portada, compra única y multitienda) | 14/14 |
| Total | 242/242 |

La suite de portada del cierre incluye búsqueda del encabezado con Enter, stock agotado y favorito de comercio, además de los escenarios dirigidos. Se revisaron visualmente las capturas finales móvil, tablet, escritorio y vacío, con foco/Escape del modal y sin desbordamiento horizontal. El harness eliminó las DB temporales y detuvo únicamente `postgres-test`; no reutilizó ni pobló desarrollo. No se repitió staging HTTPS F8 porque no se cambió su infraestructura ni se está cerrando lanzamiento.

## Límites y siguiente paso

Elegir catálogo de demostración en DB separada o datos reales proporcionados, antes de preparar/aplicar una carga. No se ha modificado la conexión ni poblado la base de desarrollo. No se realizaron commits/pushes de esta adaptación ni despliegues. La base de consulta F6 no habilita digital, y los pendientes de seguridad/operación/piloto de F8 continúan vigentes.
