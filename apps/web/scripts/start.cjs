const { spawnSync } = require("node:child_process");

const port = String(process.env.PORT || 3000);
const result = spawnSync("npx", ["--yes", "serve", "dist", "-s", "-l", port], {
  stdio: "inherit",
  shell: true,
});

if (typeof result.status === "number") {
  process.exit(result.status);
}

if (result.error) {
  console.error(result.error);
}
process.exit(1);
