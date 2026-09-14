#!/usr/bin/env node
/**
 * 在流水线构建时把统一版本号写入 media-plugin-main 的全部版本承载点。
 *
 * 版本号唯一来源是 media-plugin-cli/package.json 的 version，
 * 由流水线「环境初始化」阶段 setEnv 成 RELEASE_VERSION 传递下来，
 * 形如 0.3.0 或 0.3.0-ci.1234。
 *
 * 覆盖的文件：
 *   .claude-plugin/marketplace.json   plugins[].version
 *   .claude-plugin/plugin.json        version
 *   .codex-plugin/plugin.json         version
 *   skills/<name>/SKILL.md            frontmatter metadata.version
 *   skills-mcp/<name>/SKILL.md        frontmatter metadata.version
 *
 * 用法：
 *   node deploy/version-stamp.mjs                 # 取 RELEASE_VERSION
 *   node deploy/version-stamp.mjs 0.3.0-ci.1234   # 显式指定
 *   node deploy/version-stamp.mjs --check 0.3.0   # 只校验，不写入
 *
 * 改写采用定点正则替换而非 JSON 重新序列化，避免把单行数组等既有排版打散。
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// 与 Codex 插件校验器（validate_plugin.py 的 SEMVER_RE）完全一致的严格 semver。
// Claude 侧对 version 不做格式校验，取两者交集即以严格 semver 为准。
const STRICT_SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const packageRoot = resolve(new URL("..", import.meta.url).pathname);
const jsonTargets = [
  ".claude-plugin/marketplace.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
];
const skillRoots = ["skills", "skills-mcp"];

function fail(message) {
  throw new Error(message);
}

/**
 * 校验版本号，确保写出去的内容一定能通过 Codex 的插件校验。
 */
export function assertReleaseVersion(version) {
  if (typeof version !== "string" || version.length === 0) {
    fail("版本号为空；请提供 RELEASE_VERSION 或命令行参数");
  }
  if (version.includes("+")) {
    // Claude Code 会用 version 字符串直接作为插件缓存目录名，
    // build metadata 未经实测，流水线统一使用 -ci.<构建号> 预发布后缀。
    fail(`版本号不允许包含 build metadata（+）：${version}；请改用 0.3.0-ci.1234 形式`);
  }
  if (!STRICT_SEMVER.test(version)) {
    fail(
      `版本号不是严格 semver，Codex 插件校验会拒绝：${version}；`
        + "注意数字型预发布标识不得有前导零（ci.007 非法，ci.7 合法）",
    );
  }
  return version;
}

function listSkillFiles() {
  const files = [];
  for (const root of skillRoots) {
    const directory = join(packageRoot, root);
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = join(directory, entry.name, "SKILL.md");
      try {
        if (!statSync(skillFile).isFile()) continue;
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      files.push(skillFile);
    }
  }
  return files.sort();
}

/**
 * 返回全部版本承载文件的绝对路径，供发布脚本做“允许脏文件”白名单。
 */
export function versionTargetFiles() {
  const jsonFiles = jsonTargets.map((relativePath) => {
    const file = join(packageRoot, relativePath);
    statSync(file);
    return file;
  });
  const skillFiles = listSkillFiles();
  if (skillFiles.length === 0) fail("未找到任何 SKILL.md，版本改写目标异常");
  return [...jsonFiles, ...skillFiles];
}

function rewriteJson(file, version) {
  const original = readFileSync(file, "utf8");
  const pattern = /("version"\s*:\s*")[^"]*(")/g;
  const matches = original.match(pattern);
  if (!matches || matches.length === 0) fail(`${relative(packageRoot, file)} 中找不到 version 字段`);
  const updated = original.replace(pattern, `$1${version}$2`);

  // 改写后必须仍是合法 JSON，且语义上的版本号确实都被替换。
  const parsed = JSON.parse(updated);
  const observed = [];
  if (typeof parsed.version === "string") observed.push(parsed.version);
  if (Array.isArray(parsed.plugins)) {
    for (const plugin of parsed.plugins) {
      if (plugin && typeof plugin.version === "string") observed.push(plugin.version);
    }
  }
  if (observed.length === 0) fail(`${relative(packageRoot, file)} 中未定位到可改写的 version`);
  for (const value of observed) {
    if (value !== version) fail(`${relative(packageRoot, file)} 版本改写不完整：${value}`);
  }
  return { original, updated, observed };
}

function rewriteSkill(file, version) {
  const original = readFileSync(file, "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(original);
  if (!frontmatter) fail(`${relative(packageRoot, file)} 缺少 YAML frontmatter`);

  const body = frontmatter[1];
  const pattern = /^([ \t]+version:[ \t]*)(["']?)[^"'\r\n]*\2[ \t]*$/gm;
  const matches = body.match(pattern);
  if (!matches || matches.length !== 1) {
    fail(`${relative(packageRoot, file)} frontmatter 中的 version 行应有且只有一处，实际 ${matches?.length ?? 0} 处`);
  }
  const updatedBody = body.replace(pattern, `$1"${version}"`);
  // 用偏移量原地替换 frontmatter 正文，避免重写分隔符时把行尾风格normalize掉。
  const bodyStart = frontmatter.index + frontmatter[0].indexOf(body);
  const updated = original.slice(0, bodyStart) + updatedBody + original.slice(bodyStart + body.length);
  const observed = [/^[ \t]+version:[ \t]*"(.*)"[ \t]*$/m.exec(updatedBody)?.[1]];
  if (observed[0] !== version) fail(`${relative(packageRoot, file)} 版本改写不完整`);
  return { original, updated, observed };
}

function rewrite(file, version) {
  return file.endsWith(".json") ? rewriteJson(file, version) : rewriteSkill(file, version);
}

/**
 * 把 version 写入全部承载点；已经是目标版本的文件不会被触碰。
 */
export function stampVersion(version) {
  assertReleaseVersion(version);
  const changed = [];
  const unchanged = [];
  for (const file of versionTargetFiles()) {
    const result = rewrite(file, version);
    if (result.updated === result.original) {
      unchanged.push(relative(packageRoot, file));
      continue;
    }
    writeFileSync(file, result.updated);
    changed.push(relative(packageRoot, file));
  }
  return { changed, unchanged };
}

/**
 * 只校验不写入；返回版本号与期望值不一致的文件。
 */
export function checkVersion(version) {
  assertReleaseVersion(version);
  const mismatched = [];
  for (const file of versionTargetFiles()) {
    const result = rewrite(file, version);
    if (result.updated !== result.original) mismatched.push(relative(packageRoot, file));
  }
  return { mismatched };
}

function printUsage() {
  console.log("用法：node deploy/version-stamp.mjs [--check] [<version>]");
  console.log("未提供 <version> 时读取环境变量 RELEASE_VERSION。");
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }
  const checkOnly = args.includes("--check");
  const positional = args.filter((arg) => arg !== "--check");
  if (positional.length > 1) {
    printUsage();
    fail(`参数过多：${positional.join(" ")}`);
  }
  const version = positional[0] ?? process.env.RELEASE_VERSION ?? "";

  if (checkOnly) {
    const { mismatched } = checkVersion(version);
    if (mismatched.length > 0) {
      fail(`以下文件版本号与 ${version} 不一致：\n  ${mismatched.join("\n  ")}`);
    }
    console.log(`[version-stamp] check passed: ${version}`);
    return;
  }

  const { changed, unchanged } = stampVersion(version);
  console.log(`[version-stamp] version: ${version}`);
  for (const file of changed) console.log(`[version-stamp] updated: ${file}`);
  for (const file of unchanged) console.log(`[version-stamp] already current: ${file}`);
}

// 仅当以脚本方式直接执行时才跑 CLI；被发布脚本 import 时不执行。
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main(process.argv);
}
