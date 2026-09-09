import type { AdapterEnvironmentTestContext, AdapterEnvironmentTestResult, AdapterEnvironmentCheck } from "@paperclipai/adapter-utils";
import { asString } from "@paperclipai/adapter-utils/server-utils";

export async function testEnvironment(ctx: AdapterEnvironmentTestContext): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const cwd = asString(ctx.config.cwd, "");
  const command = asString(ctx.config.command, "");

  if (!cwd) {
    checks.push({ code: "missing_cwd", level: "error", message: "cwd is missing" });
  } else {
    checks.push({ code: "cwd_ok", level: "info", message: `cwd is set to ${cwd}` });
  }

  if (!command) {
    checks.push({ code: "missing_command", level: "warn", message: "Command is missing, using default" });
  }

  const hasError = checks.some((c) => c.level === "error");
  const hasWarn = checks.some((c) => c.level === "warn");

  return {
    adapterType: "antigravity_cli",
    testedAt: new Date().toISOString(),
    status: hasError ? "fail" : hasWarn ? "warn" : "pass",
    checks,
  };
}
