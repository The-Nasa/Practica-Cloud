# Estado de implementación

## Portada del prototipo: etapas 1 y 2 verificadas localmente; carga pendiente

Se retoma `PLAN_PORTADA_Y_CARGA_CATALOGO.md`, etapas 1 y 2: `HomePage.tsx` conserva carrusel, imágenes y composición del prototipo, con categorías/productos/SKU, comercios, favoritos, carrito y cobertura reales. Mapa y ajustes de capacidades en [MAPEO_PORTADA.md](MAPEO_PORTADA.md). Consultas con carga/vacío/error/reintento separados; encabezado y navegación móvil conectados a sesión/roles y carrito de intención real. El modo demo queda aislado en `DemoHomePage.tsx`; se conservan sus consumidores. `CatalogLanding.tsx` sigue sin integrar.

`node scripts/check-workspace.cjs` aprobado, código 0, 357,0 s: contratos/compilaciones y 242 pruebas (11 unitarias backend, 102 API/PostgreSQL, 115 frontend, 14 navegador). Incluye búsqueda del encabezado, filtros, paginación, SKU/cantidad, agotados, favoritos producto/comercio, carrito, carga/vacío/error/reintento y regresión de compra única/multitienda. Revisión visual a 390/768/1440 px, sin scroll horizontal; capturas y límites en [EVIDENCIA_PORTADA.md](EVIDENCIA_PORTADA.md). DB temporales eliminadas y `postgres-test` detenido.

No se cargaron datos en desarrollo. Etapas 3/4 esperan elegir demostración separada o datos reales; el plan completo todavía no se declara terminado. Los pendientes de F6, ampliaciones F7 y seguridad/lanzamiento F8 conservan su estado. Los commits previos de F6/F7/F8 fueron subidos por instrucción del usuario; esta adaptación aún no tiene commits ni push.

## F8: preparación operativa local; piloto y seguridad pendientes

Implementados controles de producción, liveness/readiness, límites de DB, logs sanitizados, monitoreo administrativo, respaldo/restauración conjunta de PostgreSQL/imágenes y staging Docker separado con HTTPS y rol runtime sin privilegios administrativos. Ensayo HTTPS local aprobado; `node scripts/check-workspace.cjs`, código 0, 240 pruebas aprobadas (11 unitarias backend, 102 API/PostgreSQL, 115 frontend y 12 navegador), contratos/compilaciones. Evidencia en [EVIDENCIA_F8.md](EVIDENCIA_F8.md). Manual: [OPERACION_F8.md](OPERACION_F8.md), [CHECKLIST_PILOTO_F8.md](CHECKLIST_PILOTO_F8.md), [SEGURIDAD_F8.md](SEGURIDAD_F8.md). Decisión D18.

F8 no se declara completa: faltan servidor/dominio/certificado públicos, cierre de hallazgos de dependencias que requieren migraciones mayores, política de efectivo/comisiones, copias externas/programación/RPO/RTO, alertas externas/responsables y piloto real. No se ejecutó despliegue ni se publicaron cambios. Pasarela F6 y demás ampliaciones F7 continúan pendientes.

## F7: multitienda completada localmente; demás ampliaciones pendientes

Alcance solicitado: solo multitienda. Google, GPS, promociones, carrito remoto y liquidaciones quedan pendientes. F6 digital queda pendiente por decisión del usuario hasta elegir proveedor. Implementada confirmación atómica agrupada con compra/envío/cobro independientes por tienda, carrito con selección múltiple y resumen del comprador. Reglas en [OPERACION_F7.md](OPERACION_F7.md), decisión D17. Evidencia en [EVIDENCIA_F7.md](EVIDENCIA_F7.md); no declarar F8/piloto ni las otras ampliaciones implementadas.

Cierre por bloques aprobado: 229 pruebas distintas (7 unitarias backend, 95 HTTP/PostgreSQL, 115 frontend y 12 navegador), contratos/compilaciones. El intento raíz aprobó backend/frontend y detectó una espera incorrecta en el nuevo test web; se corrigió solo esa espera y se completó `npm run harness:browser`, código 0, 12/12. No se atribuye código 0 al intento raíz fallido. Migración 006 aplicada con `npm run dev:db`; verificación SQL con rollback aprobada. Baseline/migraciones anteriores intactos, sin fixtures de negocio en desarrollo; DB de prueba eliminadas y `postgres-test` detenido. Sin commits/pushes/despliegue.

## F6 pendiente por decisión del usuario: base de consulta implementada

Revisados F0–F5 y repositorios limpios antes de comenzar. Se añade módulo `billing` con catálogo de métodos/disponibilidad e historial paginado de pagos/reembolsos de compra propia; no habilita digital ni cambia efectivo. El resto de F6 depende de elegir proveedor/métodos y configurar sandbox. Alcance, puntos de coordinación y matriz de aceptación en [OPERACION_F6.md](OPERACION_F6.md). F6 no se declara completada.

Validación de este bloque: backend compilado/OpenAPI exportado, tipos frontend sincronizados y compilación frontend aprobada. Suite dirigida `node scripts/harness-docker.cjs --suite=f6`, código 0, 5/5 pruebas API/PostgreSQL; DB temporal eliminada y contenedor de pruebas detenido. Docker Desktop estaba detenido y se inició. Primer intento detectó teléfono repetido en fixtures de registro; corregido con valores únicos y suite repetida satisfactoriamente. Sin nuevas migraciones, fixtures en desarrollo, commits ni pushes. No se ejecutó cierre integral de fase porque sandbox/proveedor y el resto de F6 siguen pendientes.

## F5 completada localmente

F5 integra favoritos/reseñas, soporte conversacional e incidencias vinculadas, worker de notificaciones/outbox, auditoría y reportes/tarifas reales con exportación. Cierre por bloques: compilaciones, contratos y 210 pruebas distintas aprobadas (7 unitarias backend, 81 escenarios API/PostgreSQL, 111 frontend y 11 recorridos web). El intento integral detectó inventario antiguo de tablas; corregido, se completaron sus bloques restantes. Se precisaron selectores web y solo se repitió el bloque/recorrido afectado, conservando evidencia vigente de los aprobados. Evidencia y límites: [EVIDENCIA_F5.md](EVIDENCIA_F5.md), [OPERACION_F5.md](OPERACION_F5.md). F6/F8 siguen pendientes.

Migración `005_f5_engagement.sql` aplicada con `npm run dev:db`, código 0; desarrollo saludable, sin fixtures de negocio. DB temporales eliminadas y `postgres-test` detenido al finalizar. Log automático de próximos cierres en `.tmp/workspace-check.log`; soporte `--keep-db` para bloques de desarrollo. Sin commits ni descarte de trabajo previo.

F4 implementada e integrada: carrito/cotización/checkout real, recuperación idempotente, pedidos de cliente/comercio/administración y reparto con efectivo confirmado. Validación de cierre: 199 pruebas aprobadas (7 unitarias backend, 74 escenarios API/PostgreSQL, 107 frontend y 11 recorridos de navegador), compilaciones y contratos sincronizados. El harness detectó un tipo literal incorrecto en un fixture frontend; corregido, se completaron sus bloques restantes con `npm run build`, `npm test` y backend `npm run harness:browser`, todos con código 0, conservando los resultados backend aprobados sin cambios posteriores en ese código. Ver [EVIDENCIA_F4.md](EVIDENCIA_F4.md) y [OPERACION_F4.md](OPERACION_F4.md).

Migración aditiva `004_f4_cash_delivery.sql` aplicada en desarrollo con `npm run dev:db`, código 0. PostgreSQL de desarrollo saludable; DB temporales eliminadas y contenedor de pruebas detenido. No se cargaron fixtures de negocio en desarrollo ni se hicieron commits.

Objetivo alcanzado en F3: catálogo público y gestión comercial reales, producto/SKU con precios absolutos, archivo lógico, categorías, filtros/paginación, imágenes de producto, avatar privado, logo/banner de comercio, movimientos de inventario y vencimiento de aceptación coordinado con pedido/pago/reservas. Migraciones aditivas `002_f3_catalog_inventory.sql` y `003_f3_pending_order_expiration.sql`; baseline y migraciones aplicadas intactos. Evidencia y límites en [EVIDENCIA_F3.md](EVIDENCIA_F3.md), decisiones D13/D14 y [OPERACION_F3.md](OPERACION_F3.md).

Validación final de F3: `node scripts/check-workspace.cjs`, código 0; compilaciones/contratos y 181 pruebas aprobadas (7 unitarias backend, 64 escenarios de integración API/PostgreSQL, 100 frontend y 10 recorridos de navegador real). DB y archivos de pruebas aislados, eliminados al finalizar; contenedor de pruebas detenido. `npm run dev:db`, código 0: migración 003 aplicada en desarrollo y PostgreSQL saludable, sin cargar fixtures de negocio. `docker compose config --quiet` y diffs de ambos repositorios aprobados.

Objetivo alcanzado en F2: solicitudes y habilitación de comercio/reparto, administración inicial, membresías, horarios, zonas y direcciones conectados entre frontend, API y PostgreSQL Docker.

Estado: F0–F5 completadas en desarrollo local con PostgreSQL Docker. Evidencia actual en [EVIDENCIA_F5.md](EVIDENCIA_F5.md); antecedentes en [EVIDENCIA_F4.md](EVIDENCIA_F4.md), [EVIDENCIA_F3.md](EVIDENCIA_F3.md), [EVIDENCIA_F2.md](EVIDENCIA_F2.md), [EVIDENCIA_F1.md](EVIDENCIA_F1.md) y [EVIDENCIA_F0.md](EVIDENCIA_F0.md). La validación de despliegue HTTPS/staging, multiinstancia y restauración sigue pendiente antes del piloto.

## Seguimiento por fases

| Fase | Estado | Criterio de cierre |
| --- | --- | --- |
| F0 | Completada con Docker | Compilación, SQL, inventario de desarrollo, conexión API y 17 pruebas aprobados |
| F1 | Completada localmente | Registro/login/logout/recarga/perfil reales; cookie/CSRF, roles, contrato y 120 pruebas aprobados |
| F2 | Completada localmente | Solicitudes/aprobaciones, perfiles, miembros, zonas, direcciones, horarios, bootstrap admin y harness integral aprobados |
| F3 | Completada localmente | Catálogo/SKU, archivos de producto/perfil/comercio, inventario y aceptación con plazo integrados; harness integral aprobado |
| F4 | Completada localmente | Compra a entrega real en efectivo entre cuatro roles; recuperación idempotente, versiones, permisos y cobro atómico verificados |
| F5 | Completada localmente | Soporte/incidencias, favoritos, reseñas, notificaciones/outbox, auditoría y reportes/tarifas/exportación reales; cierre por bloques aprobado |
| F6 | Pendiente por decisión del usuario; base de consulta disponible | Elegir pasarela antes de cobro/reembolso sandbox |
| F7 | Multitienda completada localmente; resto pendiente | Checkout agrupado atómico, entregas/cobros independientes y cierre por bloques aprobados |
| F8 | Preparación local implementada; piloto pendiente | Cerrar seguridad/infraestructura/operación pública y ejecutar piloto |

## Hallazgos iniciales

- El backend ya implementa rutas, pero varias consultas no coinciden con columnas del baseline.
- No había suite backend implementada aunque package.json declaraba comandos Jest.
- Se instalaron las dependencias del lockfile del backend con `npm ci --no-audit --no-fund`.
- Inicialmente Docker Desktop estaba detenido; posteriormente se inició para preparar el entorno elegido por el usuario.
- Inicialmente no existía `.env`; ahora `dev:setup` lo generó con credenciales locales aleatorias y Git confirma que está ignorado.

## Evidencia final (26 de octubre de 2026)

- `npm run harness:check` sobre PostgreSQL 17.4, cluster propio en `127.0.0.1:15432`: compilación aprobada, 2 pruebas unitarias y 15 escenarios HTTP aprobados.
- Baseline instalado con 41 tablas/5 vistas y `002_verificar.sql` aprobado; base aleatoria eliminada por el runner.
- El puerto 55432 está reservado por Windows; se adoptó 15432 configurable sin cambiar reservas del sistema.
- `npm run db:inspect` ya permite inventario real en transacción de solo lectura. Se requiere una DATABASE_URL válida en `.env`; no publicar credenciales ni enviarlas por chat.
- Ejecución final del harness: código 0, 2/2 unitarias, 15/15 HTTP y SQL aprobado. `git -C backend diff --check`: código 0.
- No se modificó `001_schema.sql` ni `002_verificar.sql`; no se cambiaron archivos funcionales del frontend.
- CI preparada en backend; no ejecutada remotamente en esta sesión.

## Cierre con Docker (26 de octubre de 2026)

- El usuario aclaró que no tenía una DB de Quickly configurada y quería usar Docker.
- Docker Desktop iniciado. Creado `quickly-postgres` con PostgreSQL 17.11 y volumen persistente `quickly-postgres-data`.
- Conexión de desarrollo: `127.0.0.1:5433`, base `quickly_db`, usuario `quickly_user`; contraseña en `.env`. Puerto 5432 de Windows intacto.
- `npm run db:verify`: aprobado, fixtures revertidos. Inventario read-only: 41 tablas y 5 vistas. Archivo local ignorado en `.tmp/quickly-docker-inventory.json`.
- API NestJS iniciada temporalmente contra la DB Docker: `GET /api/v1/health` respondió 200, `status=ok`, `database=connected`; aplicación cerrada al terminar la comprobación.
- DB de desarrollo sin usuarios ni compras: las pruebas no sembraron datos de negocio.
- `npm run harness:docker`: código 0, compilación y SQL aprobados, 2/2 unitarias y 15/15 HTTP. DB aleatoria eliminada y contenedor de pruebas detenido.
- Contenedor de desarrollo queda activo y saludable; API todavía se inicia con `npm run start:dev`.

## Próximo paso

1. Continuar el cierre F8: migraciones mayores de seguridad, infraestructura pública, decisiones de efectivo y ensayo/piloto conforme al checklist. F6 digital queda aplazada hasta elegir proveedor; demás ampliaciones F7 pendientes. Al retomar F6 conservar compras/cobros por tienda, coordinar consumidores de eventos y verificar sandbox/webhooks/conciliación/reembolsos externos.
2. Mantener `node scripts/check-workspace.cjs` como cierre por fase, o backend `npm run harness:full`. Actualizar OpenAPI/tipos al cambiar contratos.
3. Para trabajar: backend `npm run dev:db` y `npm run start:dev`; frontend `npm run dev` en `http://localhost:5173`. Prototipo explícito: frontend `npm run dev:demo`, puerto 5175.
4. No crear cuentas de prueba sobre desarrollo para validar fases: el harness genera DB independientes y limpia sus servidores al terminar.

Decisiones aún abiertas antes del piloto: tarifa/ganancia de reparto, custodia/traspasos/liquidación de efectivo, plazos de preparación/resolución posteriores a aceptación, ratificación operativa del plazo de aceptación configurable de 15 minutos, topología final y proveedor digital. Ver DECISIONES.md y el plan global.

## Cierre F1 (26 de octubre de 2026)

- Cookie opaca HttpOnly/SameSite=Lax, opción Secure para HTTPS, CSRF vinculado a sesión, validación de Origin y límite inicial de login/registro.
- Nuevos `GET /auth/session` y `PATCH /me`; login/registro ya no devuelven la credencial. Roles y membresías se obtienen del servidor; cambio de contexto no concede permisos.
- OpenAPI exportado, tipos generados en frontend, validación Zod y comprobaciones de sincronización en harness/CI.
- Cliente con cookies, errores comunes, timeout/cancelación, control de respuestas de sesiones anteriores y manejo diferenciado de 401/403.
- Identidad real solo en memoria; invalidación y sincronización de cierre entre pestañas. El prototipo queda en modo demo explícito.
- E2E real sobre API/Vite temporales (3001/5174) y DB aleatoria, con comprobación de móvil y storage manipulado.
- Comando final `node scripts/check-workspace.cjs`: código 0. Servidores de pruebas y DB temporales eliminados/detenidos; DB de desarrollo sigue separada.

