# F5 — evidencia

26 de octubre de 2026. F5 completada y verificada localmente.

Favoritos por tienda/producto, reseñas de compra entregada, soporte conversacional, incidencia-ticket atómicos, notificaciones internas con outbox concurrente/reintentos/deduplicación, auditoría consultable, reportes y tarifas reales con exportación. Contratos y límites en [OPERACION_F5.md](OPERACION_F5.md).

Evidencia recogida:

- Backend compilado y OpenAPI exportado/sincronizado; tipos frontend aprobados.
- Suite específica F5: 7 escenarios aprobados en PostgreSQL aislado, incluyendo rollback/backoff del consumidor y totales contrastados con SQL.
- Regresiones API: 81 escenarios aprobados (23 F0/F1, 12 F2, 29 F3, 10 F4, 7 F5). DB aleatorias eliminadas.
- El primer intento de cierre integral detectó inventario esperado antiguo (43 tablas); migración 005 agrega una tabla y el inventario correcto es 44. Se actualizó la expectativa sin debilitar permisos/stock ni alterar baseline.
- Navegador detectó un selector de prueba ambiguo entre avisos de guardado y carga del perfil; se precisó el mensaje esperado y se repite solamente el bloque web.

## Cierre por bloques

- `node scripts/check-workspace.cjs`: compilación backend, contrato OpenAPI y 7 unitarias aprobados; se detuvo por expectativa antigua del inventario de tablas. El comando integral no tuvo una única ejecución exitosa.
- `node backend/test/run-e2e.cjs`: código 0 tras actualizar inventario a 44; 81 escenarios API/PostgreSQL aprobados. Log `.tmp/f5-api-closure.log`.
- Frontend `npm run build` y `npm test`: código 0, producción Vite/TypeScript y 111 pruebas en 23 archivos aprobados. Log `.tmp/f5-frontend-closure.log`.
- Navegador: 10 recorridos previos aprobados en `.tmp/f5-browser-closure-retry.log`. Se detuvo el worker del recorrido nuevo que esperaba una etiqueta de prueba ya corregida, conservando esos 10 resultados; el proceso salió con código 1, no se presenta como aprobado completo. También se ajustó el selector del desplegable Estado a su nombre accesible.
- `node backend/test/run-e2e.cjs --browser --spec=purchase.spec.ts`: código 0 final; recorrido F4/F5 de cuatro sesiones aprobado, 35.8 segundos de escenario. Incluye recuperación de compra sin duplicado, entrega/cobro, reseña pública, favoritos persistentes tras recarga, soporte cliente/administrador con resolución sin modificar cobro, ventas de comercio, tarifa de reparto, exportación CSV, auditoría y pantalla de notificaciones. Log `.tmp/f5-purchase-final.log`.

Total de casos distintos aprobados: **210** = 7 unitarias backend + 81 API/PostgreSQL + 111 frontend + 11 navegador (10 anteriores y 1 ampliado). No se cuentan las repeticiones como casos nuevos. Avisos con eventos y recuperación del consumidor se verifican en integración; el navegador mantiene worker automático deshabilitado y verifica también estado vacío.

Revisión visual a 390 px de `.tmp/f5-notifications-mobile.png`: navegación, contador, lectura masiva y estado vacío legibles; el recorrido comprueba ausencia de desbordamiento en detalle entregado. `git diff --check` de ambos repositorios sin errores. Scripts de harness comprobados con `node --check`; el cierre raíz queda preparado para guardar automáticamente próximos logs/código/duración en `.tmp/workspace-check.log`, y admite `--keep-db`.

`npm run dev:db`: código 0, migración 005 aplicada sin sobrescribir configuración ni cargar fixtures. Desarrollo saludable en 5433. DB aleatorias eliminadas; servicio `postgres-test` detenido con código 0 al terminar. Baseline y migraciones anteriores intactos; sin commits ni descarte de trabajo previo.

F6 sigue pendiente de proveedor y pagos digitales; correo/push y preferencias por canales requieren proveedor según M10. F8 conserva staging/HTTPS, carga, multiinstancia, restauración y piloto. Custodia/liquidación del efectivo y tarifa final siguen como decisiones antes del piloto. Reportes/tarifas no se presentan como contabilidad ni liquidación financiera.
