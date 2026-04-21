import cron from "node-cron";
import { followups, meetings, actionItems } from "../db.js";
import { sendFollowupEmail } from "../delivery/gmail.js";
import { config } from "../config.js";

async function processDueFollowups(): Promise<void> {
  const due = followups.listDue(new Date().toISOString());
  if (!due.length) return;

  console.log(`[followup] ${due.length} follow-ups due`);

  const byMeeting = new Map<string, typeof due>();
  for (const f of due) {
    const list = byMeeting.get(f.meeting_id) ?? [];
    list.push(f);
    byMeeting.set(f.meeting_id, list);
  }

  for (const [meetingId, items] of byMeeting) {
    const meeting = meetings.get(meetingId);
    if (!meeting) continue;

    const lines: string[] = [];
    lines.push(`# Follow-up: ${meeting.title ?? "(untitled meeting)"}`);
    lines.push("");
    lines.push(`From ${meeting.created_at.slice(0, 10)}. Quick checkpoint:`);
    lines.push("");
    for (const f of items) {
      lines.push(`- ${f.notes}`);
    }

    const openUserItems = actionItems
      .listForMeeting(meetingId)
      .filter((a) => a.is_user === 1);
    if (openUserItems.length) {
      lines.push("");
      lines.push("## Your open items");
      for (const a of openUserItems) {
        const due = a.due_date ? ` _(due ${a.due_date})_` : "";
        lines.push(`- ${a.task}${due}`);
      }
    }

    try {
      await sendFollowupEmail({
        subject: `Follow-up: ${meeting.title ?? "meeting"}`,
        bodyMarkdown: lines.join("\n"),
        to: [config.USER_EMAIL],
      });
      for (const f of items) followups.markSent(f.id);
    } catch (err) {
      console.error(`[followup] email failed for meeting ${meetingId}:`, err);
    }
  }
}

export function startScheduler() {
  cron.schedule("*/15 * * * *", () => {
    processDueFollowups().catch((err) =>
      console.error("[followup] scheduler error:", err),
    );
  });
  console.log("[followup] scheduler started (every 15 minutes)");
}
