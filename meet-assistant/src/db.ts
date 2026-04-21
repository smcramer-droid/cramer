import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";

mkdirSync(dirname(config.DB_PATH), { recursive: true });

export const db = new Database(config.DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    google_meet_url TEXT NOT NULL,
    title TEXT,
    organizer_email TEXT NOT NULL,
    status TEXT NOT NULL,
    transcript TEXT,
    summary_json TEXT,
    attendees_json TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS action_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT NOT NULL,
    assignee TEXT NOT NULL,
    assignee_email TEXT,
    is_user INTEGER NOT NULL,
    task TEXT NOT NULL,
    due_date TEXT,
    ticktick_task_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS followups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id TEXT NOT NULL,
    action_item_id INTEGER,
    followup_at TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    FOREIGN KEY (action_item_id) REFERENCES action_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS oauth_tokens (
    provider TEXT NOT NULL,
    user_email TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TEXT,
    scope TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (provider, user_email)
  );

  CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);
  CREATE INDEX IF NOT EXISTS idx_action_items_meeting ON action_items(meeting_id);
  CREATE INDEX IF NOT EXISTS idx_followups_pending ON followups(status, followup_at);
`);

export type MeetingStatus =
  | "pending"
  | "recording"
  | "processing"
  | "done"
  | "failed";

export interface Meeting {
  id: string;
  google_meet_url: string;
  title: string | null;
  organizer_email: string;
  status: MeetingStatus;
  transcript: string | null;
  summary_json: string | null;
  attendees_json: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ActionItem {
  id: number;
  meeting_id: string;
  assignee: string;
  assignee_email: string | null;
  is_user: number;
  task: string;
  due_date: string | null;
  ticktick_task_id: string | null;
  created_at: string;
}

export interface Attendee {
  name: string;
  email: string | null;
}

export interface OAuthToken {
  provider: "google" | "ticktick";
  user_email: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  updated_at: string;
}

export const meetings = {
  insert(m: Omit<Meeting, "transcript" | "summary_json" | "attendees_json" | "completed_at">) {
    db.prepare(
      `INSERT INTO meetings (id, google_meet_url, title, organizer_email, status, created_at)
       VALUES (@id, @google_meet_url, @title, @organizer_email, @status, @created_at)`,
    ).run(m);
  },
  get(id: string): Meeting | undefined {
    return db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id) as Meeting | undefined;
  },
  setStatus(id: string, status: MeetingStatus) {
    db.prepare(`UPDATE meetings SET status = ? WHERE id = ?`).run(status, id);
  },
  setTranscript(id: string, transcript: string, attendees: Attendee[]) {
    db.prepare(
      `UPDATE meetings SET transcript = ?, attendees_json = ? WHERE id = ?`,
    ).run(transcript, JSON.stringify(attendees), id);
  },
  complete(id: string, summary: unknown) {
    db.prepare(
      `UPDATE meetings SET status = 'done', summary_json = ?, completed_at = ? WHERE id = ?`,
    ).run(JSON.stringify(summary), new Date().toISOString(), id);
  },
  listRecent(limit = 50): Meeting[] {
    return db
      .prepare(`SELECT * FROM meetings ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Meeting[];
  },
};

export const actionItems = {
  insert(a: Omit<ActionItem, "id" | "ticktick_task_id" | "created_at">): number {
    const created_at = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO action_items (meeting_id, assignee, assignee_email, is_user, task, due_date, created_at)
         VALUES (@meeting_id, @assignee, @assignee_email, @is_user, @task, @due_date, @created_at)`,
      )
      .run({ ...a, created_at });
    return Number(info.lastInsertRowid);
  },
  setTickTickId(id: number, ticktick_task_id: string) {
    db.prepare(`UPDATE action_items SET ticktick_task_id = ? WHERE id = ?`).run(
      ticktick_task_id,
      id,
    );
  },
  listForMeeting(meeting_id: string): ActionItem[] {
    return db
      .prepare(`SELECT * FROM action_items WHERE meeting_id = ? ORDER BY id`)
      .all(meeting_id) as ActionItem[];
  },
};

export const followups = {
  schedule(meeting_id: string, followup_at: string, notes: string, action_item_id?: number) {
    db.prepare(
      `INSERT INTO followups (meeting_id, action_item_id, followup_at, status, notes, created_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
    ).run(meeting_id, action_item_id ?? null, followup_at, notes, new Date().toISOString());
  },
  listDue(now: string) {
    return db
      .prepare(
        `SELECT * FROM followups WHERE status = 'pending' AND followup_at <= ? ORDER BY followup_at`,
      )
      .all(now) as Array<{
      id: number;
      meeting_id: string;
      action_item_id: number | null;
      followup_at: string;
      status: string;
      notes: string;
      created_at: string;
    }>;
  },
  markSent(id: number) {
    db.prepare(`UPDATE followups SET status = 'sent' WHERE id = ?`).run(id);
  },
};

export const tokens = {
  upsert(t: OAuthToken) {
    db.prepare(
      `INSERT INTO oauth_tokens (provider, user_email, access_token, refresh_token, expires_at, scope, updated_at)
       VALUES (@provider, @user_email, @access_token, @refresh_token, @expires_at, @scope, @updated_at)
       ON CONFLICT(provider, user_email) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = COALESCE(excluded.refresh_token, oauth_tokens.refresh_token),
         expires_at = excluded.expires_at,
         scope = excluded.scope,
         updated_at = excluded.updated_at`,
    ).run(t);
  },
  get(provider: OAuthToken["provider"], user_email: string): OAuthToken | undefined {
    return db
      .prepare(`SELECT * FROM oauth_tokens WHERE provider = ? AND user_email = ?`)
      .get(provider, user_email) as OAuthToken | undefined;
  },
};
