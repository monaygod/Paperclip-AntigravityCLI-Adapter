export const type = "antigravity_cli";
export const label = "Antigravity CLI Agent";

export const models = [
  { id: "default", label: "Default Model" },
];

export const agentConfigurationDoc = `# antigravity_cli agent configuration

Adapter: antigravity_cli

Use when:
- You need to execute the custom CLI agent.
- You want session persistence across CLI runs.

Core fields:
- cwd (string, required): absolute working directory for the agent process
- command (string, optional): CLI command to execute
- promptTemplate (string, optional): run prompt template
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds
`;
export { createServerAdapter } from './server/index.js';
