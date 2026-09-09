export function parseAntigravityCliOutput(stdout: string) {
  const lines = stdout.split("\n").filter(Boolean);
  const errors: string[] = [];
  let resultJson: any = null;
  
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.event === "result" && obj.result) {
        resultJson = obj.result;
      }
    } catch (e) {
      // Not JSON or other error, just ignore for stream-json
    }
  }

  if (!resultJson) {
    errors.push("Failed to find 'result' event in stream output.");
  }

  return {
    parsed: {
      summary: resultJson?.response || "",
      raw: resultJson || { stdout },
      sessionId: resultJson?.conversation_id || "",
      status: resultJson?.status || "ERROR",
      error: resultJson?.error || "",
    },
    errors,
  };
}

export function isAntigravityCliUnknownSessionError(stdout: string): boolean {
  return stdout.includes("unknown session") || stdout.includes("session not found");
}
