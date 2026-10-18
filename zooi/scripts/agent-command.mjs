// Both local entry points use the person's unmodified CLI and sign-in.
export function agentCommand(host, extra = [], { interactive = false } = {}) {
  if (host === "codex") return { command: "codex", args: [...(interactive ? [] : ["exec"]), "--sandbox", "workspace-write", ...extra, "$zooi:run"] };
  if (host === "claude") return { command: "claude", args: [...(interactive ? [] : ["-p"]), ...extra, "/zooi:run"] };
  throw new Error("launcher_host_invalid");
}

/** The reminder's read token never enters the agent's environment. */
export const agentEnv = (env) => Object.fromEntries(Object.entries(env).filter(([key]) => key !== "ZOOI_READ_TOKEN" && key !== "CLAUDE_PLUGIN_OPTION_READ_TOKEN"));
