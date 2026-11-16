# Criterios de salida F8 y piloto

F8 no está completa hasta verificar los puntos de operación pública y el piloto. Este checklist conserva responsables/decisiones pendientes sin inventar aprobación ni ejecutar publicaciones.

| Criterio | Estado al preparar F8 |
| --- | --- |
| Regresión funcional y permisos de cuatro roles, compra única/multitienda | Cierre local código 0: 240 pruebas; ver EVIDENCIA_F8.md |
| Backup conjunto y restauración aislada con operación posterior | Ensayo local implementado; no equivale a recuperación a escala real |
| Sesiones restauradas revocadas | Implementado y probado en restauración |
| HTTPS, proxy, cookies, CSP y persistencia de objetos | Ensayo local aprobado sobre imágenes Docker; certificado público pendiente |
| Servidor, dominio, DNS, TLS público y revisiones/digests de release | Pendientes de definir/verificar |
| Dependencias sin hallazgos altos/críticos pendientes de resolver | Pendiente; auditoría encontró vulnerabilidades que exigen revisión/migración mayor |
| Capacidad/carga en hardware de destino, límites y objetivos acordados | Solo prueba acotada local; dimensionamiento pendiente |
| Monitor externo, alertas y responsable de guardia/escalamiento | Panel/avisos internos implementados; canal externo y responsable pendientes |
| Copias cifradas fuera del host, frecuencia, retención y restauración periódica | Herramienta/manual preparados; configuración y ensayo en destino pendientes |
| RPO/RTO aceptados y medidos con datos representativos | Pendientes |
| Política de efectivo: quién cobra/custodia/rinde y evidencia de traspaso | Pendiente de decisión de negocio |
| Tarifa/comisión y horarios de conciliación/rendición | Pendientes de ratificar; no usar 80% provisional como acuerdo firmado |
| Responsables de tienda/reparto/soporte e incidencias después del retiro | Pendientes de nombrar y ensayar |
| Piloto con participantes, zona, horario y límites de pedidos acordados | Pendiente de organizar y ejecutar |
| Informe de resultados y correcciones del piloto | Pendiente |

Secuencia del piloto una vez cerrados los pendientes: cuentas reales autorizadas en staging, productos/stock de control, compra única y multitienda, aceptación/preparación, asignación/retiro/entrega, cobro y conciliación manual documentada, cancelación/rechazo permitidos e incidencia coordinada. Verificar notificaciones/reportes/auditoría contra el conjunto controlado y registrar defectos. Repetir únicamente escenarios afectados tras corregirlos.

Google, GPS, promociones, carrito remoto, liquidaciones automatizadas y pasarela digital permanecen fuera del alcance actual. No activar sus botones ni presentarlos como implementados para aprobar el piloto con efectivo.
