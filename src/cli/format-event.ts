import pc from "picocolors";

export function formatAntigravityCliStdoutEvent(line: string, debug: boolean): void {
  // Basic fallback
  if (debug) {
    console.log(pc.gray(line));
  } else {
    console.log(line);
  }
}
