# Portada: mapa del prototipo a HTTP

Alcance actual: etapas 1 y 2 de `PLAN_PORTADA_Y_CARGA_CATALOGO.md`. Se adapta `HomePage.tsx`; `CatalogLanding.tsx` no se integra. La carga (etapas 3 y 4) espera decisión entre demostración separada y datos reales. F6/F7/F8 mantienen sus pendientes.

| Origen / sección | Sustitución y contrato | Acción / ajuste |
| --- | --- | --- |
| Navbar, buscador y MobileNav | `useAuthStore`, sesión HTTP; `realCartStore` (solo intención SKU/cantidad) | Buscar `/?q=`, carrito real, cuenta y enlaces a roles concedidos. Sin loginDemo, cupones, Play ni zonas ficticias en modo real |
| Carrusel de HomePage e imágenes locales | Presentación sin datos de negocio | Conservar composición y recursos; efectivo, catálogo y envío/cobro por tienda. Sin comercios nombrados, pagos digitales ni plazos prometidos |
| mainCategoryCards y categorías del menú | `GET /catalog/categories`: id/code/name | Filtrar `category` por UUID de categoría de producto, sin inferirla desde el giro comercial |
| featuredCards, BigStoreProductsSection | `GET /catalog/search`: CatalogProductDto y CatalogSkuDto, página/cursor | Tarjetas del prototipo con nombres, imágenes, importes absolutos y disponibilidad por SKU; búsqueda, filtros y paginación HTTP |
| Agregar destacado con fallback products[0] | `GET /products/:id`, `RealProductContent`, `realCartStore.add` | Vista rápida con selección de SKU/cantidad; ningún precio local ni sustitución por otro producto |
| ProductDetailModal | Dialog accesible + RealProductContent | Carga/error/reintento del detalle, Escape, foco y carrito real. Detalle completo existente sigue disponible |
| Corazones y favoritos | FavoriteButton, `PUT /me/favorites/products/:id` y `stores/:id`; GET/DELETE en Mis favoritos | Requiere sesión real, espera confirmación HTTP y muestra errores; quitar desde Mis favoritos |
| OfficialStoresSection y sellos | `GET /stores`: PublicStore, isOpen, zone_name, logoUrl/bannerUrl | Reutilizar tarjeta visual para comercios disponibles; sin afirmar oficial/verificado ni calificaciones inventadas |
| rightSidebarShortcuts / ofertas y tiempos fijos | Filtros del catálogo y navegación a cuenta | Retirar descuentos y promociones no implementados; búsquedas y precio máximo solo con filtro real |
| Tarjetas dirección, pedido y recientes | Enlaces a direcciones y pedidos propios existentes | Sin dirección, mapa, compras o estado simulados en portada. Identidad y detalle se consultan en sus recorridos reales |
| Cobertura & Tarifas | `GET /geography/zones`: ZoneDto | Tarifas y estimaciones configuradas por zona; no equivalen a una promesa de llegada. Total/envío definitivo en cotización |
| Afiliación y footer | Rutas `/registro/comercio`, `/registro/repartidor`, soporte | Formularios reales con sesión y habilitación; conservar marca verde/carbón |

Cada consulta tiene carga, vacío, error y reintento. No hay fallback a mocks. La portada anterior queda temporalmente en `DemoHomePage.tsx`, solo bajo `VITE_APP_MODE=demo`, para conservar una referencia verificable y consumidores del prototipo. Sus componentes compartidos no se eliminan mientras tengan consumidores demo. El borrador CatalogLanding se conserva local sin integrar.

Validación y limitaciones: ver `ESTADO.md`. No sembrar datos en desarrollo para comprobar la portada: los recorridos web usan PostgreSQL y fixtures en DB aleatorias del harness.
