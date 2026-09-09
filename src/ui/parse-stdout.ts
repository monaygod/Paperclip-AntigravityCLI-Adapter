import type { TranscriptEntry } from "@paperclipai/adapter-utils";

export function parseAntigravityCliStdoutLine(line: string, ts: string): TranscriptEntry[] {
  // Basic fallback
  return [{ kind: "stdout", ts, text: line }];
}
