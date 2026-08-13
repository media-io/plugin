#!/usr/bin/env node
/**
 * 在公司内部流水线中同步 @mediaio/cli 源码。
 *
 * 用法：
 *   node deploy/publish-release.mjs sync-source
 *   node deploy/publish-release.mjs force-github-baseline
 *
 * 不依赖 gh、jq 或 GitHub Actions；只依赖 Node.js 与 Git。
 */

import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(new URL("..", import.meta.url).pathname);
const packageName = "@mediaio/cli";
const allowedOperations = new Set([
  "sync-source",
  "force-github-baseline",
]);

function fail(message) {
  throw new Error(message);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) fail(`缺少环境变量：${name}`);
  return value;
}

function assertSemVer(version) {
  if (!/^[0-9]+\.[0-9]+\.[0-9]+([-.][0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`RELEASE_VERSION 不是合法的 SemVer：${version}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? packageRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) fail(`${command} 无法执行：${result.error.message}`);
  if (result.status !== 0) fail(`${command} 执行失败，退出码：${result.status}`);
  return result.stdout.trim();
}

function tryRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? packageRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
  };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`无法读取 JSON 文件 ${file}：${error.message}`);
  }
}

function createGitAskPass(token) {
  const directory = mkdtempSync(join(tmpdir(), "mediaio-github-askpass-"));
  const script = join(directory, "askpass.sh");
  writeFileSync(
    script,
    `#!/usr/bin/env bash\ncase "$1" in\n  *Username*) printf '%s\\n' 'x-access-token' ;;\n  *Password*) printf '%s\\n' "$GITHUB_TOKEN" ;;\n  *) exit 1 ;;\nesac\n`,
    { mode: 0o700 },
  );
  return {
    directory,
    env: {
      ...process.env,
      GITHUB_TOKEN: token,
      GIT_ASKPASS: script,
      GIT_TERMINAL_PROMPT: "0",
    },
  };
}

function sourceContext(releaseVersion) {
  for (const command of ["git", "node"]) {
    if (!tryRun(command, ["--version"]).ok) fail(`缺少命令：${command}`);
  }

  const pkg = readJson(join(packageRoot, "package.json"));
  if (pkg.name !== packageName) fail(`正式发布包名必须是 ${packageName}，当前为：${pkg.name}`);
  if (pkg.version !== releaseVersion) {
    fail(`package.json.version (${pkg.version}) 必须等于 RELEASE_VERSION (${releaseVersion})`);
  }

  const cliCommit = run("git", ["rev-parse", "HEAD"]);
  if (run("git", ["rev-parse", "--is-shallow-repository"]) === "true") {
    fail("CLI checkout 为 shallow repository；请在代码拉取插件中启用完整历史后再发布");
  }
  if (process.env.CLI_RELEASE_COMMIT && process.env.CLI_RELEASE_COMMIT !== cliCommit) {
    fail("当前 CLI checkout 与 CLI_RELEASE_COMMIT 不一致");
  }
  return { cliCommit };
}

function configureGithubRemote(githubToken, githubRepository) {
  const gitAuth = createGitAskPass(githubToken);
  askPassDirectory = gitAuth.directory;
  const remoteName = "github-publish";
  const remoteUrl = `https://github.com/${githubRepository}.git`;
  if (tryRun("git", ["remote", "get-url", remoteName], { env: gitAuth.env }).ok) {
    run("git", ["remote", "set-url", remoteName, remoteUrl], { env: gitAuth.env });
  } else {
    run("git", ["remote", "add", remoteName, remoteUrl], { env: gitAuth.env });
  }
  return { ...gitAuth, remoteName };
}

function syncSource(gitAuth, cliCommit, githubBranch) {
  run("git", ["fetch", "--no-tags", gitAuth.remoteName, githubBranch], { env: gitAuth.env });
  if (!tryRun("git", ["merge-base", "--is-ancestor", `${gitAuth.remoteName}/${githubBranch}`, cliCommit], { env: gitAuth.env }).ok) {
    fail(`GitHub ${githubBranch} 不是当前 CLI 提交的祖先；请先人工完成镜像基线对齐，不能 force push`);
  }
  run("git", ["push", gitAuth.remoteName, `${cliCommit}:refs/heads/${githubBranch}`], { env: gitAuth.env });
  console.log(`[publish] source synced: ${githubBranch} -> ${cliCommit}`);
}

// 仅用于首次把内网 CLI 建立为 GitHub main 的镜像基线。
// 常规发布绝不能调用此方法，仍由 syncSource 只允许 fast-forward。
function forceGithubBaseline(gitAuth, cliCommit, githubRepository, githubBranch) {
  if (githubRepository !== "media-io/cli" || githubBranch !== "main") {
    fail("force-github-baseline 仅允许更新 media-io/cli 的 main 分支");
  }
  if (requiredEnv("GITHUB_BASELINE_FORCE_ACK") !== "REPLACE_GITHUB_MAIN_WITH_INTERNAL_CLI") {
    fail("必须将 GITHUB_BASELINE_FORCE_ACK 设置为 REPLACE_GITHUB_MAIN_WITH_INTERNAL_CLI 才能执行一次性基线覆盖");
  }

  run("git", ["fetch", "--no-tags", gitAuth.remoteName, githubBranch], { env: gitAuth.env });
  const remoteCommit = run("git", ["rev-parse", `${gitAuth.remoteName}/${githubBranch}`], { env: gitAuth.env });
  console.log(`[publish] baseline force: ${githubRepository}/${githubBranch} ${remoteCommit} -> ${cliCommit}`);
  run("git", [
    "push",
    `--force-with-lease=refs/heads/${githubBranch}:${remoteCommit}`,
    gitAuth.remoteName,
    `${cliCommit}:refs/heads/${githubBranch}`,
  ], { env: gitAuth.env });

  const remoteHead = run("git", ["ls-remote", gitAuth.remoteName, `refs/heads/${githubBranch}`], { env: gitAuth.env }).split(/\s+/)[0];
  if (remoteHead !== cliCommit) fail(`GitHub ${githubBranch} 基线覆盖后提交校验失败`);
  console.log(`[publish] baseline force completed: ${githubBranch} -> ${cliCommit}`);
}

function printUsage() {
  console.log("用法：node deploy/publish-release.mjs <sync-source|force-github-baseline>");
}

const operation = process.argv[2];
if (operation === "--help" || operation === "-h") {
  printUsage();
  process.exit(0);
}
if (process.argv.length > 3 || !allowedOperations.has(operation)) {
  printUsage();
  fail(`不支持的发布阶段：${operation}`);
}

const releaseVersion = requiredEnv("RELEASE_VERSION");
assertSemVer(releaseVersion);
const githubRepository = process.env.GITHUB_REPOSITORY ?? "media-io/cli";
const githubBranch = process.env.GITHUB_BRANCH ?? "main";
let askPassDirectory = "";

try {
  const source = sourceContext(releaseVersion);
  console.log(`[publish] phase: ${operation}`);
  console.log(`[publish] release: ${releaseVersion}`);
  console.log(`[publish] CLI commit: ${source.cliCommit}`);

  if (operation === "sync-source") {
    const githubToken = requiredEnv("GITHUB_TOKEN");
    const gitAuth = configureGithubRemote(githubToken, githubRepository);
    syncSource(gitAuth, source.cliCommit, githubBranch);
  } else if (operation === "force-github-baseline") {
    const githubToken = requiredEnv("GITHUB_TOKEN");
    const gitAuth = configureGithubRemote(githubToken, githubRepository);
    forceGithubBaseline(gitAuth, source.cliCommit, githubRepository, githubBranch);
  }
} finally {
  if (askPassDirectory) rmSync(askPassDirectory, { recursive: true, force: true });
}
