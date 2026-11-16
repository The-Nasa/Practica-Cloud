import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { AuthenticatedUser } from '../../../platform/guards/auth.guard';

export interface MutationActor { userId: string; requestId: string }
export interface MutationRequest extends Request { user: AuthenticatedUser }
export function mutationActor(request: { user: { id: string }; headers: { [key: string]: unknown } }): MutationActor {
  return { userId: request.user.id, requestId: String(request.headers['x-request-id'] || randomUUID()) };
}
/** Audit and durable event are committed with the mutation, never after commit. */
export async function recordMutation(client: PoolClient, actor: MutationActor | { userId: null; requestId: string }, entityType: string, entityId: string,
  action: string, details: Record<string, unknown> = {}): Promise<void> {
  await client.query(`INSERT INTO platform.audit_entries(actor_user_id,action,entity_type,entity_id,request_id,details)
    VALUES($1,$2,$3,$4,$5,$6)`, [actor.userId, action, entityType, entityId, actor.requestId, details]);
  await client.query(`INSERT INTO platform.outbox_events(event_type,aggregate_type,aggregate_id,payload)
    VALUES($1,$2,$3,$4)`, [action, entityType, entityId, { requestId: actor.requestId, actorUserId: actor.userId, ...details }]);
}
