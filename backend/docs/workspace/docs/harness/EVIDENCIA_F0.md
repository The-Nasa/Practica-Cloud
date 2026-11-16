# Evidencia F0

Fecha: 26 de octubre de 2026. Alcance acreditado: API contra baseline en entorno aislado y posteriormente contra la DB de desarrollo en Docker. No acredita integración frontend ni preparación para producción.

## Cambios implementados

- Reparadas consultas de categorías/productos, tiendas/horarios/membresías, direcciones, compras/totales/líneas/eventos, asignaciones, notificaciones y auditoría.
- Alta comercial pendiente; aprobación administrativa concede rol operativo dentro de una transacción.
- Autorización por tienda para publicar, consultar comandas y cambiar/cancelar pedidos. Visibilidad pública limitada a tiendas activas.
- Checkout idempotente con clave obligatoria, hash canónico y reclamación en transacción; bloqueo ordenado de stock, publicación activa, mínimo comercial y efectivo habilitado.
- Cancelación libera reservas y cierra intento pendiente de efectivo. Retiro consume reservas y stock una vez; entrega persiste cobro y cobrador.
- Asignación inicial `accepted`; bloqueo de perfil para evitar dos entregas activas del mismo repartidor. No se expone el destino privado en la bandeja previa a asignación.
- Direcciones archivadas quedan excluidas del listado/checkout; referencia opcional guarda cadena vacía conforme al baseline.
- Configuración HTTP compartida por ejecución real y pruebas: validación, CORS, request ID y filtro de errores sin mensajes internos/valores de restricciones.
- Endpoint de salud devuelve 503 cuando falla DB; hash de contraseña corrupto se rechaza sin excepción de tamaño.
- TTL de sesión configurable y comisión de desarrollo explícita. Autenticación Bearer actual conservada temporalmente; cookie prevista en F1.
- SQL baseline preservado. DTO incompatibles corregidos: categoría obligatoria y retiro de campos comerciales sin persistencia, pendientes de decisión/migración F2.

## Harness y continuidad

- `AGENTS.md`: punto de entrada, límites de datos, reglas de permisos/transacciones y bucle de validación.
- `docs/harness/DECISIONES.md`: decisiones, supuestos y límites por fase.
- `docs/harness/ESTADO.md`: avance y siguiente trabajo pendiente.
- `backend/test/harness-check.cjs`: comando único build → unitarias → PostgreSQL/HTTP.
- `backend/test/run-e2e.cjs`: crea DB aleatoria, instala baseline, verifica SQL y elimina su DB al terminar.
- `backend/.github/workflows/harness.yml`: misma ejecución con PostgreSQL 17 en CI del repositorio backend.
- `backend/scripts/db-inspect.cjs`: metadatos de DB en transacción read-only, sin credenciales o filas de negocio.

## Validación ejecutada

Entorno: Windows, Node 22.17.0, npm 10.9.2 y PostgreSQL 17.4. Se instaló el lockfile existente del backend con `npm ci --no-audit --no-fund`.

Cluster de prueba propio en `.tmp/pg-f0`, loopback `127.0.0.1:15432`. El puerto 55432 estaba en exclusiones de Windows; se eligió otro sin alterar el sistema. Docker no fue necesario.

```powershell
# Desde backend/, después de iniciar el cluster de pruebas:
$env:TEST_DATABASE_URL = 'postgresql://quickly_test@127.0.0.1:15432/postgres'
npm run harness:check
git diff --check
```

Resultados de la ejecución final: ambos comandos terminaron con código 0.

| Control | Resultado |
| --- | --- |
| Compilación NestJS/TypeScript | Aprobada |
| Pruebas unitarias de contraseña | 2 aprobadas |
| Instalación baseline | 41 tablas, 10 schemas, 5 vistas |
| `002_verificar.sql` | Aprobado, fixtures SQL revertidos |
| Escenarios HTTP con DB real | 15 aprobados, 0 fallidos/omitidos |
| Limpieza de base aleatoria | Confirmada por runner |
| Revisión whitespace del diff backend | Aprobada |

Los escenarios HTTP cubren sesión/revocación/suspensión; direcciones y propiedad; alta/aprobación comercial; catálogo y rollback; restricciones de checkout; misma clave concurrente; disputa de última unidad; productos/tienda/dirección no disponibles; cancelación única; transiciones; disputa de reparto; retiro/entrega y cobro; una entrega por repartidor; aislamiento de notificaciones y escritura de auditoría.

## Límites iniciales (resueltos mediante Docker en la siguiente sección)

- El servidor PostgreSQL existente en puerto 5432 no se modificó. La conexión de ejemplo fue rechazada con 28P01; no se conoce su esquema/datos efectivos. Configurar conexión propia en `.env` y ejecutar `npm run db:inspect` antes de vincular la API a esa base.
- Ninguna migración fue aplicada a una DB de negocio. Si difiere del baseline, reconciliar mediante una migración revisada y probada en copia.
- Frontend continúa en modo prototipo; F1 integra HTTP/sesión y contratos. No se probó un recorrido web con navegador.
- No se implementaron pasarela, worker de notificaciones, todas las acciones administrativas ni instrumentación completa de auditoría; siguen en su fase.
- CI fue escrita y validada mediante el comando local equivalente; no publicada ni ejecutada remotamente.
- La instancia temporal debe detenerse al terminar; los scripts permiten repetir la validación sin reutilizar una DB de negocio.

## Cierre de F0 con PostgreSQL en Docker

El usuario aclaró que utilizaría Docker y que no tenía DB de Quickly configurada fuera de contenedores. La inspección del servicio PostgreSQL de Windows deja de ser un requisito. Se implementó el entorno Docker completo para desarrollo y pruebas:

- `npm run dev:setup`: genera `.env` ignorado por Git con credenciales independientes; no sobrescribe un archivo existente.
- `npm run dev:db`: PostgreSQL 17.11 en contenedor `quickly-postgres`, host `127.0.0.1:5433`, volumen `quickly-postgres-data`; baseline instalado al inicializar el volumen vacío.
- `npm run db:verify`: aprobado con aviso OK y ROLLBACK.
- Inventario desde la conexión de desarrollo configurada: 41 tablas y 5 vistas; metadatos locales en `.tmp/quickly-docker-inventory.json`, sin datos de usuarios/credenciales.
- Comprobación HTTP de NestJS contra esa base: código 200 y `database=connected`. Usuarios y compras de desarrollo: 0; no se importaron fixtures del harness.
- `npm run harness:docker`: contenedor separado `quickly-postgres-test` con tmpfs, compilación/SQL aprobados, 2 pruebas unitarias y 15 HTTP aprobadas; DB aleatoria eliminada y servicio de pruebas detenido automáticamente.
- `docker compose config --quiet` y `git diff --check`: código 0. `.env` confirmado como ignorado por Git.

La DB de desarrollo queda activa y saludable. La API de la comprobación temporal se cerró; para trabajar, ejecutar `npm run start:dev` o levantar el servicio opcional `api` de Compose. Con estos resultados F0 queda cerrada para el entorno acordado. F1 conserva su alcance de sesión web y conexión frontend.
