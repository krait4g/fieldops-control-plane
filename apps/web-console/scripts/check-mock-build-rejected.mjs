import { spawn } from "node:child_process";

const pnpmCli = process.env.npm_execpath;
const command = pnpmCli ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = pnpmCli ? [pnpmCli, "build"] : ["build"];

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_PUBLIC_FIELDOPS_DATA_MODE: "mock" },
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

child.on("error", (error) => {
  console.error(`Could not execute the mock production build check: ${error.message}`);
  process.exitCode = 1;
});

child.on("close", (code) => {
  const expectedMessage = "NEXT_PUBLIC_FIELDOPS_DATA_MODE=mock is not allowed in production";
  if (code === 0) {
    console.error("Mock production build unexpectedly succeeded.");
    process.exitCode = 1;
    return;
  }
  if (!output.includes(expectedMessage)) {
    console.error("Mock production build failed for an unexpected reason.");
    console.error(output);
    process.exitCode = 1;
    return;
  }
  console.log("Mock production build was rejected by the production-mode guard as expected.");
});
