import type { ExecutorAdapter } from "./executor.js";

function nowIso(): string {
  return new Date().toISOString();
}

export function createEchoExecutor(): ExecutorAdapter {
  return {
    id: "echo",
    displayName: "Echo Executor",
    async canRun() {
      return { ready: true };
    },
    async run(input, sink) {
      await sink.emit({
        type: "executor.started",
        message: `Echo executor started for ${input.runId}`,
        at: nowIso()
      });
      await sink.emit({
        type: "executor.completed",
        message: `Echo executor completed for ${input.runId}`,
        at: nowIso()
      });
      return {
        conclusion: "success",
        summary: `Echoed OpenTag command: ${input.command.rawText}`,
        verification: [
          {
            command: "echo",
            outcome: "passed",
            excerpt: input.command.rawText
          }
        ],
        nextAction: {
          summary: "No external state change is suggested for the echo executor result.",
          hint: { kind: "none" }
        }
      };
    },
    async cancel() {
      return;
    }
  };
}
