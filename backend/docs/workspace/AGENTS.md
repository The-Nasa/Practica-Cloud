# Quickly: instrucciones de trabajo

## Punto de entrada

Antes de cambiar código, leer `docs/harness/ESTADO.md`, `docs/harness/DECISIONES.md` y la fase correspondiente de `PLAN_IMPLEMENTACION_BACKEND_FRONTEND.md`.

- Backend: `backend/` (NestJS + pg + PostgreSQL 17).
- Frontend: `Frontend-Quickly/` (React + Vite + Zustand).
- Ambas carpetas tienen repositorios Git propios. Consultar su estado antes y después de editar; no hacer commits, resets ni reemplazar trabajo ajeno sin instrucción.
- El plan completo es el alcance de referencia. Ejecutar la fase solicitada y registrar pendientes reales sin declarar fases futuras terminadas.

## Reglas de implementación

- El SQL baseline `backend/001_schema.sql` es referencia de persistencia. No editar un baseline aplicado para introducir cambios: agregar migraciones versionadas.
- No conectar pruebas destructivas a una base operativa. `npm run test:e2e` crea una DB aleatoria propia, instala baseline, verifica y elimina solo esa DB.
- No importar datos del localStorage como hechos reales ni caer a mocks silenciosamente al fallar HTTP.
- Comprobar permisos por recurso además del rol. Identidad y cálculos monetarios son responsabilidad del servidor.
- Transacciones usan un solo cliente PostgreSQL. Bloquear stock por SKU en orden estable; no llamar servicios externos manteniendo locks.
- No guardar credenciales, tokens, datos de tarjetas ni resultados sensibles en documentación/logs.
- Mantener contratos y configuración documentados. No agregar infraestructura o dependencias sin necesidad de la fase.

## Bucle de trabajo y evidencia

1. Reproducir el fallo o identificar un criterio de aceptación concreto.
2. Implementar el cambio mínimo que cumple la regla de negocio.
3. Ejecutar verificaciones relevantes; para cambios de SQL ejecutar integración con PostgreSQL, no solo mocks.
4. Revisar diff y actualizar `docs/harness/ESTADO.md` con resultados, limitaciones y siguiente paso.
5. Una fase termina por evidencia de sus criterios, no por cantidad de archivos o pruebas declaradas.

Entorno principal: PostgreSQL en Docker. Desde `backend/`, `npm run dev:setup` genera configuración local si no existe y `npm run dev:db` inicia la DB persistente en 5433 y aplica migraciones pendientes. No sobrescribir `.env` ni eliminar volúmenes al detener servicios. Agregar SQL en `backend/migrations/`; el runner serializa aplicaciones y comprueba SHA-256 normalizando CRLF. No editar migraciones aplicadas. `npm run db:migrate` permite aplicarlas por separado; el harness las aplica dos veces para comprobar idempotencia.

Comando integral por fase desde la raíz: `node scripts/check-workspace.cjs` (backend `npm run harness:full`). Incluye contratos, compilaciones, tests y navegador real con DB aisladas. Comando rápido backend: `npm run harness:docker`, que usa el contenedor de pruebas en 15432 y lo detiene al terminar. `npm run harness:check` permite usar un servidor de pruebas ya iniciado con `TEST_DATABASE_URL`. Leer `backend/test/README.md` antes de configurar el servidor.

Al cambiar DTO públicos: backend `npm run build` y `npm run contracts:export`; frontend `npm run contracts:sync`. No editar a mano `schema.d.ts`. El modo real no debe reactivar datos demo; `npm run dev:demo` conserva el prototipo explícitamente.

F8: cierre funcional con el comando integral y bloque adicional backend `npm run test:staging` (Docker/navegador HTTPS local aislado). Respaldo DB+objetos exige mantenimiento y destino nuevo; restaurar solo en una DB aleatoria/directorio nuevo, nunca sobrescribir desarrollo. Leer `docs/harness/OPERACION_F8.md` y el checklist antes de proponer piloto/despliegue. Un harness aprobado no sustituye audit de dependencias, dominio público, política de efectivo ni piloto real.

