import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildAntigravityCliConfig(v: CreateConfigValues): Record<string, unknown> {
  const anyV = v as any;
  const ac: Record<string, unknown> = {};
  if (anyV.cwd) ac.cwd = anyV.cwd;
  if (anyV.command) ac.command = anyV.command;
  if (anyV.promptTemplate) ac.promptTemplate = anyV.promptTemplate;
  ac.timeoutSec = Number(anyV.timeoutSec) || 300;
  ac.graceSec = Number(anyV.graceSec) || 15;
  return ac;
}
