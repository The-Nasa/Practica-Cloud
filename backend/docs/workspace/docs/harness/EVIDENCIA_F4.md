# F4 — compra a entrega con efectivo

Fecha: 26 de octubre de 2026. F4 completada y verificada localmente con PostgreSQL Docker.

## Alcance

Carrito real separado del prototipo, cotización remota, efectivo previsto/cambio calculados por servidor, compra idempotente con total revisado, recuperación tras respuesta perdida/recarga y limpieza selectiva de ítems comprados. No se importan hechos de negocio desde localStorage ni se cae a mocks ante error HTTP.

Pedidos y detalle/timeline para cliente, tienda y administración; versiones esperadas obligatorias; aceptación/preparación/listo, cancelación/rechazo con motivo y efectos atómicos en reserva/pago/auditoría/outbox. Lectura por recurso además del rol. Snapshots de producto y dirección conservados.

Disponibles/activa/historial para reparto; cobertura por zona; una entrega activa por repartidor; destino visible solo tras asignación autorizada y oculto al finalizar. Asignación manual administrativa y liberación/reasignación antes de retiro con motivo. Incidencia operativa registrada sin marcar entrega ni revertir stock después de retiro.

Retiro consume una vez. Entrega exige importe de efectivo recibido, cubre total y registra estado/cobro/cobrador/fecha/auditoría/outbox en una transacción. Migración aditiva `004_f4_cash_delivery.sql` para efectivo previsto/recibido y versión de asignación. Importes históricos no se reconstruyen.

Contratos, operación y límites: [OPERACION_F4.md](OPERACION_F4.md). Política D15; se mantiene comisión provisional de desarrollo D06 y plazo de aceptación D14. No se declara implementada una liquidación ni pago digital.

## Evidencia específica durante desarrollo

- `npm run test:f4`: código 0 antes de endurecer obligatoriedad del contrato de versión; 9 escenarios sobre PostgreSQL aislado, incluyendo cotización sin reserva, cobertura, permisos, snapshot, rechazo, recorrido completo, asignación y rollback de compra/entrega ante fallo de outbox.
- `npm test -- src/test/realShopping.test.ts`: código 0, 7 pruebas. Selección por tienda sin borrar otros ítems, limpieza por revisión de intención, ausencia de precios/identidad persistidos como hechos, importes, clave idempotente, contrato inválido y confirmación local dañada.
- `npm run test:f4:browser`: código 0 en recorrido específico de cuatro sesiones. Se abortó la respuesta HTTP después de confirmar compra en servidor; tras recarga se recuperó el pedido con una sola creación y se conservaron productos no comprados. Comercio preparó, repartidor retiró/entregó/cobró, y cliente/administración consultaron la entrega real.

La versión final obliga `expectedVersion` en las acciones y agrega una verificación negativa de omisión. Los fixtures de regresión envían las versiones establecidas por sus recorridos; no se alteran datos operativos ni se omiten pruebas de permisos/stock.

## Cierre final

`node scripts/check-workspace.cjs` aprobó compilación backend, contrato OpenAPI, 7 unitarias y 74 escenarios API/PostgreSQL (23 F0/F1, 12 F2, 29 F3, 10 F4), instalación y verificación SQL, migraciones y comprobación de sincronización frontend. Se detuvo al compilar un fixture de prueba que infería `paymentMethod` como `string`; se corrigió a literal `cash` sin cambiar código backend.

Se completaron los bloques restantes del cierre sin repetir el backend ya aprobado:

- Frontend `npm run build`: código 0, TypeScript y producción Vite aprobados.
- Frontend `npm test`: código 0, 22 archivos y 107 pruebas aprobados.
- Backend `npm run harness:browser`: código 0, 11 recorridos reales aprobados sobre DB aislada. Incluye el recorrido F4 con cuatro sesiones, respuesta perdida después de guardar, recuperación sin duplicado, nota persistida, conservación de ítems no comprados, preparación, retiro, validación de efectivo insuficiente y entrega/cobro consultados por cliente y administración.

Total: **199 pruebas aprobadas**. El comando integral inicial tuvo código 1 por el fixture; no se presenta como una ejecución única exitosa. Los bloques de cierre restantes aprobaron después de la corrección. Logs locales ignorados: `.tmp/f4-closure.log` y `.tmp/f4-browser-closure.log`.

Revisión visual de `.tmp/f4-delivered-mobile.png`: pedido entregado, importes/cambio, detalle y timeline legibles a 390 px. Contratos generados y sincronizados; `git diff --check` de ambos repositorios sin errores.

`npm run dev:db`: código 0, migración 004 aplicada en desarrollo sin sobrescribir `.env`, eliminar volúmenes ni cargar fixtures de negocio. DB de pruebas eliminada al finalizar y servicio `postgres-test` detenido; desarrollo continúa saludable en 5433. Baseline y migraciones anteriores intactos. No se hicieron commits ni se descartó trabajo previo.

F5 conserva soporte/resolución de incidencias, favoritos, reseñas, worker de notificaciones/outbox, paneles de auditoría, reportes y ganancias. F6 conserva pago digital. Staging/HTTPS, carga, multiinstancia, restauración y piloto conservan F8. Custodia y liquidación de efectivo, tarifa operativa y plazos posteriores a aceptación requieren definición antes del piloto; el cobro implementado no representa una liquidación financiera.
