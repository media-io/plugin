// model-catalog 工具链的共享实现：CLI 调用、缓存隔离、快照规范化与摘要。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATALOG_SCHEMA_VERSION = 1;

/** 生成类 fun_module 白名单；registry 中的其它模块（工作流、特效）不进目录。 */
export const GENERATION_MODULES = [
  'text2image',
  'image2image',
  'text2video',
  'image2video',
  'reference2video',
];

/** tier 为人工标注，registry 无此字段；unknown 表示尚未与产品/服务端确认。 */
export const TIER_VALUES = ['free', 'vip_free', 'unknown'];
export const STABILITY_VALUES = ['stable', 'review'];

const HERE = dirname(fileURLToPath(import.meta.url));
export const MAIN_ROOT = resolve(HERE, '..', '..');
export const SNAPSHOT_PATH = join(MAIN_ROOT, 'catalog', 'model-registry.snapshot.json');
export const OVERLAY_PATH = join(MAIN_ROOT, 'catalog', 'model-catalog.overlay.json');

/** 发布脚本整目录复制 skills/<name>/，此目录下的一切都会到达用户。 */
export const SKILLS_DIR = join(MAIN_ROOT, 'skills');
export const CATALOG_PATH = join(
  SKILLS_DIR,
  'mediaio-generate',
  'references',
  'model-catalog.md',
);

/** registry 缓存路径。BIN 侧固定为 ~/.config/mediaio-cli/workflow.json，不区分环境。 */
export const REGISTRY_CACHE_PATH = join(homedir(), '.config', 'mediaio-cli', 'workflow.json');

export function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exit(1);
}

export function info(message) {
  process.stdout.write(`${message}\n`);
}

export function runCli(args, { env } = {}) {
  const argv = env ? ['--production-env', env, ...args] : args;
  try {
    return execFileSync('mediaio', argv, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`mediaio ${argv.join(' ')} 失败: ${detail}`);
  }
}

export function runCliJson(args, options) {
  const raw = runCli([...args, '--output', 'json'], options);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`mediaio ${args.join(' ')} 返回的不是合法 JSON`);
  }
}

/**
 * 在隔离的 registry 缓存下执行 fn。
 *
 * BIN 的 registry 缓存文件名不含环境（media-plugin-bin/internal/registry/registry.go:163），
 * test/beta/prod 共用同一份，且 TTL 一小时。若不隔离，`--production-env prod` 可能直接命中
 * 上一次 beta 写入的缓存，产出一份标着 prod 却装着 beta 数据的快照。
 */
export function withIsolatedRegistryCache(fn) {
  const stash = `${REGISTRY_CACHE_PATH}.catalog-stash`;
  const hadCache = existsSync(REGISTRY_CACHE_PATH);
  if (hadCache) {
    rmSync(stash, { force: true });
    renameSync(REGISTRY_CACHE_PATH, stash);
  }
  try {
    return fn();
  } finally {
    rmSync(REGISTRY_CACHE_PATH, { force: true });
    if (hadCache) renameSync(stash, REGISTRY_CACHE_PATH);
  }
}

/** job_type 的排序键：逐字节比较，绝不做 trim 或大小写归一（见方案 §5 与 V10）。 */
export function compareModels(a, b) {
  if (a.fun_module !== b.fun_module) return a.fun_module < b.fun_module ? -1 : 1;
  if (a.job_type === b.job_type) return 0;
  return a.job_type < b.job_type ? -1 : 1;
}

export function normalizeSnapshotModels(rows) {
  return rows
    .filter((row) => GENERATION_MODULES.includes(row.fun_module))
    .map((row) => ({
      job_type: row.name,
      display_name: row.model ?? '',
      type: row.type ?? '',
      fun_module: row.fun_module,
      description: row.description ?? '',
    }))
    .sort(compareModels);
}

/** 快照摘要只覆盖模型数据，不含 generated_at，否则每次抓取都会变。 */
export function snapshotDigest(models) {
  const canonical = models
    .map((m) => [m.job_type, m.display_name, m.type, m.fun_module, m.description].join('\u0000'))
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function readJson(path, label) {
  if (!existsSync(path)) fail(`${label} 不存在: ${path}`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return fail(`${label} 解析失败: ${error.message}`);
  }
}

export function writeFileEnsured(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

export function loadSnapshot() {
  const snapshot = readJson(SNAPSHOT_PATH, '快照');
  if (snapshot.catalog_schema_version !== CATALOG_SCHEMA_VERSION) {
    fail(`快照 catalog_schema_version=${snapshot.catalog_schema_version}，期望 ${CATALOG_SCHEMA_VERSION}`);
  }
  return snapshot;
}

export function loadOverlay() {
  const overlay = readJson(OVERLAY_PATH, 'overlay');
  if (overlay.catalog_schema_version !== CATALOG_SCHEMA_VERSION) {
    fail(`overlay catalog_schema_version=${overlay.catalog_schema_version}，期望 ${CATALOG_SCHEMA_VERSION}`);
  }
  return overlay;
}

/** 遍历 overlay 中所有对 job_type 的引用，供孤儿检测与 V12 使用。 */
export function* overlayReferences(overlay) {
  for (const [slot, jobType] of Object.entries(overlay.defaults ?? {})) {
    yield { path: `defaults.${slot}`, job_type: jobType };
  }
  for (const [slot, jobType] of Object.entries(overlay.fallbacks ?? {})) {
    yield { path: `fallbacks.${slot}`, job_type: jobType };
  }
  const featured = overlay.featured ?? [];
  for (let i = 0; i < featured.length; i += 1) {
    yield { path: `featured[${i}]`, job_type: featured[i].job_type };
  }
  for (const [kind, rules] of Object.entries(overlay.routing ?? {})) {
    for (let i = 0; i < rules.length; i += 1) {
      yield { path: `routing.${kind}[${i}]`, job_type: rules[i].job_type };
    }
  }
  const hidden = overlay.hidden ?? [];
  for (let i = 0; i < hidden.length; i += 1) {
    yield { path: `hidden[${i}]`, job_type: hidden[i] };
  }
}

/** defaults / fallbacks 的槽位与 fun_module 的允许关系（V3）。 */
export const SLOT_MODULES = {
  text2image: ['text2image'],
  image2image: ['image2image'],
  video: ['image2video', 'text2video', 'reference2video'],
};
