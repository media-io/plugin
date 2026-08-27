// 抓取 registry 快照：mediaio model list --output json → catalog/model-registry.snapshot.json
import { existsSync } from 'node:fs';

import {
  CATALOG_SCHEMA_VERSION,
  SNAPSHOT_PATH,
  fail,
  info,
  loadSnapshot,
  normalizeSnapshotModels,
  overlayReferences,
  runCli,
  runCliJson,
  snapshotDigest,
  withIsolatedRegistryCache,
  writeFileEnsured,
  loadOverlay,
} from './lib.mjs';

function parseArgs(argv) {
  const options = { env: 'prod', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--env') {
      options.env = argv[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else {
      fail(`未知参数: ${arg}`);
    }
  }
  if (!['test', 'beta', 'prod'].includes(options.env)) fail(`--env 取值非法: ${options.env}`);
  return options;
}

function cliVersion() {
  const line = runCli(['version'])
    .split('\n')
    .find((l) => l.startsWith('Version:'));
  return line ? line.replace('Version:', '').trim() : 'unknown';
}

function diffModels(previous, next) {
  const before = new Map(previous.map((m) => [m.job_type, m]));
  const after = new Map(next.map((m) => [m.job_type, m]));
  const added = next.filter((m) => !before.has(m.job_type));
  const removed = previous.filter((m) => !after.has(m.job_type));
  const drifted = next.filter((m) => {
    const old = before.get(m.job_type);
    return old && (old.display_name !== m.display_name || old.description !== m.description);
  });
  return { added, removed, drifted };
}

function reportDiff({ added, removed, drifted }, overlay, nextModels) {
  const known = new Set(nextModels.map((m) => m.job_type));
  const orphans = [...overlayReferences(overlay)].filter(
    (ref) => ref.job_type && !known.has(ref.job_type),
  );

  if (removed.length) {
    info(`\n下线 ${removed.length} 条：`);
    for (const m of removed) info(`  - ${JSON.stringify(m.job_type)}  ${m.display_name}`);
  }
  if (added.length) {
    info(`\n新增 ${added.length} 条（默认只进全量索引，需人工决定是否进精选/路由）：`);
    for (const m of added) {
      info(`  + ${JSON.stringify(m.job_type)}  ${m.display_name}  [${m.fun_module}]`);
    }
  }
  if (drifted.length) {
    info(`\n展示漂移 ${drifted.length} 条（显示名或描述变化，不影响规则有效性）：`);
    for (const m of drifted) info(`  ~ ${JSON.stringify(m.job_type)}  ${m.display_name}`);
  }
  if (!removed.length && !added.length && !drifted.length) info('\n与已入库快照一致，无变化。');

  return orphans;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  // 缓存隔离必须包住 config get 与 model list，两者都会读同一份 registry 缓存。
  const { config, models, version } = withIsolatedRegistryCache(() => {
    const configPayload = runCliJson(['config', 'get'], { env: options.env });
    const listPayload = runCliJson(['model', 'list'], { env: options.env });
    return {
      config: configPayload.data,
      models: normalizeSnapshotModels(listPayload.data ?? []),
      version: cliVersion(),
    };
  });

  if (config.environment !== options.env) {
    fail(`CLI 报告 environment=${config.environment}，与请求的 --env ${options.env} 不一致`);
  }
  if (!models.length) fail('未抓到任何生成类模型，拒绝写入空快照');

  const snapshot = {
    catalog_schema_version: CATALOG_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    environment: config.environment,
    vapi: config.vapi,
    cli_version: version,
    source_command: `mediaio --production-env ${options.env} model list --output json`,
    model_count: models.length,
    snapshot_digest: snapshotDigest(models),
    models,
  };

  info(`环境 ${snapshot.environment} / vapi ${snapshot.vapi} / CLI ${snapshot.cli_version}`);
  info(`抓到 ${snapshot.model_count} 个生成类模型，digest ${snapshot.snapshot_digest}`);

  const previous = existsSync(SNAPSHOT_PATH) ? loadSnapshot().models : [];
  const orphans = reportDiff(diffModels(previous, models), loadOverlay(), models);

  if (options.dryRun) {
    info('\n--dry-run：未写入快照。');
    return;
  }

  writeFileEnsured(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  info(`\n已写入 ${SNAPSHOT_PATH}`);

  if (orphans.length) {
    info(`\n孤儿引用 ${orphans.length} 处，overlay 引用的 job_type 已不在快照中：`);
    for (const ref of orphans) info(`  ! ${ref.path} → ${JSON.stringify(ref.job_type)}`);
    fail('存在孤儿引用，必须人工裁决后重跑（这是设计上的闸门，不允许自动通过）');
  }
}

main();
