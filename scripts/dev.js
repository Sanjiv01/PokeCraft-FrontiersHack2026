/* global process */
import { spawn } from "node:child_process";

function start(name, command, args) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`);
    }
    process.exit(code ?? 0);
  });

  return child;
}

const children = [
  start("server", "npm", ["--prefix", "server", "run", "dev"]),
  start("client", "npm", ["run", "dev:client"]),
];

function shutdown(signal) {
  for (const child of children) {
    child.kill(signal);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
