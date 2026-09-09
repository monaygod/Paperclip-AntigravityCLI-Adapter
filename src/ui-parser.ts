export function createStdoutParser() {
  function parseLine(line: string, ts: string): any[] {
    const trimmed = line.trim();
    if (!trimmed) return [];

    try {
      const obj = JSON.parse(trimmed);
      const events = [];

      if (obj.event === "step_update" && obj.step_update) {
        const update = obj.step_update;
        const state = update.state; // ACTIVE, DONE, ERROR
        const stepType = update.step_type; // agent_response, tool, user_input

        if (stepType === "agent_response") {
          if (typeof update.text_delta === "string" && update.text_delta.length > 0) {
            events.push({ kind: "assistant", ts, text: update.text_delta, delta: true });
          }
          if (typeof update.thought_delta === "string" && update.thought_delta.length > 0) {
            events.push({ kind: "thinking", ts, text: update.thought_delta, delta: true });
          }
        }

        if (stepType === "tool" && update.tool_info) {
          const toolUseId = "tool-" + update.step_index;
          
          if (state === "ACTIVE") {
            // Check if this is the start of the tool call (no output/error yet usually, or we can just emit it)
            // To prevent emitting tool_call multiple times for the same step, we could track state,
            // but Paperclip UI deduplicates by toolUseId if needed, or we just emit once.
            // Actually, agy stream-json emits ACTIVE once for tool call?
            // Let's emit tool_call if it has parameters and no output yet.
            if (!("output" in update.tool_info) && !("error" in update.tool_info)) {
              events.push({
                kind: "tool_call",
                ts,
                name: update.tool_name || update.tool_info.name || "unknown",
                input: update.tool_info.parameters || {},
                toolUseId
              });
            }
          }

          if (state === "DONE" || state === "ERROR") {
            const isError = state === "ERROR" || !!update.tool_info.error;
            let content = "";
            if (update.tool_info.output) {
              content = typeof update.tool_info.output === "string" ? update.tool_info.output : JSON.stringify(update.tool_info.output);
            } else if (update.tool_info.error) {
              content = typeof update.tool_info.error === "string" ? update.tool_info.error : JSON.stringify(update.tool_info.error);
            }
            
            events.push({
              kind: "tool_result",
              ts,
              toolUseId,
              content: content,
              isError
            });
          }
        }
      }

      if (events.length > 0) return events;

      // Ignore standard lifecycle events that don't need UI rendering
      if (obj.event === "init" || obj.event === "result" || obj.event === "step_update") {
        return [];
      }
    } catch (e) {
      // not JSON
    }

    return [{ kind: "stdout", ts, text: line }];
  }

  function reset() {}

  return { parseLine, reset };
}
