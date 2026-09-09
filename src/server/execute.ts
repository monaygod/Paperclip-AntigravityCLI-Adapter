import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asString,
  asNumber,
  asBoolean,
  buildPaperclipEnv,
  runChildProcess,
  ensureAbsoluteDirectory,
  renderTemplate,
  selectPaperclipTaskMarkdown,
  renderPaperclipWakePrompt,
  isPaperclipRecoveryWakePayload,
  joinPromptSections,
  readPaperclipRuntimeSkillEntries,
  ensurePaperclipSkillSymlink,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
} from "@paperclipai/adapter-utils/server-utils";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));
import { parseAntigravityCliOutput } from "./parse.js";

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const workspaceContext = ctx.context.paperclipWorkspace as Record<string, unknown> | undefined;
  const workspaceCwd = typeof workspaceContext?.cwd === "string" ? workspaceContext.cwd : "";
  const configuredCwd = asString(ctx.config.cwd, "");
  const cwd = workspaceCwd || configuredCwd || process.cwd();
  const command = asString(ctx.config.command, "agy");
  const timeoutSec = asNumber(ctx.config.timeoutSec, 300);
  const effort = asString(ctx.config.effort, "");
  const dangerouslySkipPermissions = asBoolean(ctx.config.dangerouslySkipPermissions, true);
  
  if (!cwd) {
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: "cwd is required in adapter config",
    };
  }

  const agentsDir = path.join(cwd, ".agents");
  await ensureAbsoluteDirectory(agentsDir, { createIfMissing: true });

  // 1. Write MCP config
  const mcpServers = ctx.runtimeMcp?.getServers() || [];
  if (mcpServers.length > 0) {
    const mcpConfig: any = { mcpServers: {} };
    for (const s of mcpServers) {
      mcpConfig.mcpServers[s.name] = {
        serverUrl: s.url,
        headers: {
          Authorization: `Bearer ${s.token}`,
        },
      };
    }
    await fs.writeFile(
      path.join(agentsDir, "mcp_config.json"),
      JSON.stringify(mcpConfig, null, 2),
      "utf-8"
    );
  }

  // 2. Symlink Paperclip Skills
  const skillsSubdir = path.join(agentsDir, "skills");
  await ensureAbsoluteDirectory(skillsSubdir, { createIfMissing: true });
  const skillEntries = await readPaperclipRuntimeSkillEntries(ctx.config, __moduleDir);
  for (const entry of skillEntries) {
    if (!entry.source) continue;
    const target = path.join(skillsSubdir, entry.runtimeName || entry.key);
    try {
      await ensurePaperclipSkillSymlink(entry.source, target);
    } catch (e) {
      await ctx.onLog("stderr", `[paperclip] Warning: failed to symlink skill ${entry.key}: ${e}\n`);
    }
  }

  // 3. Setup the Paperclip Agent persona
  const instructionsFilePath = asString(ctx.config.instructionsFilePath, "").trim();
  let instructionsContent = "";
  if (instructionsFilePath) {
    try {
      instructionsContent = await fs.readFile(instructionsFilePath, "utf-8");
    } catch (e) {
      await ctx.onLog("stderr", `Warning: could not read instructions file: ${e}\n`);
    }
  }
  
  const agentsSubdir = path.join(agentsDir, "agents");
  await ensureAbsoluteDirectory(agentsSubdir, { createIfMissing: true });
  
  const agentMarkdown = `---
name: paperclip
description: Primary Paperclip Agent
subagent: true
mainAgent: true
---

${instructionsContent}
`;
  await fs.writeFile(path.join(agentsSubdir, "paperclip.md"), agentMarkdown, "utf-8");

  // 3. Build CLI args
  const args = [
    "--output-format", "stream-json",
    "--input-format", "stream-json",
    "--agent", "paperclip",
  ];
  if (dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }
  if (effort) {
    args.push("--effort", effort);
  }
  // If the session has history, we can pass it
  const sessionParams = ctx.runtime?.sessionParams as any;
  if (sessionParams && sessionParams.conversationId) {
    args.push("--conversation", sessionParams.conversationId);
  }

  const procEnv = { ...buildPaperclipEnv(ctx.agent), ...process.env } as Record<string, string>;
  
  const rawPromptTemplate = asString(ctx.config.promptTemplate, "");
  const promptTemplate = rawPromptTemplate.trim().length > 0 ? rawPromptTemplate : DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE;
  const bootstrapPromptTemplate = asString(ctx.config.bootstrapPromptTemplate, "");
  
  const templateData = {
    agentId: ctx.agent.id,
    companyId: ctx.agent.companyId,
    runId: ctx.runId,
    company: { id: ctx.agent.companyId },
    agent: ctx.agent,
    run: { id: ctx.runId, source: "on_demand" },
    context: ctx.context,
  };
  
  const sessionId = sessionParams?.conversationId;
  const renderedBootstrapPrompt =
    !sessionId && bootstrapPromptTemplate.trim().length > 0
      ? renderTemplate(bootstrapPromptTemplate, templateData).trim()
      : "";
  const taskContextNote = selectPaperclipTaskMarkdown(ctx.context, { resumedSession: Boolean(sessionId) });
  const wakePrompt = renderPaperclipWakePrompt(ctx.context.paperclipWake, {
    resumedSession: Boolean(sessionId),
    suppressIssueDescription: taskContextNote.length > 0,
  });
  const shouldUseResumeDeltaPrompt = Boolean(sessionId) && wakePrompt.length > 0;
  const renderedPrompt = shouldUseResumeDeltaPrompt || isPaperclipRecoveryWakePayload(ctx.context.paperclipWake)
    ? ""
    : renderTemplate(promptTemplate, templateData);
  const sessionHandoffNote = asString(ctx.context.paperclipSessionHandoffMarkdown, "").trim();
  let prompt = joinPromptSections([
    renderedBootstrapPrompt,
    wakePrompt,
    sessionHandoffNote,
    taskContextNote,
    renderedPrompt,
  ]);
  
  if (prompt.trim().length === 0) {
    prompt = "Please start your task.";
  }

  await ctx.onMeta?.({
    adapterType: "antigravity_cli",
    command,
    commandArgs: args,
    prompt,
    promptMetrics: {
      promptChars: prompt.length,
      bootstrapPromptChars: renderedBootstrapPrompt.length,
      wakePromptChars: wakePrompt.length,
      sessionHandoffChars: sessionHandoffNote.length,
      taskContextChars: taskContextNote.length,
      heartbeatPromptChars: renderedPrompt.length,
    },
    context: ctx.context,
  });

  const jsonPayload = JSON.stringify({
    event: "user",
    message: { content: prompt },
  }) + "\n";

  const proc = await runChildProcess(ctx.runId, command, args, {
    cwd,
    env: procEnv,
    stdin: jsonPayload,
    timeoutSec,
    graceSec: 15,
    onLog: async (stream: "stdout" | "stderr", chunk: string) => {
      await ctx.onLog(stream, chunk);
    },
  });

  const { parsed, errors } = parseAntigravityCliOutput(proc.stdout);
  
  const failed = proc.exitCode !== 0 || parsed.status === "ERROR";

  return {
    exitCode: proc.exitCode,
    signal: proc.signal,
    timedOut: proc.timedOut,
    errorMessage: failed ? parsed.error || errors.join(", ") : undefined,
    summary: parsed.summary,
    resultJson: parsed.raw,
    sessionId: parsed.sessionId || undefined,
    sessionParams: parsed.sessionId ? { conversationId: parsed.sessionId } : undefined,
  };
}
