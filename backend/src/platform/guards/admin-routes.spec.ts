import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { DatabaseService } from '../database/database.service';
import { AdminUsersController } from '../../modules/identity/infrastructure/controllers/admin-users.controller';
import { AdminUsersService } from '../../modules/identity/application/admin-users.service';
import { AdminZonesController } from '../../modules/geography/infrastructure/controllers/geography.controller';
import { GeographyService } from '../../modules/geography/application/geography.service';
import { OrderFlowController } from '../../modules/ordering/infrastructure/controllers/order-flow.controller';
import { OrderFlowService } from '../../modules/ordering/application/order-flow.service';
import { OrderingService } from '../../modules/ordering/application/ordering.service';
import { ReportController } from '../../modules/platform/infrastructure/controllers/report.controller';
import { ReportService } from '../../modules/platform/application/report.service';
import { SupportController } from '../../modules/support/support.controller';
import { SupportService } from '../../modules/support/support.service';

// HTTP real de Nest con sesión y consultas SQL controladas. No conecta a PostgreSQL.
describe('Acceso HTTP administrativo', () => {
 let app: INestApplication;
 const actor = '10000000-0000-4000-8000-000000000001';
 const query = jest.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
 const db = { query, withTransaction: (work: (client: unknown) => Promise<unknown>) => work({ query }) };
 beforeAll(async () => {
  const module = await Test.createTestingModule({
   controllers: [AdminUsersController, AdminZonesController, OrderFlowController, ReportController, SupportController],
   providers: [RolesGuard, OrderFlowService, ReportService, SupportService, { provide: DatabaseService, useValue: db }, { provide: AdminUsersService, useValue: { list: jest.fn(() => ({ items: [], nextCursor: null })) } }, { provide: GeographyService, useValue: { listZones: jest.fn() } }, { provide: OrderingService, useValue: {} }],
  }).overrideGuard(AuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); req.user = { id: actor, roles: [req.headers['x-test-role'] || 'customer'] }; return true; } }).compile();
  app = module.createNestApplication(); await app.init();
 });
 afterAll(async () => { await app.close(); });
 beforeEach(() => query.mockClear());
 it.each(['customer','merchant','courier'])('rechaza %s en cuentas y zonas mediante RolesGuard', async role => {
  for (const path of ['/api/v1/admin/users','/api/v1/admin/zones']) await request(app.getHttpServer()).get(path).set('x-test-role', role).expect(403);
  expect(query).not.toHaveBeenCalled();
 });
 it.each(['/api/v1/admin/orders','/api/v1/admin/reports','/api/v1/admin/audit','/api/v1/admin/tickets'])('rechaza acceso sin administrador activo en %s mediante servicio', async path => {
  await request(app.getHttpServer()).get(path).set('x-test-role', 'customer').expect(403);
  expect(query).toHaveBeenCalledTimes(1); expect(query.mock.calls[0][0]).toContain('identity.user_roles');
 });
 it('permite al rol administrador acceder al listado autorizado', async () => {
  const result = await request(app.getHttpServer()).get('/api/v1/admin/users').set('x-test-role', 'admin').expect(200); expect(result.body.items).toEqual([]);
 });
});
