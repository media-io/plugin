#!/usr/bin/env node
/**
 * 在公司内部流水线中将本仓库的 skills/ 同步到 media-io/skills 根目录。
 *
 * 用法：
 *   node deploy/publish-release.mjs sync-source
 *   node deploy/publish-release.mjs force-github-baseline
 *
 * 本脚本只用于公司内部流水线；不涉及 npm 发布，也不依赖 gh、jq 或 GitHub Actions。
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(new URL("..", import.meta.url).pathname);
const skillsDirectory = join(packageRoot, "skills");
const githubRepository = "media-io/skills";
const githubBranch = "main";
const manifestName = ".mediaio-skills-sync.json";
const allowedOperations = new Set(["sync-source", "force-github-baseline"]);

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

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(`无法读取 JSON 文件 ${file}：${error.message}`);
  }
}

function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function assertNoSymbolicLinks(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) fail(`Skills 源目录不允许符号链接：${path}`);
    if (entry.isDirectory()) assertNoSymbolicLinks(path);
  }
}

function sourceSkillNames() {
  if (!pathExists(skillsDirectory) || !statSync(skillsDirectory).isDirectory()) {
    fail(`Skills 源目录不存在：${skillsDirectory}`);
  }
  assertNoSymbolicLinks(skillsDirectory);

  const names = readdirSync(skillsDirectory, { withFileTypes: true })
    .filter((entry) => entry.name !== ".DS_Store")
    .map((entry) => {
      if (!entry.isDirectory()) fail(`Skills 源目录只能包含 Skill 子目录：${entry.name}`);
      const skillFile = join(skillsDirectory, entry.name, "SKILL.md");
      if (!pathExists(skillFile) || !statSync(skillFile).isFile()) {
        fail(`Skill 子目录缺少 SKILL.md：${entry.name}`);
      }
      return entry.name;
    })
    .sort();

  if (names.length === 0) fail("Skills 源目录不能为空");
  return names;
}

function sourceContext() {
  for (const command of ["git", "node"]) {
    if (!tryRun(command, ["--version"]).ok) fail(`缺少命令：${command}`);
  }

  const expectedCommit = requiredEnv("SKILLS_RELEASE_COMMIT");
  if (!/^[0-9a-f]{40}$/i.test(expectedCommit)) {
    fail("SKILLS_RELEASE_COMMIT 必须是完整的 40 位 Git commit SHA");
  }
  if (run("git", ["rev-parse", "--is-shallow-repository"]) === "true") {
    fail("Skills checkout 为 shallow repository；请在代码拉取插件中启用完整历史后再发布");
  }
  if (run("git", ["status", "--porcelain"])) {
    fail("Skills checkout 包含未提交改动，拒绝发布");
  }

  const sourceCommit = run("git", ["rev-parse", "HEAD"]);
  if (sourceCommit !== expectedCommit) {
    fail("当前 Skills checkout 与 SKILLS_RELEASE_COMMIT 不一致");
  }
  return { sourceCommit, skillNames: sourceSkillNames() };
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

function cloneGithubSkills(gitAuth) {
  const directory = mkdtempSync(join(tmpdir(), "mediaio-skills-publish-"));
  const remoteUrl = `https://github.com/${githubRepository}.git`;
  run("git", ["clone", "--quiet", "--branch", githubBranch, "--single-branch", remoteUrl, directory], {
    env: gitAuth.env,
  });
  if (run("git", ["rev-parse", "--is-shallow-repository"], { cwd: directory, env: gitAuth.env }) === "true") {
    fail("GitHub Skills checkout 不应为 shallow repository");
  }
  if (run("git", ["status", "--porcelain"], { cwd: directory, env: gitAuth.env })) {
    fail("GitHub Skills checkout 不干净，拒绝同步");
  }
  return directory;
}

function isSafeSkillName(name) {
  return typeof name === "string"
    && name.length > 0
    && name !== "."
    && name !== ".."
    && !name.includes("/")
    && !name.includes("\\");
}

function readManifest(targetDirectory) {
  const manifestPath = join(targetDirectory, manifestName);
  if (!pathExists(manifestPath)) {
    fail(`GitHub Skills 仓库尚未建立受管基线；请在明确授权后仅执行一次 force-github-baseline：${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  if (
    manifest.schema_version !== 1
    || manifest.source_directory !== "skills"
    || !Array.isArray(manifest.managed_skill_names)
    || !manifest.managed_skill_names.every(isSafeSkillName)
    || new Set(manifest.managed_skill_names).size !== manifest.managed_skill_names.length
  ) {
    fail(`GitHub Skills 同步清单格式错误：${manifestPath}`);
  }
  return manifest;
}

function replaceEntry(sourcePath, targetPath) {
  if (pathExists(targetPath)) rmSync(targetPath, { recursive: true, force: true });
  cpSync(sourcePath, targetPath, { recursive: true, errorOnExist: true });
}

function writeManifest(targetDirectory, sourceCommit, skillNames) {
  const manifestPath = join(targetDirectory, manifestName);
  const temporaryPath = join(targetDirectory, `${manifestName}.tmp`);
  const manifest = {
    schema_version: 1,
    source_repository: "media-plugin-main",
    source_directory: "skills",
    source_commit: sourceCommit,
    managed_skill_names: skillNames,
  };
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o644 });
  renameSync(temporaryPath, manifestPath);
}

function synchronizeManagedSkills(targetDirectory, source) {
  const manifest = readManifest(targetDirectory);
  const previouslyManaged = new Set(manifest.managed_skill_names);
  const desired = new Set(source.skillNames);

  for (const name of source.skillNames) {
    const targetPath = join(targetDirectory, name);
    if (!previouslyManaged.has(name) && pathExists(targetPath)) {
      fail(`GitHub Skills 根目录已有未受管路径，拒绝覆盖：${name}；请先人工处理，或在明确授权后执行一次 force-github-baseline`);
    }
  }
  for (const name of previouslyManaged) {
    if (!desired.has(name)) rmSync(join(targetDirectory, name), { recursive: true, force: true });
  }
  for (const name of source.skillNames) {
    replaceEntry(join(skillsDirectory, name), join(targetDirectory, name));
  }
  writeManifest(targetDirectory, source.sourceCommit, source.skillNames);
}

// 仅用于首次建立发布基线。它会删除 GitHub Skills 仓库根目录中除 .git 外的全部内容，
// 再用当前 skills/ 快照替换；随后仍以普通提交推送，不改写 Git 历史。
function forceGithubBaseline(targetDirectory, source) {
  if (requiredEnv("GITHUB_BASELINE_FORCE_ACK") !== "REPLACE_GITHUB_SKILLS_ROOT_WITH_INTERNAL_SKILLS") {
    fail("必须将 GITHUB_BASELINE_FORCE_ACK 设置为 REPLACE_GITHUB_SKILLS_ROOT_WITH_INTERNAL_SKILLS 才能执行一次性基线覆盖");
  }
  for (const entry of readdirSync(targetDirectory)) {
    if (entry !== ".git") rmSync(join(targetDirectory, entry), { recursive: true, force: true });
  }
  for (const name of source.skillNames) {
    replaceEntry(join(skillsDirectory, name), join(targetDirectory, name));
  }
  writeManifest(targetDirectory, source.sourceCommit, source.skillNames);
}

function commitAndPush(targetDirectory, gitAuth, sourceCommit) {
  if (!run("git", ["status", "--porcelain"], { cwd: targetDirectory, env: gitAuth.env })) {
    console.log(`[publish] skills already synced: ${githubBranch} <- ${sourceCommit}`);
    return;
  }

  run("git", ["config", "user.name", process.env.GIT_COMMITTER_NAME ?? "mediaio-release-bot"], {
    cwd: targetDirectory,
    env: gitAuth.env,
  });
  run("git", ["config", "user.email", process.env.GIT_COMMITTER_EMAIL ?? "mediaio-release-bot@users.noreply.github.com"], {
    cwd: targetDirectory,
    env: gitAuth.env,
  });
  run("git", ["add", "--all"], { cwd: targetDirectory, env: gitAuth.env });
  run("git", ["-c", "commit.gpgSign=false", "commit", "-m", `chore(skills): sync ${sourceCommit}`], {
    cwd: targetDirectory,
    env: gitAuth.env,
  });
  const targetCommit = run("git", ["rev-parse", "HEAD"], { cwd: targetDirectory, env: gitAuth.env });
  run("git", ["push", "origin", `HEAD:refs/heads/${githubBranch}`], { cwd: targetDirectory, env: gitAuth.env });
  const remoteHead = run("git", ["ls-remote", "origin", `refs/heads/${githubBranch}`], {
    cwd: targetDirectory,
    env: gitAuth.env,
  }).split(/\s+/)[0];
  if (remoteHead !== targetCommit) fail(`GitHub ${githubBranch} 同步后提交校验失败`);
  console.log(`[publish] skills synced: ${githubRepository}/${githubBranch} -> ${targetCommit}`);
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

let askPassDirectory = "";
let targetDirectory = "";

try {
  if (requiredEnv("SKILLS_PUBLISH_PIPELINE_ACK") !== "RUN_FROM_INTERNAL_PIPELINE") {
    fail("SKILLS_PUBLISH_PIPELINE_ACK 必须为 RUN_FROM_INTERNAL_PIPELINE；此脚本只能在公司内部流水线运行");
  }
  const source = sourceContext();
  const githubToken = requiredEnv("GITHUB_TOKEN");
  const gitAuth = createGitAskPass(githubToken);
  askPassDirectory = gitAuth.directory;
  targetDirectory = cloneGithubSkills(gitAuth);

  console.log(`[publish] phase: ${operation}`);
  console.log(`[publish] source commit: ${source.sourceCommit}`);
  console.log(`[publish] skills: ${source.skillNames.join(", ")}`);

  if (operation === "sync-source") {
    synchronizeManagedSkills(targetDirectory, source);
  } else {
    forceGithubBaseline(targetDirectory, source);
  }
  commitAndPush(targetDirectory, gitAuth, source.sourceCommit);
} finally {
  if (targetDirectory) rmSync(targetDirectory, { recursive: true, force: true });
  if (askPassDirectory) rmSync(askPassDirectory, { recursive: true, force: true });
}
