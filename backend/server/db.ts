import mysql, { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { isCampusEmail } from './security.js';

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT) || 3306,
  database: process.env.MYSQL_DATABASE || 'campus_market',
  user: process.env.MYSQL_USER || 'campus_market_app',
  password: process.env.MYSQL_PASSWORD || '',
  connectionLimit: Math.max(2, Number(process.env.MYSQL_CONNECTION_LIMIT) || 10),
  charset: 'utf8mb4',
  timezone: 'Z',
  decimalNumbers: true,
});

export type DbRow = RowDataPacket & Record<string, unknown>;

export async function all<T extends DbRow = DbRow>(sql: string, values: any[] = []) {
  const [rows] = await pool.execute<T[]>(sql, values);
  return rows;
}

export async function one<T extends DbRow = DbRow>(sql: string, values: any[] = []) {
  const rows = await all<T>(sql, values);
  return rows[0];
}

export async function run(sql: string, values: any[] = []) {
  const [result] = await pool.execute<ResultSetHeader>(sql, values);
  return result;
}

export async function initDatabase() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(160) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NULL,
      nickname VARCHAR(24) NOT NULL,
      avatar_url VARCHAR(800) NOT NULL DEFAULT '',
      school_id VARCHAR(40) NOT NULL DEFAULT 'ruc_suzhou',
      wechat_id VARCHAR(40) NOT NULL DEFAULT '',
      verified TINYINT(1) NOT NULL DEFAULT 0,
      email_verified TINYINT(1) NOT NULL DEFAULT 0,
      email_message_notifications TINYINT(1) NOT NULL DEFAULT 1,
      role VARCHAR(10) NOT NULL DEFAULT 'user',
      admin_verified TINYINT(1) NOT NULL DEFAULT 0,
      last_seen_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS email_codes (
      email VARCHAR(160) PRIMARY KEY,
      code_hash CHAR(64) NOT NULL,
      expires_at BIGINT NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      purpose VARCHAR(20) NOT NULL DEFAULT 'register',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      expires_at BIGINT NOT NULL,
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_sessions_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS runtime_secrets (
      secret_name VARCHAR(32) NOT NULL PRIMARY KEY,
      secret_value CHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(80) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      images JSON NOT NULL,
      category VARCHAR(20) NOT NULL,
      item_condition VARCHAR(20) NOT NULL,
      description TEXT NOT NULL,
      school_id VARCHAR(40) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT '在售',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_items_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_items_school_status (school_id, status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS item_embeddings (
      item_id BIGINT UNSIGNED NOT NULL,
      model_name VARCHAR(120) NOT NULL,
      model_version VARCHAR(64) NOT NULL,
      dimensions SMALLINT UNSIGNED NOT NULL,
      normalized TINYINT(1) NOT NULL DEFAULT 1,
      content_hash CHAR(64) NOT NULL,
      embedding JSON NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      retry_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
      next_retry_at TIMESTAMP NULL,
      last_error VARCHAR(255) NOT NULL DEFAULT '',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (item_id,model_version),
      CONSTRAINT fk_item_embeddings_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      INDEX idx_item_embeddings_queue (model_version,status,next_retry_at,updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS behavior_events (
      event_id CHAR(36) NOT NULL PRIMARY KEY,
      request_id CHAR(36) NOT NULL,
      session_id CHAR(36) NOT NULL,
      user_id BIGINT UNSIGNED NULL,
      event_type VARCHAR(32) NOT NULL,
      source VARCHAR(20) NOT NULL,
      item_id BIGINT UNSIGNED NULL,
      query_hash CHAR(64) NULL,
      position SMALLINT UNSIGNED NULL,
      algorithm_version VARCHAR(64) NOT NULL,
      occurred_at TIMESTAMP(3) NOT NULL,
      received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      CONSTRAINT fk_behavior_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
      CONSTRAINT fk_behavior_events_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
      INDEX idx_behavior_request (request_id,event_type),
      INDEX idx_behavior_metrics (source,algorithm_version,event_type,occurred_at),
      INDEX idx_behavior_user (user_id,occurred_at),
      INDEX idx_behavior_item (item_id,occurred_at)
      ,INDEX idx_behavior_retention (received_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS favorites (
      user_id BIGINT UNSIGNED NOT NULL,
      item_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, item_id),
      CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_favorites_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS comments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      item_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      content VARCHAR(200) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_comments_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_comments_item (item_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      item_id BIGINT UNSIGNED NOT NULL,
      buyer_id BIGINT UNSIGNED NOT NULL,
      seller_id BIGINT UNSIGNED NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_conversation (item_id, buyer_id, seller_id),
      CONSTRAINT fk_conversations_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      CONSTRAINT fk_conversations_buyer FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_conversations_seller FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      conversation_id BIGINT UNSIGNED NOT NULL,
      sender_id BIGINT UNSIGNED NOT NULL,
      content VARCHAR(500) NOT NULL,
      message_type VARCHAR(20) NOT NULL DEFAULT 'text',
      item_id BIGINT UNSIGNED NULL,
      item_snapshot JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_messages_conversation (conversation_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS conversation_reads (
      conversation_id BIGINT UNSIGNED NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (conversation_id,user_id),
      CONSTRAINT fk_conversation_reads_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      CONSTRAINT fk_conversation_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_conversation_reads_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS feedback (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      feedback_type VARCHAR(20) NOT NULL,
      content VARCHAR(1000) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT '待处理',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_feedback_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_feedback_status_created (status,created_at),
      INDEX idx_feedback_user_created (user_id,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS reports (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      item_id BIGINT UNSIGNED NOT NULL,
      reporter_id BIGINT UNSIGNED NOT NULL,
      reason VARCHAR(20) NOT NULL,
      detail VARCHAR(500) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT '待处理',
      handled_at TIMESTAMP NULL,
      handler_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_reports_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      CONSTRAINT fk_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_reports_handler FOREIGN KEY (handler_id) REFERENCES users(id) ON DELETE SET NULL,
      INDEX idx_reports_status_created (status,created_at),
      INDEX idx_reports_item (item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
  for (const statement of statements) await pool.query(statement);
  await migrateAdminColumns();
  if(!await columnExists('email_codes','purpose'))await pool.query(`ALTER TABLE email_codes ADD COLUMN purpose VARCHAR(20) NOT NULL DEFAULT 'register' AFTER attempts`);
  await migrateConversations();
  await run('DELETE FROM behavior_events WHERE received_at<DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 90 DAY)');
  await promoteAdminsFromEnv();
  if (process.env.SEED_DEMO_DATA === 'true') await seedDemoData();
}

async function columnExists(table:string,column:string){return Boolean(await one(`SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,[table,column]));}
async function indexExists(table:string,index:string){return Boolean(await one(`SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?`,[table,index]));}

async function migrateAdminColumns(){
  if(!await columnExists('users','role'))await pool.query(`ALTER TABLE users ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'user' AFTER email_message_notifications`);
  if(!await columnExists('users','admin_verified'))await pool.query(`ALTER TABLE users ADD COLUMN admin_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER role`);
}

async function promoteAdminsFromEnv(){
  const emails=(process.env.ADMIN_EMAILS||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
  for(const email of emails){
    await run(`UPDATE users SET role='admin' WHERE email=? AND role<>'admin'`,[email]);
  }
}

async function migrateConversations(){
  if(!await columnExists('users','email_message_notifications'))await pool.query(`ALTER TABLE users ADD COLUMN email_message_notifications TINYINT(1) NOT NULL DEFAULT 1 AFTER email_verified`);
  if(!await columnExists('users','last_seen_at'))await pool.query(`ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMP NULL AFTER email_message_notifications`);
  if(!await columnExists('messages','message_type'))await pool.query(`ALTER TABLE messages ADD COLUMN message_type VARCHAR(20) NOT NULL DEFAULT 'text' AFTER content`);
  if(!await columnExists('messages','item_id'))await pool.query(`ALTER TABLE messages ADD COLUMN item_id BIGINT UNSIGNED NULL AFTER message_type`);
  if(!await columnExists('messages','item_snapshot'))await pool.query(`ALTER TABLE messages ADD COLUMN item_snapshot JSON NULL AFTER item_id`);
  const rows=await all(`SELECT id,item_id,buyer_id,seller_id,updated_at FROM conversations ORDER BY updated_at DESC,id DESC`),winners=new Map<string,DbRow>();
  for(const row of rows){const low=Math.min(Number(row.buyer_id),Number(row.seller_id)),high=Math.max(Number(row.buyer_id),Number(row.seller_id)),key=`${low}:${high}`,winner=winners.get(key);if(!winner){winners.set(key,row);continue}await run('UPDATE messages SET conversation_id=? WHERE conversation_id=?',[winner.id,row.id]);await run('DELETE FROM conversations WHERE id=?',[row.id]);}
  for(const row of winners.values()){const low=Math.min(Number(row.buyer_id),Number(row.seller_id)),high=Math.max(Number(row.buyer_id),Number(row.seller_id));await run('UPDATE conversations SET buyer_id=?,seller_id=? WHERE id=?',[low,high,row.id]);}
  if(!await indexExists('conversations','idx_conversations_item'))await pool.query('ALTER TABLE conversations ADD INDEX idx_conversations_item (item_id)');
  if(!await indexExists('conversations','uniq_participant_pair'))await pool.query('ALTER TABLE conversations ADD UNIQUE KEY uniq_participant_pair (buyer_id,seller_id)');
  if(await indexExists('conversations','uniq_conversation'))await pool.query('ALTER TABLE conversations DROP INDEX uniq_conversation');
}

async function seedDemoData() {
  const existing = await one('SELECT COUNT(*) AS count FROM items');
  if (Number(existing?.count) > 0) return;
  let seller = await one('SELECT id FROM users WHERE email = ?', ['demo-seller@campus.local']);
  if (!seller) {
    const result = await run(`INSERT INTO users (email,nickname,avatar_url,school_id,verified) VALUES (?,?,?,?,1)`,
      ['demo-seller@campus.local','苏园好物铺','https://api.dicebear.com/9.x/notionists/svg?seed=market','ruc_suzhou']);
    seller = { id: result.insertId } as DbRow;
  }
  const products = [
    ['九成新蓝牙机械键盘',168,'电子产品','九成新','宿舍自用，键帽和连接都正常，附充电线。','https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80'],
    ['传播学概论教材与笔记',28,'教材','七成新','重点章节有少量划线，随书附赠课程复习提纲。','https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=900&q=80'],
    ['宿舍桌面暖光台灯',45,'生活用品','九成新','三档亮度，Type-C 供电，适合夜间阅读。','https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80'],
  ];
  for (const [title,price,category,itemCondition,description,image] of products) {
    await run(`INSERT INTO items (user_id,title,price,images,category,item_condition,description,school_id) VALUES (?,?,?,?,?,?,?,'ruc_suzhou')`,
      [seller.id,title,price,JSON.stringify([image]),category,itemCondition,description]);
  }
}

export function publicUser(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    id:Number(row.id), email:String(row.email || ''), nickname:String(row.nickname), avatarUrl:String(row.avatar_url || ''),
    schoolId:String(row.school_id), wechatId:String(row.wechat_id || ''), verified:Boolean(row.verified),
    campusVerified:Boolean(row.admin_verified) || (Boolean(row.email_verified) && isCampusEmail(row.email)),
    emailMessageNotifications:Boolean(row.email_message_notifications),
    adminVerified:Boolean(row.admin_verified),
    role:String(row.role || 'user') === 'admin' ? 'admin' as const : 'user' as const,
  };
}

export function mapItem(row: Record<string, unknown>) {
  const rawImages = row.images;
  const images = Array.isArray(rawImages) ? rawImages : JSON.parse(String(rawImages || '[]'));
  return {
    id:Number(row.id), userId:Number(row.user_id), title:String(row.title), price:Number(row.price), images,
    category:String(row.category), condition:String(row.item_condition), description:String(row.description || ''),
    schoolId:String(row.school_id), status:String(row.status), createdAt:dateIso(row.created_at), updatedAt:dateIso(row.updated_at),
    seller: row.seller_id ? { id:Number(row.seller_id), nickname:String(row.seller_nickname), avatarUrl:String(row.seller_avatar || ''), verified:Boolean(row.seller_email_verified)&&(isCampusEmail(row.seller_email)||Boolean(row.seller_admin_verified)) } : undefined,
  };
}

function dateIso(value:unknown){const date=value instanceof Date?value:new Date(String(value||''));return Number.isNaN(date.getTime())?'':date.toISOString();}
