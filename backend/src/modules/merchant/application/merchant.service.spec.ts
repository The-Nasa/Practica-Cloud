import { MerchantService } from './merchant.service';
import { DatabaseService } from '../../../platform/database/database.service';

describe('Respuesta pública de comercios', () => {
  const row = { id: 'store', name: 'Comercio', preparation_minutes: 23, minimum_order_cents: '1500', base_fee_cents: 375,
    rating_average: '3.7500000000', rating_count: '4', description: 'Persistida', address_text: 'Calle 20', phone: '+51912345678' };
  it('conserva campos persistidos y convierte importes y promedios de PostgreSQL a números JSON', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [row], rowCount: 1 });
    const service = new MerchantService({ query } as unknown as DatabaseService);
    const result = await service.listStores('ropa');
    expect(result[0]).toMatchObject({ preparation_minutes: 23, minimum_order_cents: 1500, base_fee_cents: 375, rating_average: 3.75, rating_count: 4, description: 'Persistida' });
    expect(query.mock.calls[0][1]).toEqual(['ropa']);
    expect(row.minimum_order_cents).toBe('1500');
  });
  it('una tienda sin valoraciones conserva null y sus horarios reales', async () => {
    const hours = [{ weekday: 3, opens_at: '10:30:00', closes_at: '18:15:00' }];
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ ...row, rating_average: null, rating_count: 0 }], rowCount: 1 }).mockResolvedValueOnce({ rows: hours });
    const service = new MerchantService({ query } as unknown as DatabaseService);
    const result = await service.getStoreById(row.id);
    expect(result.rating_average).toBeNull();
    expect(result.rating_count).toBe(0);
    expect(result.openingIntervals).toEqual(hours);
  });
  it('un detalle inexistente termina en 404 sin consultar otra tienda', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const service = new MerchantService({ query } as unknown as DatabaseService);
    await expect(service.getStoreById('missing')).rejects.toMatchObject({ status: 404 });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
