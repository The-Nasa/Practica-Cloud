import { Injectable,NotFoundException } from '@nestjs/common';
import {ListQueryDto,pageOf} from '../../../platform/http/list-query.dto';
import { DatabaseService } from '../../../platform/database/database.service';
import { randomUUID } from 'crypto';

@Injectable()
export class PlatformService {
  constructor(private readonly db: DatabaseService) {}

  async notificationPage(userId:string,q:ListQueryDto){
    const rows=(await this.db.query(`SELECT id,title,message,kind,relative_url AS "relativeUrl",read_at AS "readAt",created_at AS "createdAt" FROM platform.notifications WHERE user_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,[userId,q.cursor||null,q.limit+1])).rows;
    const count=(await this.db.query('SELECT count(*)::int AS n FROM platform.notifications WHERE user_id=$1 AND read_at IS NULL',[userId])).rows[0].n;
    return {...pageOf(rows,q.limit),unreadCount:count};
  }
  async readOwn(userId:string,id?:string){
    if(id){const r=await this.db.query('UPDATE platform.notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id',[id,userId]);if(!r.rowCount)throw new NotFoundException('Notificación no disponible');}
    else await this.db.query('UPDATE platform.notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',[userId]);
  }

  async getUserNotifications(userId: string) {
    const res = await this.db.query(
      `SELECT id, title, message, kind, relative_url, read_at, created_at
       FROM platform.notifications
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [userId],
    );
    return res.rows;
  }

  async markNotificationRead(id: string, userId: string) {
    await this.db.query(
      `UPDATE platform.notifications
       SET read_at = now()
       WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
      [id, userId],
    );
  }

  async recordAudit(
    action: string,
    resourceType: string,
    resourceId: string,
    userId: string | null,
    details: Record<string, any> = {},
    requestId: string = randomUUID(),
  ) {
    await this.db.query(
      `INSERT INTO platform.audit_entries (action, entity_type, entity_id, actor_user_id, details, request_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [action, resourceType, resourceId, userId, JSON.stringify(details), requestId],
    );
  }
}
