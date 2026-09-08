import { spawn } from "node:child_process";

const pnpmCli = process.env.npm_execpath;
const command = pnpmCli ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = pnpmCli
  ? [pnpmCli, "--filter", "@fieldops/web-console", "build"]
  : ["--filter", "@fieldops/web-console", "build"];

const child = spawn(command, args, {
  env: { ...process.env, NEXT_PUBLIC_FIELDOPS_DATA_MODE: "remote" },
  shell: false,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Could not execute the remote production build: ${error.message}`);
  process.exitCode = 1;
});
child.on("close", (code) => {
  process.exitCode = code ?? 1;
});
