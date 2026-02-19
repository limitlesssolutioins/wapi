import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = path.resolve(__dirname, '../../database.sqlite');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    groupId TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(groupId) REFERENCES groups(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    templateId TEXT NOT NULL,
    sessionIds TEXT, -- JSON array of session IDs
    status TEXT NOT NULL, -- QUEUED, PROCESSING, COMPLETED, FAILED, PAUSED
    scheduleTime TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    completedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS campaign_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,
    contactId TEXT, -- Optional link to contacts table
    phone TEXT NOT NULL,
    name TEXT,
    status TEXT DEFAULT 'PENDING', -- PENDING, SENT, FAILED
    error TEXT,
    sentAt TEXT,
    FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    message TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    status TEXT, -- SENT, FAILED, RECEIVED, PENDING
    direction TEXT, -- INCOMING, OUTGOING
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sms_gateways (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    endpoint TEXT NOT NULL,
    token TEXT,
    isActive INTEGER DEFAULT 1,
    createdAt TEXT DEFAULT (datetime('now')),
    updatedAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sms_campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    message TEXT NOT NULL,
    gatewayIds TEXT NOT NULL, -- JSON array of gateway IDs
    status TEXT NOT NULL, -- QUEUED, PROCESSING, COMPLETED, FAILED, CANCELLED
    scheduleTime TEXT,
    createdAt TEXT DEFAULT (datetime('now')),
    completedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL,
    contactId TEXT,
    phone TEXT NOT NULL,
    name TEXT,
    gatewayId TEXT,
    status TEXT DEFAULT 'PENDING', -- PENDING, SENT, FAILED
    error TEXT,
    sentAt TEXT,
    FOREIGN KEY(campaign_id) REFERENCES sms_campaigns(id) ON DELETE CASCADE
  );
  
  -- Create indexes for performance
  CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
  CREATE INDEX IF NOT EXISTS idx_campaigns_name ON campaigns(name);
  CREATE INDEX IF NOT EXISTS idx_campaigns_templateId ON campaigns(templateId);
  CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
  CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_sms_campaigns_status ON sms_campaigns(status);
  CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_campaign_id ON sms_campaign_recipients(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_sms_campaign_recipients_status ON sms_campaign_recipients(status);
  CREATE INDEX IF NOT EXISTS idx_sms_gateways_name ON sms_gateways(name);
`);

// MIGRATION: Check if 'imageUrl' and 'name' columns exist
try {
    // Check contacts
    const contactInfo = db.pragma('table_info(contacts)') as any[];
    if (!contactInfo.some(col => col.name === 'name')) {
        db.exec('ALTER TABLE contacts ADD COLUMN name TEXT DEFAULT ""');
    }

    // Check templates for imageUrl
    const templateInfo = db.pragma('table_info(templates)') as any[];
    if (!templateInfo.some(col => col.name === 'imageUrl')) {
        db.exec('ALTER TABLE templates ADD COLUMN imageUrl TEXT');
    }

    // Check campaigns for imageUrl
    const campaignInfo = db.pragma('table_info(campaigns)') as any[];
    if (!campaignInfo.some(col => col.name === 'imageUrl')) {
        db.exec('ALTER TABLE campaigns ADD COLUMN imageUrl TEXT');
    }
    if (!campaignInfo.some(col => col.name === 'blitzMode')) {
        db.exec('ALTER TABLE campaigns ADD COLUMN blitzMode INTEGER DEFAULT 0');
    }

    // Check contacts for groupId
    const contactInfoGroup = db.pragma('table_info(contacts)') as any[];
    if (!contactInfoGroup.some(col => col.name === 'groupId')) {
        db.exec('ALTER TABLE contacts ADD COLUMN groupId TEXT');
    }
} catch (error) {
    console.error('Migration failed:', error);
}

// Seed default admin user
try {
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    if (!user) {
        const salt = bcrypt.genSaltSync(10);
        // Default password is 'password'
        const hash = bcrypt.hashSync('password', salt);
        db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
          .run('admin', hash);
        console.log('Default admin user created.');
    }
} catch (error) {
    console.error('Failed to seed admin user:', error);
}


export default db;
