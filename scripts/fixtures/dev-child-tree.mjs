import { spawn } from "node:child_process";

const grandchild = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
  stdio: "ignore",
});

console.log(`GRANDCHILD_PID:${grandchild.pid}`);
setInterval(() => {}, 1000);
