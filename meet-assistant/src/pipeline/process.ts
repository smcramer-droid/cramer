import { meetings, actionItems, followups, type Attendee } from "../db.js";
import { fetchTranscript } from "../bot/recall.js";
import { summarize, type Summary } from "./summarize.js";
import { sendMeetingSummary } from "../delivery/gmail.js";
import { createTask } from "../delivery/ticktick.js";
import { config } from "../config.js";

function addDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

export async function processMeeting(botId: string): Promise<void> {
  const meeting = meetings.get(botId);
  if (!meeting) {
    console.warn(`[process] unknown bot id ${botId}`);
    return;
  }
  if (meeting.status === "done") {
    console.log(`[process] ${botId} already done; skipping`);
    return;
  }

  meetings.setStatus(botId, "processing");

  try {
    const { transcript, attendees } = await fetchTranscript(botId);
    meetings.setTranscript(botId, transcript, attendees);

    if (!transcript.trim()) {
      throw new Error("Transcript was empty — bot may not have heard anyone speak.");
    }

    const summary = await summarize(transcript, attendees);
    await fanOutActionItems(botId, summary, attendees);

    await sendMeetingSummary({ summary, attendees }).catch((err) => {
      console.error(`[process] email send failed:`, err);
    });

    meetings.complete(botId, summary);
    console.log(`[process] ${botId} done — ${summary.next_steps.length} next steps`);
  } catch (err) {
    console.error(`[process] ${botId} failed:`, err);
    meetings.setStatus(botId, "failed");
    throw err;
  }
}

async function fanOutActionItems(
  botId: string,
  summary: Summary,
  _attendees: Attendee[],
): Promise<void> {
  const userAttendee: Attendee = {
    name: config.USER_DISPLAY_NAME,
    email: config.USER_EMAIL,
  };

  for (const step of summary.next_steps) {
    const isUser = step.owner === "Me" || step.owner_email === config.USER_EMAIL;
    const id = actionItems.insert({
      meeting_id: botId,
      assignee: isUser ? userAttendee.name : step.owner,
      assignee_email: isUser ? userAttendee.email : step.owner_email,
      is_user: isUser ? 1 : 0,
      task: step.description,
      due_date: step.due_date,
    });

    if (isUser) {
      try {
        const taskId = await createTask({
          title: step.description,
          content: `From meeting: ${summary.title}\nUrgency: ${step.urgency}`,
          dueDate: step.due_date ?? undefined,
          priority: step.urgency === "high" ? 5 : step.urgency === "medium" ? 3 : 1,
          tags: ["meeting-assistant", ...summary.topic_tags],
        });
        actionItems.setTickTickId(id, taskId);
      } catch (err) {
        console.error(`[process] TickTick push failed for item ${id}:`, err);
      }
    }

    if (step.due_date) {
      const followupAt = new Date(`${step.due_date}T09:00:00Z`).toISOString();
      followups.schedule(botId, followupAt, `Due today: ${step.description}`, id);
    }
  }

  for (const f of summary.followup_suggestions) {
    followups.schedule(botId, addDays(f.days_out), f.reason);
  }
}
