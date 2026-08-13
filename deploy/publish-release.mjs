#!/usr/bin/env node
/**
 * 在公司内部流水线中将 media-plugin-main 源码镜像同步到 GitHub。
 *
 * 用法：
 *   node deploy/publish-release.mjs sync-source
 *   node deploy/publish-release.mjs force-github-baseline
 *
 * 不涉及 npm 或 binary 发布；只依赖 Node.js 与 Git。
 */

import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(new URL("..", import.meta.url).pathname);
const allowedOperations = new Set(["sync-source", "force-github-baseline"]);
const defaultGithubRepository = "media-io/plugin";
const defaultGithubBranch = "main";
const githubRemoteName = "github-plugin-publish";

function fail(message) {
  throw new Error(message);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) fail(`缺少环境变量：${name}`);
  return value;
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
  };
}

function sourceContext() {
  for (const command of ["git", "node"]) {
    if (!tryRun(command, ["--version"]).ok) fail(`缺少命令：${command}`);
  }
  if (run("git", ["rev-parse", "--is-shallow-repository"]) === "true") {
    fail("MAIN checkout 为 shallow repository；请在代码拉取插件中启用完整历史后再发布");
  }
  if (run("git", ["status", "--porcelain"])) {
    fail("MAIN checkout 包含未提交改动，拒绝发布");
  }
  return { mainCommit: run("git", ["rev-parse", "HEAD"]) };
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

function configureGithubRemote(gitAuth, githubRepository) {
  const remoteUrl = `https://github.com/${githubRepository}.git`;
  if (tryRun("git", ["remote", "get-url", githubRemoteName], { env: gitAuth.env }).ok) {
    run("git", ["remote", "set-url", githubRemoteName, remoteUrl], { env: gitAuth.env });
  } else {
    run("git", ["remote", "add", githubRemoteName, remoteUrl], { env: gitAuth.env });
  }
}

function syncSource(gitAuth, mainCommit, githubBranch) {
  run("git", ["fetch", "--no-tags", githubRemoteName, githubBranch], { env: gitAuth.env });
  if (!tryRun("git", ["merge-base", "--is-ancestor", `${githubRemoteName}/${githubBranch}`, mainCommit], { env: gitAuth.env }).ok) {
    fail(`GitHub ${githubBranch} 不是当前 MAIN 提交的祖先；请先人工完成镜像基线对齐，不能 force push`);
  }
  run("git", ["push", githubRemoteName, `${mainCommit}:refs/heads/${githubBranch}`], { env: gitAuth.env });
  console.log(`[publish] source synced: ${githubBranch} -> ${mainCommit}`);
}

// 仅用于首次把内网 MAIN 建立为 GitHub main 的镜像基线。
// 常规发布绝不能调用此方法，仍由 syncSource 只允许 fast-forward。
function forceGithubBaseline(gitAuth, mainCommit, githubRepository, githubBranch) {
  if (githubRepository !== defaultGithubRepository || githubBranch !== defaultGithubBranch) {
    fail("force-github-baseline 仅允许更新 media-io/plugin 的 main 分支");
  }
  if (requiredEnv("GITHUB_BASELINE_FORCE_ACK") !== "REPLACE_GITHUB_MAIN_WITH_INTERNAL_PLUGIN") {
    fail("必须将 GITHUB_BASELINE_FORCE_ACK 设置为 REPLACE_GITHUB_MAIN_WITH_INTERNAL_PLUGIN 才能执行一次性基线覆盖");
  }

  run("git", ["fetch", "--no-tags", githubRemoteName, githubBranch], { env: gitAuth.env });
  const remoteCommit = run("git", ["rev-parse", `${githubRemoteName}/${githubBranch}`], { env: gitAuth.env });
  console.log(`[publish] baseline force: ${githubRepository}/${githubBranch} ${remoteCommit} -> ${mainCommit}`);
  run("git", [
    "push",
    `--force-with-lease=refs/heads/${githubBranch}:${remoteCommit}`,
    githubRemoteName,
    `${mainCommit}:refs/heads/${githubBranch}`,
  ], { env: gitAuth.env });

  const remoteHead = run("git", ["ls-remote", githubRemoteName, `refs/heads/${githubBranch}`], { env: gitAuth.env }).split(/\s+/)[0];
  if (remoteHead !== mainCommit) fail(`GitHub ${githubBranch} 基线覆盖后提交校验失败`);
  console.log(`[publish] baseline force completed: ${githubBranch} -> ${mainCommit}`);
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

const githubRepository = process.env.GITHUB_REPOSITORY ?? defaultGithubRepository;
const githubBranch = process.env.GITHUB_BRANCH ?? defaultGithubBranch;
let askPassDirectory = "";

try {
  const source = sourceContext();
  const gitAuth = createGitAskPass(requiredEnv("GITHUB_TOKEN"));
  askPassDirectory = gitAuth.directory;
  configureGithubRemote(gitAuth, githubRepository);

  console.log(`[publish] phase: ${operation}`);
  console.log(`[publish] MAIN commit: ${source.mainCommit}`);
  if (operation === "sync-source") {
    syncSource(gitAuth, source.mainCommit, githubBranch);
  } else {
    forceGithubBaseline(gitAuth, source.mainCommit, githubRepository, githubBranch);
  }
} finally {
  if (askPassDirectory) rmSync(askPassDirectory, { recursive: true, force: true });
}
