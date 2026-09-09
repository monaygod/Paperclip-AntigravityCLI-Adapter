import type { ServerAdapterModule, AdapterSessionCodec } from "@paperclipai/adapter-utils";
import { type, models, agentConfigurationDoc } from "../index.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { listSkills, syncSkills } from "./skills.js";

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) { return typeof raw === "object" ? (raw as Record<string, unknown>) : null; },
  serialize(params) { return params; },
  getDisplayId(params) { return typeof params?.conversationId === "string" ? params.conversationId : null; },
};

export async function listModels() {
  try {
    const { stdout } = await execAsync("agy models");
    const lines = stdout.split("\n");
    const models = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const match = line.match(/^(\S+)\s+(.+)$/);
      if (match) {
        models.push({ id: match[1], label: match[2].trim() });
      }
    }
    return models.reverse();
  } catch (err) {
    return [
      { id: "gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
      { id: "gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" },
      { id: "gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" },
    ];
  }
}

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    sessionCodec,
    models,
    listModels,
    listSkills,
    syncSkills,
    supportsLocalAgentJwt: true,
    supportsInstructionsBundle: true,
    requiresMaterializedRuntimeSkills: true,
    agentConfigurationDoc,
    getConfigSchema: () => ({ fields: [] }),
  };
}
