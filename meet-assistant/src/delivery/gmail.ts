import { google } from "googleapis";
import { config } from "../config.js";
import { authedClient } from "../auth/google.js";
import type { Summary } from "../pipeline/summarize.js";
import type { Attendee } from "../db.js";

function renderSummaryMarkdown(summary: Summary, userLabel: string): string {
  const lines: string[] = [];
  lines.push(`# ${summary.title}`);
  lines.push("");
  lines.push(summary.tldr);
  lines.push("");

  if (summary.key_decisions.length) {
    lines.push("## Decisions");
    summary.key_decisions.forEach((d) => lines.push(`- ${d}`));
    lines.push("");
  }

  if (summary.next_steps.length) {
    lines.push("## Next steps");
    summary.next_steps.forEach((s) => {
      const ownerLabel = s.owner === "Me" ? userLabel : s.owner;
      const due = s.due_date ? ` (due ${s.due_date})` : "";
      const urgency = s.urgency === "high" ? " ⚡" : "";
      lines.push(`- **${ownerLabel}**${urgency}: ${s.description}${due}`);
    });
    lines.push("");
  }

  if (summary.topic_tags.length) {
    lines.push(`*Topics: ${summary.topic_tags.join(", ")}*`);
  }

  return lines.join("\n");
}

function markdownToHtml(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  const out: string[] = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith("# ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h2 style="margin:16px 0 8px">${escape(line.slice(2))}</h2>`);
    } else if (line.startsWith("## ")) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h3 style="margin:16px 0 4px">${escape(line.slice(3))}</h3>`);
    } else if (line.startsWith("- ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      const body = escape(line.slice(2))
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      out.push(`<li style="margin:4px 0">${body}</li>`);
    } else if (line.trim() === "") {
      if (inList) { out.push("</ul>"); inList = false; }
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      const body = escape(line)
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>");
      out.push(`<p style="margin:8px 0">${body}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;color:#111;line-height:1.5">${out.join(
    "",
  )}</div>`;
}

function buildMime(opts: {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html: string;
}): string {
  const boundary = `----=_meet_assistant_${Date.now()}`;
  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(", ")}`,
    opts.cc && opts.cc.length ? `Cc: ${opts.cc.join(", ")}` : "",
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter(Boolean);

  const body = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.html,
    "",
    `--${boundary}--`,
  ];

  return [...headers, "", ...body].join("\r\n");
}

function b64url(raw: string): string {
  return Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendMeetingSummary(opts: {
  summary: Summary;
  attendees: Attendee[];
}): Promise<{ messageId: string; recipients: string[] }> {
  const client = authedClient(config.USER_EMAIL);
  const gmail = google.gmail({ version: "v1", auth: client });

  const recipients = opts.attendees
    .map((a) => a.email)
    .filter((e): e is string => !!e && e !== config.USER_EMAIL);

  if (recipients.length === 0) {
    throw new Error(
      "No attendee emails to send to. Recall can only return emails when the meeting host has them; invite the bot to a meeting where attendees are signed in with Google.",
    );
  }

  const md = renderSummaryMarkdown(opts.summary, config.USER_DISPLAY_NAME);
  const html = markdownToHtml(md);
  const mime = buildMime({
    from: `${config.USER_DISPLAY_NAME} <${config.USER_EMAIL}>`,
    to: recipients,
    subject: `Notes: ${opts.summary.title}`,
    text: md,
    html,
  });

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: b64url(mime) },
  });
  return { messageId: res.data.id ?? "", recipients };
}

export async function sendFollowupEmail(opts: {
  subject: string;
  bodyMarkdown: string;
  to: string[];
}): Promise<string> {
  const client = authedClient(config.USER_EMAIL);
  const gmail = google.gmail({ version: "v1", auth: client });
  const mime = buildMime({
    from: `${config.USER_DISPLAY_NAME} <${config.USER_EMAIL}>`,
    to: opts.to,
    subject: opts.subject,
    text: opts.bodyMarkdown,
    html: markdownToHtml(opts.bodyMarkdown),
  });
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: b64url(mime) },
  });
  return res.data.id ?? "";
}
