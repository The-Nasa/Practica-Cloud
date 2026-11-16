# F8: preparación operativa y piloto con efectivo

Estado: preparación local en ejecución. Un ensayo local no acredita staging público ni piloto con usuarios. F6 digital y ampliaciones F7 distintas de multitienda siguen pendientes por decisión del usuario.

## Entornos y publicación

Desarrollo conserva PostgreSQL Docker en 5433, `.env` y `.media` propios. `backend/deploy/compose.staging.yml` define otro proyecto con DB, migración previa, API sin puerto público y frontend compilado detrás de Caddy en el mismo origen. DB de staging solo publica loopback 25433 para administración local. Volúmenes de DB, imágenes y certificados separados de desarrollo.

1. Resolver primero los pendientes de seguridad y negocio de [CHECKLIST_PILOTO_F8.md](CHECKLIST_PILOTO_F8.md).
2. En el servidor elegido, disponer de ambos repositorios hermanos en revisiones verificadas, Node 22 para herramientas y Docker Compose. Conservar hashes de ambos commits y digests de imágenes por release; no publicar desde una rama que cambia durante el despliegue.
3. Copiar `backend/deploy/.env.staging.example` a `.env.staging`, generar secretos distintos de desarrollo y entre sí (`STAGING_DB_PASSWORD` y `STAGING_APP_PASSWORD`, al menos 32 caracteres aleatorios) y configurar `SITE_ADDRESS`/`SITE_ORIGIN` con el dominio HTTPS real. El archivo está ignorado por Git; no imprimir `docker compose config` sin `--quiet` porque resuelve secretos.
4. Desde backend, revisar `docker compose --env-file deploy/.env.staging -f deploy/compose.staging.yml config --quiet`, luego construir con `build api web`. `up -d --wait` inicia DB, aplica migraciones con el propietario, provisiona `quickly_app` sin superusuario/creación de DB/roles/DDL y solo entonces API/web. API recibe exclusivamente la clave de ejecución. La provisión se repite después de migrar para conceder acceso a nuevas tablas/secuencias; historial de migraciones queda excluido del rol de ejecución. Hacerlo únicamente en el servidor y ventana acordados; esta documentación no ejecuta un despliegue público.
5. Verificar DNS, puertos 80/443, certificado público válido, recursos/espacio, permisos y respaldos. Registrar cuenta propia y ejecutar bootstrap administrativo dentro de API; crear cobertura/cuentas reales después de aceptar el checklist. No importar fixtures del harness.

Caddy sirve SPA y conserva `/api/*` hacia API; sus cabeceras sobrescriben las de proxy que pueda aportar un cliente. API confía en un único salto únicamente en esta topología (`TRUST_PROXY_HOPS=1`); no exponer API directamente ni añadir otro proxy sin revisar esa confianza. Producción exige `SESSION_COOKIE_SECURE=true` y orígenes HTTPS exactos. HTTP de desarrollo deja proxy en 0. Swagger no se monta en el bootstrap de producción.

TLS y patrón SPA/proxy se basan en [documentación de Caddy](https://caddyserver.com/docs/caddyfile/patterns); configuración de confianza en [Express detrás de proxies](https://expressjs.com/en/guide/behind-proxies/). Los certificados locales de prueba no sustituyen los públicos. CSP limita recursos al mismo origen; la fuente Google histórica puede bloquearse y usar la fuente de sistema. Si se exige esa tipografía, alojarla localmente y verificar su licencia antes del piloto.

## Salud, límites y logs

- `/api/v1/health/live`: proceso responde sin consultar PostgreSQL.
- `/api/v1/health/ready`: PostgreSQL responde, o 503 sin detalles de conexión. `/health` conserva compatibilidad. No comprueba disco, respaldos ni todos los workers.
- `/api/v1/admin/operations` y pantalla `/admin/operacion`: acceso de administrador, `no-store`, eventos pendientes/reintentados, antigüedad, pedidos vencidos, entregas/tickets y estado del pool. Es una consulta/aviso, no una reparación automática ni una liquidación.
- Avisos: evento pendiente de más de 300 segundos, eventos sin publicar con al menos 5 intentos, pedidos pendientes con plazo vencido y espera de conexiones DB. Revisar junto con los intervalos configurados; al desactivar workers algunos avisos son esperables.
- `PG_POOL_MAX` 20 (1–100), conexión 5000 ms (100–30000), consulta e inactividad transaccional 15000 ms (100–120000). Estas opciones se aplican también cuando se usa DATABASE_URL. Dimensionar el pool junto con conexiones de workers/administración antes de aumentar réplicas.
- `HTTP_ACCESS_LOG=true` registra request ID, método, plantilla de ruta, estado y duración; no cuerpo, query, cookies, correo ni rutas con IDs reales. Errores de DB registran código y request ID; mensajes internos se sanitizan. Staging limita logs Docker a tres archivos de 10 MB por servicio. Definir retención y destino externo antes del piloto.
- Shutdown espera cierre de API/pools/workers. Ensayar reinicio y no interpretar readiness verde como evidencia de ausencia de incidencias operativas.

Configurar un monitor externo para disponibilidad HTTPS/readiness y un procedimiento con responsable para los avisos internos. En esta sesión no se contrata ni configura un servicio externo de alertas ni se envían mensajes a terceros.

## Respaldo conjunto de DB e imágenes

Herramienta desde backend: `node scripts/backup.cjs`. Requiere Node y acceso al contenedor PostgreSQL correspondiente. `DATABASE_URL` apunta a la DB que se respalda, `POSTGRES_CONTAINER` al contenedor de ese mismo cluster y `MEDIA_ROOT` al directorio con los objetos. En desarrollo el contenedor predeterminado es `quickly-postgres`. Nunca copiar el directorio de datos de PostgreSQL mientras está funcionando.

1. Programar ventana de mantenimiento; detener entradas web, API, workers y otros escritores de ese entorno, esperando operaciones en curso. `--maintenance` confirma que el operador ya lo hizo; el script no detiene aplicaciones por su cuenta.
2. Preparar carpeta de respaldos privada. Para API Docker con volumen de objetos, copiar `/app/media` desde el contenedor detenido a una carpeta nueva y usarla como MEDIA_ROOT. No usar `.media` de otro entorno. No copiar solo DB: los objetos y referencias son una unidad de recuperación.
3. Ejecutar, por ejemplo, `node scripts/backup.cjs create .backups/respaldo-fecha --maintenance`. El destino debe ser nuevo y su carpeta padre existir. Conservar configuración local en variables/archivo privado; no escribir contraseña en el comando ni en documentación.
4. `node scripts/backup.cjs verify .backups/respaldo-fecha` comprueba manifiesto y hashes SHA-256 de dump/objetos. Solo un manifiesto final acredita finalización del script; un directorio parcial no es respaldo válido.
5. Reanudar servicios tras verificar. Guardar copia cifrada fuera del servidor, acceso restringido, claves de recuperación separadas y registro de ejecución. Definir frecuencia, retención y responsables; ni copias remotas ni programación quedan activadas por crear la herramienta.

El script toma locks SHARE de las tablas de negocio, exporta snapshot y usa `pg_dump -Fc --snapshot=...` desde el contenedor; el dump y las referencias de objetos corresponden al mismo snapshot. Esos locks bloquean escrituras durante la copia; por eso se exige mantenimiento. Solo se copian objetos referenciados válidos, sin recorrer symlinks/subdirectorios ni respaldar huérfanos innecesarios. El dump y los objetos tienen checksums; no incluyen `.env` ni archivos de configuración secretos. El dump sí contiene datos personales, hashes de contraseña y sesiones de la DB: debe tratarse como material privado. SHA-256 detecta corrupción, no autentica un respaldo manipulado.

Fundamento y límites de dump/restauración: [PostgreSQL 17 pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html). Restaurar SQL de origen no confiable puede ejecutar código; usar únicamente respaldos propios verificados. La herramienta no proporciona cifrado, copias remotas, rotación ni almacenamiento de claves.

## Restaurar y volver a operar

Configurar `RESTORE_ADMIN_URL` hacia `/postgres` en localhost del cluster de destino; nunca una URL de DB de negocio. El contenedor elegido debe corresponder a ese cluster. Ejemplo: `node scripts/backup.cjs restore .backups/respaldo-fecha .restores/media-nueva`. La carpeta padre debe existir y la carpeta de imágenes destino no debe existir.

El script verifica hashes antes de crear recursos, crea una DB nueva `quickly_restore_<aleatorio>`, restaura en transacción única y copia imágenes a un directorio nuevo. Comprueba historial/checksum de migraciones y correspondencia exacta de referencias a objetos. Revoca las sesiones restauradas para no reactivar sesiones antiguas. Nunca sobrescribe una DB ni `.media` existentes. Ante fallo elimina únicamente la DB aleatoria creada por esa ejecución; conservar/revisar el directorio nuevo parcial sin redirigir tráfico hacia él.

Antes de sustituir el entorno operativo: volver a provisionar permisos de `quickly_app` sobre la DB restaurada usando el propietario (los dumps no restauran propietarios/ACL). Iniciar API aislada con intervalos de workers en 0 hasta revisar pedidos/entregas/cobros contra lo ocurrido después del punto de respaldo. Verificar login nuevo, lectura privada de imagen, catálogo y compra controlada solo en un entorno de ensayo. Validar conteos/estados críticos y medir tiempo real. Después, dentro de otra ventana acordada, cambiar configuración de DB/media juntas y volver a verificar antes de habilitar tráfico/workers. El script no hace ese cambio ni elimina la fuente.

El objetivo RPO (pérdida tolerable de datos) y RTO (tiempo de recuperación) deben acordarse con operación y comprobarse con volumen similar al real. El tiempo con un fixture diminuto no es un compromiso de recuperación del negocio.

## Incidentes y efectivo

| Situación | Acción operativa |
| --- | --- |
| Checkout con timeout | Cliente usa recuperar misma confirmación; revisar pedido antes de permitir otra intención. No recrearlo manualmente |
| Pedido pendiente vencido | Revisar worker/config y estados en SQL/API; ejecutar lote soportado con permisos. No liberar stock por fecha de reserva aislada |
| Pedido aceptado atascado | Contactar responsables, consultar historial/versiones y usar acciones admitidas. No saltar estados vía SQL |
| Repartidor no puede retirar | Liberar/reasignar antes de retiro con versión/motivo; conservar historial |
| Incidencia después de retiro | Registrar ticket/incidencia y coordinar resolución. No devolver stock ni confirmar entrega/cobro ficticios |
| Diferencia de efectivo | Consultar importe debido, efectivo recibido, cambio y cobrador por pedido. Documentar diferencia y responsable; el sistema no declara dinero liquidado a tienda/repartidor |
| Multitienda | Cada entrega se gestiona y cobra por separado; una cancelación no implica cancelar las otras |
| Notificaciones atrasadas | Revisar antigüedad/intentos, logs/request ID y DB. Reintentar consumidor soportado; no borrar outbox ni duplicar avisos manualmente |
| DB indisponible | Readiness 503, detener nueva operación, revisar conexiones/disco/logs y escalar; no reinicializar volumen |
| Recuperación o reversión | Mantener backup previo, tags/digests anteriores y migraciones compatibles; volver imagen solo tras verificar compatibilidad. No editar/desaplicar migraciones aplicadas ni borrar datos para revertir |

Custodia del efectivo, traspasos, evidencia de entrega de dinero, horarios de rendición, diferencias, tarifa/comisión y responsable de conciliación continúan pendientes de acuerdo. La configuración provisional de tarifa no constituye una liquidación aprobada. No iniciar piloto con cobros reales sin resolverlos.

## Verificación reproducible

- Backend dirigido: `npm run test:f8` (salud, privacidad, acceso de monitoreo, carga acotada e idempotencia, backup/restauración/operación con imágenes y sesiones revocadas).
- Local HTTPS: `npm run test:staging`. Construye imágenes y crea un proyecto Docker `quickly-f8-<aleatorio>` con puertos exclusivamente loopback 18080/18443/25434, cuenta sintética y secretos temporales. Usa certificado local solo en su contexto Playwright y elimina ese proyecto/volúmenes al terminar. Nunca emplea `.env`/volúmenes de desarrollo. `--skip-build` solo para diagnóstico con imágenes que ya correspondan al código actual.
- Regresión integral: raíz `node scripts/check-workspace.cjs`. F8 se incluye en API/PostgreSQL; staging/HTTPS es un bloque separado porque necesita ambos repositorios y construir imágenes.
- Seguridad: en ambos repositorios `npm audit --omit=dev`; conservar resultado y corregir hallazgos antes de publicar. Un harness funcional aprobado no acredita una auditoría limpia.

La CI backend necesita `TEST_POSTGRES_CONTAINER` con el ID del servicio PostgreSQL para ejecutar pg_dump/restore; el workflow lo pasa al harness. Ejecuciones remotas y despliegue público no se acreditan con pruebas locales.
