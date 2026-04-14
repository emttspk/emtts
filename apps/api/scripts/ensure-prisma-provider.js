const { spawnSync } = require("child_process");

function inferProvider(url) {
  if (!url) return null;
  if (url.startsWith("postgresql://") || url.startsWith("postgres://")) return "postgresql";
  if (url.startsWith("mysql://") || url.startsWith("mariadb://")) return "mysql";
  if (url.startsWith("file:")) return "sqlite";
  return null;
}

const url = process.env.DATABASE_URL;
let provider = process.env.DATABASE_PROVIDER;
if (!provider) {
  provider = inferProvider(url);
  if (provider) {
    process.env.DATABASE_PROVIDER = provider;
    console.log(`Inferred DATABASE_PROVIDER=${provider} from DATABASE_URL`);
  }
}

if (!process.env.DATABASE_PROVIDER) {
  console.error("ERROR: DATABASE_PROVIDER is not set and could not be inferred from DATABASE_URL.");
  console.error("Set DATABASE_PROVIDER to postgresql, mysql, or sqlite.");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Expected a command to run after ensure-prisma-provider.js");
  process.exit(1);
}

const command = args[0];
const commandArgs = args.slice(1);
const result = spawnSync(command, commandArgs, {
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
