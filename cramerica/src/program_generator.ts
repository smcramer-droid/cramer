import { finalizeAssessment } from "./assessment";
import { logError } from "./db";
import type { Env } from "./types";

// Kicks off program generation in the ProgramGenerator DO. Returns as soon
// as the alarm is scheduled — the actual Anthropic call and Telegram reply
// happen inside the DO's alarm() handler.
export async function triggerProgramGeneration(env: Env): Promise<void> {
  const id = env.PROGRAM_GEN.idFromName("singleton");
  const stub = env.PROGRAM_GEN.get(id);
  await stub.fetch("https://do.internal/run", { method: "POST" });
}

// Runs program generation off the Worker request path. The request handler
// triggers this DO via fetch() and returns immediately; the DO schedules an
// immediate alarm, and alarm() runs the Anthropic call with the DO's 15min
// wall-clock budget (vs. the Worker's 30s).
export class ProgramGenerator {
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(_req: Request): Promise<Response> {
    await this.state.storage.setAlarm(Date.now());
    return new Response("scheduled");
  }

  async alarm(): Promise<void> {
    try {
      await finalizeAssessment(this.env);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : null;
      console.error("program_generator alarm failed", err);
      await logError(this.env, "program_generator.alarm", msg, { stack });
    }
  }
}
