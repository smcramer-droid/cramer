import { request } from "undici";
import { getAccessToken } from "../auth/ticktick.js";

const API = "https://api.ticktick.com/open/v1";

export interface NewTask {
  title: string;
  content?: string;
  dueDate?: string;
  priority?: 0 | 1 | 3 | 5;
  tags?: string[];
}

export async function createTask(task: NewTask): Promise<string> {
  const token = await getAccessToken();

  const body: Record<string, unknown> = {
    title: task.title,
    content: task.content,
    priority: task.priority ?? 3,
    tags: task.tags ?? ["meeting-assistant"],
  };
  if (task.dueDate) {
    body.dueDate = new Date(`${task.dueDate}T17:00:00Z`).toISOString();
    body.isAllDay = false;
  }

  const res = await request(`${API}/task`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(`TickTick task creation failed ${res.statusCode}: ${text}`);
  }
  const json = JSON.parse(text) as { id?: string };
  if (!json.id) throw new Error(`TickTick returned no task id: ${text}`);
  return json.id;
}
