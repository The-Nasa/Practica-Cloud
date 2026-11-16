import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

// Preserve the existing wire format, including PostgreSQL int8 aggregates serialized as strings.
const text: SchemaObject = { type: 'string' };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const integer: SchemaObject = { type: 'integer' };
const aggregate: SchemaObject = { oneOf: [{ type: 'integer' }, { type: 'string', pattern: '^-?[0-9]+$' }] };
const nullable = (schema: SchemaObject): SchemaObject => ({ ...schema, nullable: true });
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({ type: 'object', properties, required: Object.keys(properties) });
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
export const orderMutationResponse = object({ orderId: uuid, previousStatus: text, currentStatus: text });
export const orderCancellationResponse = object({ orderId: uuid, status: text, message: text });
export const assignmentResponse = object({ id: uuid, status: text, agreed_fee_cents: integer, accepted_at: date });
export const releaseResponse = object({ orderId: uuid });
export const incidentResponse = object({ id: uuid, ticketId: uuid });
export const pickupResponse = object({ assignmentId: uuid, status: text, orderStatus: text });
export const deliveryResponse = object({ assignmentId: uuid, status: text, orderStatus: text, message: text });
export const purchaseResponse = object({
  purchaseId: uuid, purchaseNumber: text, orderId: uuid, storeId: uuid, storeName: text, statusCode: text,
  deliveryFeeCents: integer, itemsSubtotalCents: aggregate, totalCents: aggregate, paymentMethod: text,
  items: array(object({ id: uuid, product_name_at_sale: text, unit_price_cents: integer, quantity: integer })),
  createdAt: date, acceptanceExpiresAt: nullable(date), cashTenderCents: integer, cashChangeCents: integer,
});
export const legacyPurchasesResponse = array(object({
  id: uuid, code: aggregate, created_at: date, overall_status: text, subtotal_cents: aggregate,
  delivery_fee_cents: aggregate, total_cents: aggregate, recipient_name: nullable(text), street: nullable(text), street_number: nullable(text),
  store_orders: array(object({ orderId: uuid, storeId: uuid, storeName: text, status: text, deliveryFeeCents: integer, acceptanceExpiresAt: nullable(date) })),
}));
export const legacyMerchantOrdersResponse = array(object({
  order_id: uuid, status_code: text, delivery_fee_cents: integer, created_at: date, version: integer,
  acceptanceExpiresAt: nullable(date), subtotal_cents: aggregate, total_cents: aggregate,
  recipient_name: nullable(text), phone: nullable(text), street: nullable(text), street_number: nullable(text), reference: nullable(text),
  assignment_id: nullable(uuid), courierUserId: nullable(uuid), assignmentStatus: nullable(text), courierName: nullable(text), courierPhone: nullable(text),
  items: array(object({ itemId: uuid, productName: text, variantName: text, unitPriceCents: integer, quantity: integer, note: nullable(text) })),
}));
export const legacyAvailableOrdersResponse = array(object({ order_id: uuid, store_id: uuid, delivery_fee_cents: integer, created_at: date, store_name: text, store_address: text, store_phone: text, total_cents: aggregate }));
export const legacyActiveAssignmentResponse: SchemaObject = { ...object({
  assignment_id: uuid, merchant_order_id: uuid, agreed_fee_cents: integer, assignment_status: text,
  accepted_at: date, picked_up_at: nullable(date), order_status: text, store_name: text, store_address: text, store_phone: text,
  recipient_name: text, recipient_phone: text, dest_street: text, dest_number: text, dest_reference: nullable(text), total_cents: aggregate,
}), nullable: true };
export const availableCouriersResponse = array(object({ courierUserId: uuid, fullName: text, email: text, phone: text, vehicleType: text, plate: nullable(text), isOnline: { type: 'boolean' }, currentZoneId: nullable(uuid), zoneName: nullable(text) }));
export const legacyNotificationsResponse = array(object({ id: uuid, title: text, message: text, kind: text, relative_url: nullable(text), read_at: nullable(date), created_at: date }));
