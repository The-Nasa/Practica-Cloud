# Evidencia F2: cuentas y operación inicial

Fecha: 26 de octubre de 2026. Entorno local Windows, PostgreSQL 17.11 Docker, NestJS y React/Vite. Comando de cierre: `node scripts/check-workspace.cjs` desde la raíz.

## Funcionalidades implementadas

| Módulo | Resultado verificable |
| --- | --- |
| Comercio | Alta pendiente, corrección y reenvío, razón social/RUC opcionales, perfil, recepción/pausa, horarios por día y selección de tienda |
| Membresías | Propietario, encargado y operador; acceso por tienda, alta sobre cuenta existente, cambio de rol y revocación inmediata |
| Reparto | Solicitud con vehículo/placa/zona, revisión y corrección, perfil real y disponibilidad condicionada a aprobación/cobertura |
| Geografía | Zonas administrables con tarifa en céntimos, tiempo y activación; direcciones propias con coordenadas opcionales emparejadas, edición, predeterminada y archivo |
| Administración | Primer administrador mediante comando local; resumen con conteos reales, filtros/paginación, revisión con motivo, suspensión/reactivación y revocación de sesiones |
| Integración | DTO OpenAPI y tipos generados, validación Zod, HTTP con cookie/CSRF, carga/error/vacíos, solicitudes accesibles antes de obtener rol operativo |
| Persistencia | Migración aditiva versionada con checksum y exclusión mutua; auditoría/outbox de nuevas mutaciones dentro de la misma transacción |

## Reglas y regresiones

- La cuenta personal no puede autoasignarse roles. Aprobaciones/suspensiones y membresías recalculan acceso; la sesión consulta roles actuales.
- Identidad comercial o vehículo/placa aprobados vuelven a revisión al cambiar. Rechazo admite corrección; suspensión exige decisión administrativa.
- Operador no modifica producto, perfil, horarios ni equipo. Encargado no modifica identidad comercial ni equipo. Propietario no puede revocarse o ser reemplazado por la gestión de miembros.
- Horarios `America/Lima`, sin solapamientos y con cierre `24:00`. Tienda fuera de horario, pausada o zona inactiva rechaza compra.
- Suspender cuentas revoca sesiones y pausa operación. Reactivar exige login nuevo; no recupera disponibilidad o recepción automáticamente.
- No se suspenden recursos con pedidos/asignaciones activos que quedarían abandonados. Desactivar zona preserva historial/direcciones y entregas en curso.
- Direcciones predeterminadas concurrentes se serializan por cuenta. Archivar la predeterminada promueve otra activa. No se puede acceder a direcciones ajenas.
- Fallo forzado al escribir auditoría revierte también el cambio y outbox. Los eventos no almacenan contraseñas ni contenido privado de direcciones.

## Verificación integrada

- Contrato OpenAPI y tipos frontend sincronizados; compilaciones backend y frontend aprobadas.
- Backend: 7 pruebas unitarias, 23 escenarios HTTP F0/F1 y 12 escenarios HTTP F2.
- Frontend: 92 pruebas en 19 archivos; incluyen regresiones del prototipo explícito y validación real de contratos/errores/permisos.
- Navegador: 8 recorridos reales; 4 de identidad y 4 de F2 (comercio/equipo/revocación, reparto/revisión, direcciones/cobertura móvil y suspensión de cuenta).
- Cada suite HTTP y el navegador usan una DB aleatoria separada. Baseline y verificación SQL, dos aplicaciones de migraciones para comprobar idempotencia y eliminación al terminar. Administrador sintético únicamente en la DB de navegador.
- `git diff --check` de ambos repositorios sin errores de espacios. Workflows preparados; no ejecutados remotamente en esta sesión.

## Desarrollo y uso

`npm run dev:db` aplicó `001_f2_operational_accounts.sql` al PostgreSQL persistente de desarrollo, conservando el baseline y los datos existentes. `npm run db:verify` aprobado con rollback e inventario leído sin modificar datos: 42 tablas y 5 vistas. No se crearon cuentas ni zonas de ejemplo en desarrollo durante F2.

Desde backend: `npm run dev:db` y `npm run start:dev`. Desde frontend: `npm run dev`. Registrar tu cuenta o usar una cuenta propia existente; habilitarla con `npm run admin:bootstrap -- --email tu-correo@ejemplo.com` desde backend. Restaurar sesión y crear las zonas reales en administración. Luego presentar solicitudes y aprobarlas desde la cuenta administrativa. El comando no permite habilitar otra cuenta si ya existe administrador.

## Límites y siguiente fase

F3 sigue pendiente: catálogo/SKU, imágenes e inventario gestionados desde la web. El ciclo completo compra-entrega en modo real corresponde a F4. No hay mapas/geocodificación, validación tributaria externa, worker de outbox ni pagos digitales integrados. HTTPS/staging y piloto permanecen pendientes. El prototipo explícito sigue disponible en `npm run dev:demo`, sin actuar como respaldo ante fallos de API.
