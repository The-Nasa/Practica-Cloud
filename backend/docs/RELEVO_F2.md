






Relevo de desarrollo al cierre de F2

F8 añade preparación operativa local: manual/checklist/seguridad en `docs/workspace/docs/harness/`. Staging HTTPS local y restauración aislada tienen pruebas propias; infraestructura pública, resolución de dependencias vulnerables y piloto siguen pendientes. Leer el estado actualizado antes de continuar o publicar.

Actualización posterior: F0–F5 implementadas; F6/pasarela aplazada por el usuario, con base de consulta de pagos disponible; F7 ejecuta solo multitienda con cobros/envíos independientes. Las demás ampliaciones siguen pendientes. Leer primero `docs/workspace/docs/harness/ESTADO.md` y `OPERACION_F7.md` para el estado vigente; los datos F2 siguientes son antecedentes de la entrega original. Los cambios actuales no implican publicación de una nueva entrega ni piloto completado.

Se entregan F0, F1 y F2. Siguiente fase: F3, catálogo/SKU, imágenes e inventario. La verificación local integral aprobó 142 pruebas (7 unitarias backend, 35 HTTP, 92 frontend y 8 navegador), contratos y compilaciones.

## Repositorios y ramas

- Backend: https://github.com/xmenil/Quickly-backend, rama `main`.
- Frontend: https://github.com/xmenil/Frontend-Quickly, rama `feat/integracion-backend-f0-f2`. Esta rama no se fusiona a `main` en esta entrega. La integración real requiere API accesible y proxy/cookies configurados antes de desplegar.

Clonar como carpetas hermanas con estos nombres, porque el harness conjunto resuelve sus rutas relativas:

```powershell
mkdir quickly-workspace
cd quickly-workspace
git clone https://github.com/xmenil/Quickly-backend.git backend
git clone --branch feat/integracion-backend-f0-f2 https://github.com/xmenil/Frontend-Quickly.git Frontend-Quickly
```

## Plan, decisiones y harness engineering

La documentación original del workspace se conserva en [`workspace/`](workspace/). Contiene el plan completo, `AGENTS.md`, estado, decisiones, evidencia de cada fase y el comando raíz. Copiar su contenido a la carpeta padre de ambos repositorios para reconstruir la organización original y resolver sus enlaces:

```powershell
# Desde quickly-workspace
Copy-Item -Path backend/docs/workspace/* -Destination . -Recurse -Force
```

Leer `AGENTS.md`, `docs/harness/ESTADO.md`, `docs/harness/DECISIONES.md` y la fase F3 del plan antes de continuar. La copia es el estado al cierre de esta entrega; mantenerla sincronizada al registrar nuevas fases.

## Arranque local

Requiere Node 22 y Docker Desktop en ejecución. No se transfieren `.env`, contraseñas, usuarios reales ni el volumen de PostgreSQL. En `backend/`:

```powershell
npm ci
npm run dev:setup
npm run dev:db
npm run start:dev
```

En otra terminal, desde `Frontend-Quickly/`: `npm ci` y `npm run dev`. Abrir `http://localhost:5173`. Registrar una cuenta propia y habilitar el primer administrador desde backend con `npm run admin:bootstrap -- --email tu-correo@ejemplo.com`. Iniciar sesión de nuevo y crear zonas reales desde administración. Después presentar/aprobar solicitudes de comercio/reparto. El bootstrap solo habilita la primera cuenta administrativa; no existe contraseña predeterminada.

## Verificación y límites

Desde backend, `npm run harness:full` ejecuta ambos proyectos y navegador con DB aleatorias, sin usar datos de desarrollo. Desde la raíz reconstruida también funciona `node scripts/check-workspace.cjs`. En Linux instalar el navegador de pruebas desde frontend con `npx playwright install --with-deps chromium`.

No editar baseline ni migraciones aplicadas; agregar migraciones versionadas. Al cambiar DTO: backend `npm run build` y `npm run contracts:export`, luego frontend `npm run contracts:sync`. Mantener permisos en servidor, transacciones con un cliente y auditoría/outbox atómicos para las nuevas operaciones.

Las pantallas reales de fases posteriores permanecen pendientes y el demo es explícito (`npm run dev:demo`). HTTPS/staging, mapas, procesamiento externo del outbox y pagos digitales no se consideran implementados. Los workflows separados verifican cada repositorio; el recorrido completo requiere ambos checkouts.
