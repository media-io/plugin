#!/usr/bin/env node
/**
 * 在公司内部流水线中将 media-plugin-main 源码镜像同步到 GitHub。
 *
 * 发布前会先用 RELEASE_VERSION 统一改写仓库内所有版本号承载点
 * （见 deploy/version-stamp.mjs），再把改写后的工作区快照成一个
 * 发布提交推送到 GitHub，始终 fast-forward，不做 force push。
 *
 * 用法：
 *   RELEASE_VERSION=0.3.0 node deploy/publish-release.mjs sync-source
 *   RELEASE_VERSION=0.3.0 node deploy/publish-release.mjs force-github-baseline
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

import { assertReleaseVersion, stampVersion } from "./version-stamp.mjs";

const packageRoot = resolve(new URL("..", import.meta.url).pathname);
const allowedOperations = new Set(["sync-source", "force-github-baseline"]);
const defaultGithubRepository = "media-io/plugin";
const defaultGithubBranch = "main";
const githubRemoteName = "github-plugin-publish";
const releaseCommitSubjectPrefix = "chore(release): v";
const releaseBotName = "mediaio-release-bot";
const releaseBotEmail = "mediaio-release-bot@users.noreply.github.com";

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
    stdout: (result.stdout ?? "").trim(),
  };
}

function sourceContext() {
  for (const command of ["git", "node"]) {
    if (!tryRun(command, ["--version"]).ok) fail(`缺少命令：${command}`);
  }
  if (run("git", ["rev-parse", "--is-shallow-repository"]) === "true") {
    fail("MAIN checkout 为 shallow repository；请在代码拉取插件中启用完整历史后再发布");
  }
  // 必须先确认 checkout 干净，之后工作区里唯一允许的差异就是版本号改写。
  if (run("git", ["status", "--porcelain"])) {
    fail("MAIN checkout 包含未提交改动，拒绝发布");
  }
  const mainCommit = run("git", ["rev-parse", "HEAD"]);

  const releaseVersion = assertReleaseVersion(requiredEnv("RELEASE_VERSION"));
  const { changed } = stampVersion(releaseVersion);
  for (const file of changed) console.log(`[publish] version stamped: ${file}`);

  return { mainCommit, releaseVersion };
}

function isAncestor(gitAuth, ancestor, descendant) {
  return tryRun("git", ["merge-base", "--is-ancestor", ancestor, descendant], { env: gitAuth.env }).ok;
}

// GitHub main 只允许两种状态：内网提交的祖先，或本脚本此前产生的发布提交。
// 其余情况说明有人直接改了公开仓库，必须人工处理，不能 force push。
function assertRemoteIsPublishable(gitAuth, remoteCommit, mainCommit, githubBranch) {
  if (isAncestor(gitAuth, remoteCommit, mainCommit)) return;

  const subject = run("git", ["log", "-1", "--format=%s", remoteCommit], { env: gitAuth.env });
  const firstParent = tryRun("git", ["rev-parse", `${remoteCommit}^1`], { env: gitAuth.env });
  if (subject.startsWith(releaseCommitSubjectPrefix) && firstParent.ok && isAncestor(gitAuth, firstParent.stdout, mainCommit)) {
    return;
  }
  fail(`GitHub ${githubBranch} 上存在非本脚本产生的提交；请先人工完成镜像基线对齐，不能 force push`);
}

// 把改写过版本号的工作区快照成 tree 对象。
// 使用临时 GIT_INDEX_FILE，不污染 checkout 的真实索引。
function writeWorkingTree(gitAuth) {
  const directory = mkdtempSync(join(tmpdir(), "mediaio-plugin-index-"));
  const env = { ...gitAuth.env, GIT_INDEX_FILE: join(directory, "index") };
  try {
    run("git", ["add", "--all"], { env });
    return run("git", ["write-tree"], { env });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function createReleaseCommit(gitAuth, tree, parents, source) {
  const env = {
    ...gitAuth.env,
    GIT_AUTHOR_NAME: process.env.GIT_COMMITTER_NAME ?? releaseBotName,
    GIT_AUTHOR_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? releaseBotEmail,
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? releaseBotName,
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? releaseBotEmail,
  };
  const args = ["-c", "commit.gpgSign=false", "commit-tree", tree];
  for (const parent of parents) args.push("-p", parent);
  args.push("-m", `${releaseCommitSubjectPrefix}${source.releaseVersion}\n\nmedia-plugin-main@${source.mainCommit}\n`);
  return run("git", args, { env });
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

function syncSource(gitAuth, source, githubBranch) {
  run("git", ["fetch", "--no-tags", githubRemoteName, githubBranch], { env: gitAuth.env });
  const remoteCommit = run("git", ["rev-parse", `${githubRemoteName}/${githubBranch}`], { env: gitAuth.env });
  assertRemoteIsPublishable(gitAuth, remoteCommit, source.mainCommit, githubBranch);

  const tree = writeWorkingTree(gitAuth);
  const remoteTree = run("git", ["rev-parse", `${remoteCommit}^{tree}`], { env: gitAuth.env });
  if (tree === remoteTree) {
    console.log(`[publish] source already synced: ${githubBranch} -> ${remoteCommit}`);
    return;
  }

  // 第一父提交始终是内网 MAIN 提交，历史完整可追溯；
  // 仅当远端头不在内网历史里时才追加为第二父，保证推送永远是 fast-forward。
  const parents = [source.mainCommit];
  if (!isAncestor(gitAuth, remoteCommit, source.mainCommit)) parents.push(remoteCommit);

  const releaseCommit = createReleaseCommit(gitAuth, tree, parents, source);
  run("git", ["push", githubRemoteName, `${releaseCommit}:refs/heads/${githubBranch}`], { env: gitAuth.env });
  console.log(`[publish] source synced: ${githubBranch} -> ${releaseCommit} (v${source.releaseVersion}, media-plugin-main@${source.mainCommit})`);
}

// 仅用于首次把内网 MAIN 建立为 GitHub main 的镜像基线。
// 常规发布绝不能调用此方法，仍由 syncSource 只允许 fast-forward。
function forceGithubBaseline(gitAuth, source, githubRepository, githubBranch) {
  if (githubRepository !== defaultGithubRepository || githubBranch !== defaultGithubBranch) {
    fail("force-github-baseline 仅允许更新 media-io/plugin 的 main 分支");
  }
  if (requiredEnv("GITHUB_BASELINE_FORCE_ACK") !== "REPLACE_GITHUB_MAIN_WITH_INTERNAL_PLUGIN") {
    fail("必须将 GITHUB_BASELINE_FORCE_ACK 设置为 REPLACE_GITHUB_MAIN_WITH_INTERNAL_PLUGIN 才能执行一次性基线覆盖");
  }

  run("git", ["fetch", "--no-tags", githubRemoteName, githubBranch], { env: gitAuth.env });
  const remoteCommit = run("git", ["rev-parse", `${githubRemoteName}/${githubBranch}`], { env: gitAuth.env });
  const releaseCommit = createReleaseCommit(gitAuth, writeWorkingTree(gitAuth), [source.mainCommit], source);
  console.log(`[publish] baseline force: ${githubRepository}/${githubBranch} ${remoteCommit} -> ${releaseCommit}`);
  run("git", [
    "push",
    `--force-with-lease=refs/heads/${githubBranch}:${remoteCommit}`,
    githubRemoteName,
    `${releaseCommit}:refs/heads/${githubBranch}`,
  ], { env: gitAuth.env });

  const remoteHead = run("git", ["ls-remote", githubRemoteName, `refs/heads/${githubBranch}`], { env: gitAuth.env }).split(/\s+/)[0];
  if (remoteHead !== releaseCommit) fail(`GitHub ${githubBranch} 基线覆盖后提交校验失败`);
  console.log(`[publish] baseline force completed: ${githubBranch} -> ${releaseCommit}`);
}

function printUsage() {
  console.log("用法：node deploy/publish-release.mjs <sync-source|force-github-baseline>");
  console.log("需要环境变量 RELEASE_VERSION 与 GITHUB_TOKEN。");
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
  console.log(`[publish] release version: ${source.releaseVersion}`);
  console.log(`[publish] MAIN commit: ${source.mainCommit}`);
  if (operation === "sync-source") {
    syncSource(gitAuth, source, githubBranch);
  } else {
    forceGithubBaseline(gitAuth, source, githubRepository, githubBranch);
  }
} finally {
  if (askPassDirectory) rmSync(askPassDirectory, { recursive: true, force: true });
}
