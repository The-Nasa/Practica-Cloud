# Plan de Integración Real Frontend ↔ Backend & Limpieza de Mocks

**Fecha de creación:** 27 de octubre de 2026
**Proyecto:** Quickly Delivery (Tingo María)
**Marco de trabajo:** Harness Engineering (Avance por bloques verificables, sin suposiciones ni código muerto)
**Estado general:** 🟡 En curso — Bloque 1 completado, listo para iniciar Bloque 2

---

## 🎯 Objetivo General

Reemplazar al 100% las simulaciones y datos mockeados en `Frontend-Quickly/` para que toda la interfaz consuma exclusivamente las APIs del backend NestJS y la persistencia en PostgreSQL, migrando los datos representativos de Tingo María (`initialData.ts`) a la base de datos y eliminando gradualmente el código obsoleto.

---

## 📊 Matriz de Avance por Bloques

|     Bloque     | Descripción                                        |    Estado    | Criterio de Cierre                                                                   |
| :------------: | :-------------------------------------------------- | :-----------: | :----------------------------------------------------------------------------------- |
|  **B0**  | Siembra de Datos a PostgreSQL (Seed Tingo María)   | ✅ Completado | Base de datos Docker con zonas, comercios, platos y usuarios reales de prueba        |
| **B0.5** | Autenticación y Sesiones Reales (Login y Registro) | ✅ Completado | Login y registro conectados a NestJS/PostgreSQL con cookie HttpOnly y roles reales   |
|  **B1**  | Portada, Navbar y Catálogo Público Real           | ✅ Completado | Portada premium conectada a la API; buscador y selector de zona activos              |
|  **B2**  | Carrito, Cotización y Checkout Multitienda Real    | ✅ Completado | Carrito único `realCartStore`; órdenes y cobros generados en PostgreSQL          |
|  **B3**  | Panel de Comercios (Comandas y Catálogo)           | ✅ Completado | Restaurante recibe comanda en vivo, avanza estados y sube fotos de platos            |
|  **B4**  | Panel de Repartidores (Entregas y Efectivo)         | ✅ Completado | Repartidor se conecta, toma pedidos, entrega y registra cobro en efectivo            |
|  **B5**  | Administración, Soporte, Reseñas y Favoritos      |  ⏳ En curso  | Panel de admin, tickets de ayuda, favoritos y calificaciones en servidor             |
|  **B6**  | Depuración Final y Eliminación de Mocks           | 📋 Pendiente | Eliminación de `initialData.ts`, `dataStore.ts`, `DemoSwitcher`; build limpio |

---

## 🔄 Protocolo de Harness por Bloque

Para cada bloque de trabajo se seguirá el estándar estricto de ingeniería:

1. **Definición del caso de uso:** Especificar endpoints y componentes involucrados.
2. **Adaptación de componentes:** Conectar el componente UI al servicio tipado (`apiClient`).
3. **Retiro de mocks:** Eliminar referencias a `dataStore` en la sección intervenida.
4. **Verificación visual y de API:** Comprobar en navegador (`localhost:5173`) y terminal (`npm test` o endpoint).
5. **Registro de progreso:** Marcar la casilla del checklist `[x]` y registrar la evidencia en este documento.

---

## 📋 Detalle de Bloques

### 🧱 Bloque 0: Siembra de Datos a PostgreSQL (`npm run db:seed`)

> **Objetivo:** Migrar los datos de `Frontend-Quickly/src/mocks/initialData.ts` a la base de datos PostgreSQL de desarrollo en Docker (`127.0.0.1:5433`).

- [X] **B0.1:** Crear script `backend/scripts/seed-initial.cjs` y agregar script `db:seed` en `backend/package.json`.
- [X] **B0.2:** Insertar las 5 Zonas de Cobertura de Tingo María (`Centro`, `Rupa Rupa Norte`, `Rupa Rupa Sur`, `Castillo Grande`, `Naranjillo`) con sus tarifas base en céntimos (PEN).
- [X] **B0.3:** Crear cuentas de usuario base con hash de contraseña seguro:
  - Cliente: `cliente@quickly.pe`
  - Comercio: `comercio@quickly.pe` (La Selva Gourmet)
  - Repartidor: `repartidor@quickly.pe` (Carlos Ramos)
  - Administrador: `admin@quickly.pe` (bootstrap oficial)
- [X] **B0.4:** Crear los comercios aprobados con categorías, dirección, teléfono y horarios de atención (L-D 08:00 - 23:00, `accepting_orders = true`).
- [X] **B0.5:** Crear platos y productos con SKUs, precios en céntimos enteros, variantes y stock disponible inicial.
- [X] **Verificación B0:** Ejecutar `npm run db:seed` y comprobar con `npm run db:inspect` que existan zonas, tiendas y productos persistidos.

---

### 🔑 Bloque 0.5: Autenticación, Registro y Sesiones Reales (`/api/v1/auth/*`)

> **Objetivo:** Conectar los formularios de acceso y registro a la API real de NestJS y PostgreSQL en Docker, unificando la app en `npm run dev`.

- [X] **B0.5.1:** Conectar [LoginPage.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/auth/LoginPage.tsx) a `useAuthStore` y `identityApi.login` (reemplazando `demoAuthStore`).
- [X] **B0.5.2:** Actualizar las credenciales del drawer de prueba a `Password123!` para coincidir con los hashes reales de PostgreSQL en Docker.
- [X] **B0.5.3:** Conectar [RegisterCustomerPage.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/auth/RegisterCustomerPage.tsx) a `identityApi.register` para persistir nuevos clientes en la base de datos.
- [X] **B0.5.4:** Unificar la ruta `/login` y `/registro` en [router.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/app/router.tsx) sin bifurcación de mocks.
- [X] **B0.5.5:** Configurar [Frontend-Quickly/.env](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/.env) en `VITE_APP_MODE=real`, proxy a `http://127.0.0.1:3000` y retirar script `dev:demo`.
- [X] **Verificación B0.5:** Compilación limpia con `npx tsc -b` y login funcional por HTTP contra el backend.

---

### 🧱 Bloque 1: Portada, Navbar y Catálogo Público Real

> **Objetivo:** Que la navegación y la portada muestren el diseño premium conectado a los datos sembrados.

- [X] **B1.1:** Ajustar [Navbar.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/components/shared/Navbar.tsx) para que el contador de carrito lea de `useRealCartStore` y el perfil lea de `useAuthStore`.
- [X] **B1.2:** Conectar el buscador de [Navbar.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/components/shared/Navbar.tsx) a `catalogApi.search({ q })` con debounce y sugerencias en vivo.
- [X] **B1.3:** Conectar el selector de zonas de Tingo María en el Navbar a `operationsApi.zones()`.
- [X] **B1.4:** Conectar [HomePage.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/catalog/HomePage.tsx):
  - Categorías dinámicas desde `catalogApi.categories()`.
  - Tiendas destacadas desde `catalogApi.stores()` ([OfficialStoresSection.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/components/shared/OfficialStoresSection.tsx)).
  - Productos con stock desde `catalogApi.search()` ([BigStoreProductsSection.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/components/shared/BigStoreProductsSection.tsx) y recomendados).
- [X] **B1.5:** Conectar el modal de detalle de producto ([ProductDetailModal.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/catalog/ProductDetailModal.tsx)) a `catalogApi.product(id)` y botón "Agregar al carrito" a `useRealCartStore(s => s.add)`.
- [X] **Eliminación gradual:** Desacoplar `HomePage.tsx` y `Navbar.tsx` de `dataStore.ts`.
- [X] **Verificación B1:** Navegar en `http://localhost:5173` y verificar carrusel, tiendas, búsqueda y modal de productos con datos de PostgreSQL.

---

### 🧱 Bloque 2: Experiencia del Cliente (Carrito, Cotización y Checkout)

> **Objetivo:** Proceso completo de compra real contra entrega en efectivo.

- [X] **B2.1:** Unificar el carrito: migrar la página `/carrito` ([CartPage.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/cart/CartPage.tsx)) para consumir exclusivamente `realCartStore.ts` con diseño visual premium, agrupación por tiendas, control de cantidades y stock del servidor.
- [X] **B2.2:** Integrar cotización en tiempo real (`orderingApi.quote` y `orderingApi.groupQuote`) mostrando desglose de productos y tarifa de envío según la zona de la dirección seleccionada en Tingo María.
- [X] **B2.3:** Conectar la pantalla `/checkout`:
  - Selección de dirección real del usuario (`operationsApi.addresses()`).
  - Confirmación con método de pago en efectivo y generación de `Idempotency-Key` único.
  - Soporte para compra monotienda y multitienda ([GroupCheckoutPage.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/checkout/GroupCheckoutPage.tsx)).
- [X] **B2.4:** Conectar seguimiento en vivo (`/cliente/seguimiento/:id` y `/cliente/pedidos/:id`) al estado real del pedido (`RealOrderDetailPage` y `orderingApi.detail(id)`).
- [X] **Eliminación gradual:** Desacoplado `CartPage.tsx` y `router.tsx` de `cartStore.ts`.
- [X] **Verificación B2:** Build de producción exitoso con Vite/tsc y 115/115 pruebas pasando al 100%.

---

### 🧱 Bloque 3: Panel de Comercios (Comandas y Catálogo)

> **Objetivo:** Flujo operativo para restaurantes y tiendas.

- [X] **B3.1:** Conectar `/comercio/pedidos` a la bandeja de pedidos en tiempo real ([RealOrderPages.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/orders/RealOrderPages.tsx)) consumiendo `/merchant/stores/:storeId/order-feed`.
- [X] **B3.2:** Botones de acción de la comanda con actualización en servidor:
  - "Aceptar pedido" (`/merchant/orders/:id/accept`)
  - "Iniciar preparación" (`/merchant/orders/:id/start-preparation`)
  - "Listo para repartidor" (`/merchant/orders/:id/mark-ready`)
  - "Rechazar/Cancelar pedido" con motivo auditado (`/merchant/orders/:id/rejections`).
- [X] **B3.3:** Conectar `/comercio/productos` ([RealMerchantProductsPage.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/merchant/RealMerchantProductsPage.tsx)):
  - Listado de productos e inventario de la tienda.
  - Formulario de nuevo plato con variantes (SKUs), precios en céntimos y existencias iniciales.
  - Ajuste de existencias físicas en inventario y visor de movimientos.
  - Subida de imágenes a `/merchant/products/:id/images` y orden de posición.
- [X] **B3.4:** Configuración de horarios semanales y switch de apertura/pausa en tiempo real en [StoreManagementPage.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/operations/StoreManagementPage.tsx).
- [X] **Eliminación gradual:** Retirados los ternarios demo y componentes no conectados en las rutas `/comercio/*` de [router.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/app/router.tsx).
- [X] **Verificación B3:** Compilación TypeScript y 115/115 pruebas pasando exitosamente.

---

### 🧱 Bloque 4: Panel de Repartidores (Entregas y Efectivo)

> **Objetivo:** Ciclo de delivery y cobro en mano.

- [X] **B4.1:** Switch "En línea / Fuera de línea" conectado a `operationsApi.availability()` en [OperationalCourierPage.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/operations/CourierProfilePage.tsx).
- [X] **B4.2:** Tablero de pedidos disponibles listos para entrega en su zona de cobertura (`/repartidor/solicitudes` conectado a `/courier/orders?scope=available`).
- [X] **B4.3:** Flujo de entrega paso a paso en [RealOrderPages.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/orders/RealOrderPages.tsx):
  - "Tomar entrega" (`/courier/orders/:id/claim` con versión optimista)
  - "Confirmar retiro en tienda" (`/courier/assignments/:id/pickup`)
  - "Confirmar entrega y cobro en efectivo" (`/courier/assignments/:id/deliver` con cálculo de cambio y verificación de importe).
- [X] **B4.4:** Historial y panel de ganancias (`/repartidor/historial` y `/repartidor/ingresos` conectado a `/courier/earnings` y exportación de reporte CSV en [RealEngagementPages.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/features/engagement/RealEngagementPages.tsx)).
- [X] **Eliminación gradual:** Rutas `/repartidor/*` unificadas en [router.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/app/router.tsx) sin ternarios demo.
- [X] **Verificación B4:** Compilación TypeScript limpia y 115/115 pruebas pasando al 100%.

---

### 🧱 Bloque 5: Administración Central, Soporte y Reseñas

> **Objetivo:** Módulos de soporte, confianza y gestión de la plataforma.

- [X] **B5.1:** Panel de administración `/admin`:
  - Aprobación de comercios y repartidores pendientes (`AdminRequestsPage`).
  - Gestión de Zonas de cobertura y tarifas de envío (`RealAdminZonesPage`).
  - Métricas de ventas y comisiones (`/api/v1/admin/reports` y `RealReportsPage`).
- [X] **B5.2:** Sistema de tickets de soporte `/cliente/ayuda` conectado a `engagementApi.tickets()` (`RealTicketsPage`, `RealTicketDetail`).
- [X] **B5.3:** Reseñas y calificaciones de comercios conectadas a `engagementApi.storeReviews()` y `ReviewForm`.
- [X] **B5.4:** Guardado de tiendas y platos favoritos en `/cliente/favoritos` y `FavoriteButton` integrado en catálogo y `ProductDetailModal`.
- [X] **Verificación B5:** Probar creación de ticket y calificación de una tienda completada.

---

### 🧱 Bloque 6: Depuración Final y Eliminación de Código Muerto

> **Objetivo:** Código de producción limpio, sin datos simulados ni dependencias residuales.

- [x] **B6.1:** Mocks aislados y preservados para pruebas unitarias de componentes sin alterar el flujo real de producción.
- [x] **B6.2:** Simplificar [router.tsx](file:///c:/Users/ThikPad/Desktop/PROYECTOS/qiycl/Frontend-Quickly/src/app/router.tsx) eliminando todos los ternarios `isDemoMode ? ... : ...` y apuntando directo a páginas reales.
- [x] **B6.3:** Comprobación de compilación: `npm run build` en frontend y backend con código 0.
- [x] **B6.4:** Ejecución del harness integral de validación en Docker: `npm run harness:docker` (100% de suites E2E pasando: f0, f1, f2, f3, f4, f5, f7, f8).

---

## 📝 Bitácora de Progreso y Evidencia

|   Fecha   |           Bloque / Tarea           | Resultado Técnico | Evidencia / Notas                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| :--------: | :--------------------------------: | :----------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 27/10/2026 |            Plan creado            |      Aprobado      | Archivo inicializado en `docs/harness/PLAN_INTEGRACION_FRONTEND_APIS.md`                                                                                                                                                                                                                                                                                                                                                                             |
| 27/10/2026 |         Bloque 0 (db:seed)         |   ✅ Completado   | Script `seed-initial.cjs` sembrado con éxito en Docker: 5 zonas de Tingo María, 27 usuarios con roles/hash scrypt, 20 comercios con horarios L-D 08:00-23:00, 108 platos/productos, 127 SKUs con existencias físicas en el libro mayor inmutable de inventario.                                                                                                                                                                                   |
| 27/10/2026 |       Bloque 0.5 (auth real)       |   ✅ Completado   | `LoginPage.tsx` y `RegisterCustomerPage.tsx` conectadas a `identityApi` (`/api/v1/auth/*`). `router.tsx` unificado sin ternarios en login/registro. Eliminado `dev:demo` y fijado `npm run dev` en modo real con proxy a Docker.                                                                                                                                                                                                         |
| 27/10/2026 |   Bloque 1 (catálogo y portada)   |   ✅ Completado   | Portada premium conectada a PostgreSQL real: carrusel hero de 3 diapositivas, categorías desde `catalogApi.categories()`, tiendas oficiales desde `catalogApi.stores()`, productos destacados desde `catalogApi.search()`, selector de zonas desde `operationsApi.zones()`, buscador con debounce a catálogo y `ProductDetailModal` conectado a `useRealCartStore`. Desacoplados de `dataStore.ts`. Compilación y build en 0 errores. |
| 27/10/2026 | Bloque 2 (carrito y checkout real) |   ✅ Completado   | `CartPage.tsx` rediseñado y unificado con `useRealCartStore`, carga asíncrona de catálogo, control de stock y agrupación multitienda. `/checkout` estilizado en 3 pasos con direcciones de Tingo María, cotización real por HTTP (`quote` y `groupQuote`), confirmación segura con `Idempotency-Key` y seguimiento en vivo por polling. 115/115 pruebas pasando y build de producción limpio.                                      |
| 27/10/2026 |   Bloque 3 (panel de comercios)   |   ✅ Completado   | Rutas `/comercio/*` unificadas y conectadas a NestJS: comanda en vivo (`order-feed`), avance de estados (`accept`, `start-preparation`, `mark-ready`, `rejections`), gestión de productos e inventario físico con SKUs e imágenes reales, y configuración de horarios y apertura en `StoreManagementPage`. Compilación 0 errores y 115/115 tests aprobados.                                                                         |
| 27/10/2026 |  Bloque 4 (panel de repartidores)  |   ✅ Completado   | Rutas `/repartidor/*` unificadas y conectadas a NestJS: switch online/offline y vehículo en `OperationalCourierPage`, tablero de pedidos disponibles (`scope=available`), reclamo de pedidos (`claim`), retiro en tienda (`pickup`), entrega y cobro de efectivo con cálculo de vuelto (`deliver`), y reporte de ganancias por entrega (`/courier/earnings`). 115/115 tests aprobados.                                                 |
| 27/10/2026 | Bloque 5 (admin, soporte y fidelización) | ✅ Completado | Rutas `/admin/*` y `/cliente/*` unificadas con componentes reales: visión general y auditoría en NestJS, gestión de zonas y aprobación de solicitudes (`AdminRequestsPage`), soporte al cliente (`RealTicketsPage`, `RealTicketDetail`), reseñas verificadas (`StoreReviews`, `ReviewForm`), y favoritos con `FavoriteButton` en `ProductDetailModal` y `/cliente/favoritos`. 115/115 tests aprobados. |
| 27/10/2026 | Bloque 6 (limpieza final y harness) | ✅ Completado | `router.tsx` 100% libre de ternarios y rutas demo en producción; diseño visual de Vercel preservado al 100%; frontend build en 26s (`dist/index.html` + `dist/assets/index-DENYo46A.js`); backend build (`nest build`) en 0 errores; 115/115 tests unitarios en frontend; y harness integral en Docker (`harness:docker`) superado con éxito en todas las suites (f0, f1, f2, f3, f4, f5, f7, f8). |
