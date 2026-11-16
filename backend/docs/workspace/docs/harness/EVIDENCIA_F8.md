# Evidencia F8: preparación local, piloto pendiente

Estado: preparación operativa implementada y verificada localmente. F8 no se declara completa ni lista para publicar: infraestructura/certificado públicos, correcciones mayores de dependencias, reglas de efectivo, copias/alertas externas y piloto siguen pendientes. Ver [checklist](CHECKLIST_PILOTO_F8.md) y [seguridad](SEGURIDAD_F8.md).

## Resultado implementado

- Producción exige orígenes HTTPS exactos y cookie Secure; confianza de proxy limitada a 0 o 1 salto según topología. Sin `X-Powered-By`; cabeceras de protección y logs de request ID/ruta patrón/estado/latencia sin cuerpos, queries, cookies ni referencias personales.
- Liveness independiente y readiness de PostgreSQL separados; límites de pool, conexión, consulta e inactividad transaccional aplicados también con DATABASE_URL. Shutdown de API/pools/workers preparado.
- Monitoreo `/admin/operations` y pantalla `/admin/operacion`, privados al administrador y sin caché; avisos de retrasos/reintentos de outbox, vencimientos y espera de pool.
- Staging Docker separado con web compilada/Caddy, mismo origen `/api`, HTTPS, CSP, migraciones previas y rol de API `quickly_app` sin superusuario, creación de roles/DB ni DDL. DB/imágenes/certificados en volúmenes distintos de desarrollo. Credenciales de propietario y ejecución distintas, fuera de Git.
- Respaldo consistente DB+objetos mediante locks SHARE/snapshot exportado/pg_dump custom; checksums y manifiesto final. Restauración en DB aleatoria/directorio nuevo, verificación de referencias/migraciones, revocación de sesiones y auditoría de recuperación; nunca sobrescribir origen.
- Manual de operación, despliegue/reversión, restauración, incidentes, efectivo y criterios del piloto. No se activan copias externas/programación/alertas por escribir el manual.

## Cierre integral: código 0 y 240 pruebas

`node scripts/check-workspace.cjs` terminó con código 0 en 414,4 segundos. Log local ignorado por Git: `.tmp/workspace-check.log`.

| Bloque | Resultado |
| --- | --- |
| Unitarias backend | 11/11 |
| API/PostgreSQL F0/F1 | 23/23 |
| API/PostgreSQL F2 | 12/12 |
| API/PostgreSQL F3 | 29/29 |
| API/PostgreSQL F4 | 10/10 |
| API/PostgreSQL F5 | 7/7 |
| Consultas F6 | 5/5; sin acreditar pasarela |
| API/PostgreSQL F7 | 9/9 |
| API/PostgreSQL F8 | 7/7 |
| Frontend | 115/115 en 23 archivos |
| Navegador real HTTP de regresión | 12/12 |

Contratos OpenAPI/tipos sincronizados y compilaciones backend/frontend aprobadas con lockfiles instalados. Baseline y migraciones existentes preservados; F8 no agrega migración de negocio ni fixtures sobre desarrollo.

## Ensayos operativos específicos

- 60 lecturas reales API/SQL, concurrencia 10: p95 233 ms, máximo 249 ms en esta ejecución. Ráfaga de 10 confirmaciones con misma clave: una compra/reserva, respuestas idempotentes.
- Backup/restauración/lectura de avatar/nueva compra en DB restaurada: 5077 ms para el fixture pequeño con un objeto. No es un RTO de negocio ni prueba de capacidad real. La DB de origen conservó su conteo de compras.
- Alterar el dump produjo fallo de checksum antes de restaurar. Las sesiones previas dejaron de autorizar tras restaurar; login nuevo e imagen funcionaron. Directorios/DB aleatorios limpiados al terminar.
- Ensayo adicional `npm run test:staging`, código 0, con imágenes Docker compiladas y Chromium/Edge real sobre `https://localhost:18443`. Verificó rol DB restringido, registro desde web, cookie Secure/HttpOnly/SameSite=Lax, recarga, CSRF, SPA/proxy/CSP, bootstrap/panel, carga de imagen, reinicio API con sesión/imagen persistentes y logout 204 con sesión revocada.
- Ese ensayo usa CA local aceptada solo en su contexto Playwright y proyecto `quickly-f8-<aleatorio>`. Todos sus contenedores/volúmenes se eliminaron; no se tocó el volumen de desarrollo. No acredita DNS, certificado público ni un piloto.

Durante preparación se corrigieron build duplicado de una misma imagen de API, readiness TCP antes de migración para evitar el servidor temporal de initdb, tipo explícito del parámetro SQL de provisión de rol y aserción de logout conforme al contrato 204. Las verificaciones finales pasaron tras esas correcciones. La reinstalación de dependencias del frontend requirió reiniciar solo Vite/esbuild de este workspace por bloqueo de Windows; Vite quedó disponible nuevamente en localhost:5173.

## Seguridad y límites reales

Audit de producción residual, código 1: backend 11 paquetes afectados (5 altos/6 moderados), frontend 3 (1 alto/2 moderados). Se conservaron rangos mayores actuales y se aplicó el proceso de actualización compatible del lockfile; no se ejecutó una migración mayor automática de frameworks. Esos hallazgos requieren seguimiento/corrección antes de publicación, con nueva regresión. Herramientas de desarrollo también conservan avisos; no se exponen sus servidores públicamente.

Pendientes para cerrar F8: servidor/dominio/certificado reales, migraciones de dependencias y verificación de riesgo, monitor/alertas externas, copias cifradas fuera del host y retención programada, RPO/RTO representativos, política de custodia/rendición/conciliación de efectivo, tarifa/comisión ratificada, responsables y piloto con resultados/correcciones registrados. Pasarela F6 y ampliaciones F7 no solicitadas continúan pendientes.

No se hicieron commits, pushes, merges ni despliegues públicos. Los workflows están preparados, pero no se acreditan ejecuciones remotas de esta sesión.
