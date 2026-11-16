# Evidencia F7: iniciativa multitienda

Estado: multitienda implementada y verificada localmente. F7 conserva las demás iniciativas pendientes por elección del usuario. F6 digital/pasarela también pendiente; F8/piloto conserva su validación propia.

## Resultado funcional

- Carrito real selecciona y conserva SKU de varias tiendas tras recargar; permite desmarcar productos sin alterar otras tiendas.
- Checkout muestra productos, envío e importe por tienda y total general. Una dirección con cobertura válida para todas; hasta 10 tiendas/100 líneas. Efectivo exacto previsto por entrega en multitienda; compra única conserva su flujo con cambio.
- Una confirmación crea un grupo con compras, pedidos, reservas, pagos pendientes, eventos y auditoría/outbox de todas las tiendas dentro de una misma transacción.
- Si una tienda falla por cobertura, horario, mínimo, stock o precio obsoleto, no se confirma ninguna. Fallo de auditoría también revierte todas las escrituras.
- Idempotencia serializa confirmaciones concurrentes y conserva resultado; recuperación tras timeout/recarga devuelve estados actuales sin repetir compras.
- Cada pedido se acepta, cancela/rechaza, vence, asigna, retira, entrega y cobra por separado. La tienda accede solo a sus pedidos; el resumen completo pertenece exclusivamente al comprador.
- Resumen `/cliente/compras/:id` enlazado desde los pedidos del comprador, con desglose y actualización. No se promete una entrega conjunta ni se divide ficticiamente un billete entre repartidores.

Reglas y API en [OPERACION_F7.md](OPERACION_F7.md); decisión D17 en [DECISIONES.md](DECISIONES.md).

## Persistencia y contratos

Migración aditiva `006_f7_multistore_checkout.sql`: grupo inmutable y referencia opcional en compras. Se asigna grupo al insertar, respetando la inmutabilidad del baseline. Las compras anteriores siguen funcionando sin grupo; restricciones financieras de F4 permanecen intactas. Inventario resultante: 45 tablas/5 vistas.

`npm run dev:db` aplicó migración 006 en PostgreSQL Docker de desarrollo, código 0. `npm run db:verify` aprobó restricciones y vistas con fixtures revertidos. No se cargaron fixtures de negocio ni se eliminaron datos de desarrollo. Baseline y migraciones 001–005 sin cambios.

OpenAPI exportado y tipos frontend generados/sincronizados. Compilaciones backend y frontend aprobadas. No hay dependencias nuevas ni pasarela simulada presentada como real.

## Cierre por bloques: 229 pruebas distintas aprobadas

| Bloque | Resultado |
| --- | --- |
| Unitarias backend | 7/7 |
| API/PostgreSQL F0/F1 | 23/23 |
| API/PostgreSQL F2 | 12/12 |
| API/PostgreSQL F3 | 29/29 |
| API/PostgreSQL F4 | 10/10 |
| API/PostgreSQL F5 | 7/7 |
| Base de consulta F6 | 5/5; no acredita pasarela |
| API/PostgreSQL F7 | 9/9 |
| Frontend | 115/115 en 23 archivos |
| Navegador real | 12/12, incluido nuevo recorrido multitienda |

Comando raíz `node scripts/check-workspace.cjs` aprobó contratos, compilaciones y todas las suites backend/frontend. En navegador se detuvo por una aserción del nuevo test que contaba casillas antes de la carga HTTP del carrito. Se corrigió a espera de locator `toHaveCount(2)` tanto al entrar como al recargar; sin cambios posteriores en código funcional aprobado. Se completó el bloque entero con backend `npm run harness:browser`, código 0, 12/12. El log del intento raíz conserva código 1; este cierre es por bloques con evidencia vigente, conforme a D16, no una ejecución única integral con código 0.

Durante desarrollo se corrigió la asociación de grupos para realizarse en INSERT y no actualizar compras históricas inmutables. El fixture de vencimiento se ajustó con creación anterior al plazo para respetar el CHECK SQL. Estas correcciones fueron verificadas por las suites finales.

Las DB y objetos de pruebas fueron aislados y eliminados por el runner; `postgres-test` detenido al terminar. PostgreSQL de desarrollo saludable. Diffs verificados. No se hicieron commits, pushes, merges ni despliegues en este trabajo.

## Pendientes explícitos

Google, GPS, promociones/cupones, carrito remoto y liquidaciones automatizadas. Pasarela F6, webhooks, conciliación y reembolsos digitales externos. Optimización de reparto conjunto y pagos globales no son parte de multitienda con entregas independientes. Staging HTTPS, restauración, carga y piloto continúan en F8.
