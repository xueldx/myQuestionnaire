const { spawn } = require("child_process");
const path = require("path");

const mode = process.argv[2] || "development";

const appDir = path.resolve(__dirname, "..");

const resolveNestCli = () => {
  try {
    return require.resolve("@nestjs/cli/bin/nest.js", {
      paths: [appDir],
    });
  } catch (error) {
    return path.join(appDir, "node_modules", "@nestjs", "cli", "bin", "nest.js");
  }
};

const getCommandArgs = () => {
  if (mode === "development") {
    return [resolveNestCli(), "start", "--watch"];
  }

  return [path.join(appDir, "dist", "main.js")];
};

const child = spawn(process.execPath, getCommandArgs(), {
  stdio: "inherit",
  cwd: appDir,
  env: {
    ...process.env,
    NODE_ENV: mode,
  },
});

child.on("exit", code => {
  process.exit(code ?? 0);
});
