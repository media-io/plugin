// 发布 gate：校验 V0–V13。只读本地快照、overlay 与产物，不联网、不需要登录。
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import {
  CATALOG_PATH,
  CATALOG_SCHEMA_VERSION,
  OVERLAY_PATH,
  SKILLS_DIR,
  SLOT_MODULES,
  SNAPSHOT_PATH,
  STABILITY_VALUES,
  TIER_VALUES,
  info,
  loadOverlay,
  loadSnapshot,
  overlayReferences,
  snapshotDigest,
} from './lib.mjs';

const FRESHNESS_WARN_DAYS = 30;
const FRESHNESS_FAIL_DAYS = 180;

// overlay 的 when 是分发文案，必须英文；兜底规则据此识别。
const CATCH_ALL = /everything else|anything else|otherwise|no special|default/i;

// 产物中的权限等级脚注，缺失即视为来源声明丢失。
const TIER_FOOTNOTE = 'Access tier is **manually curated**';

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/;

/** 递归列出目录下所有文件。 */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const failures = [];
const warnings = [];

function check(rule, condition, message) {
  if (!condition) failures.push(`${rule}: ${message}`);
}

function warn(rule, message) {
  warnings.push(`${rule}: ${message}`);
}

function parseArgs(argv) {
  const options = { env: 'prod', strict: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--env') {
      options.env = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--release') {
      options.strict = true;
    }
  }
  return options;
}

/** 从产物中抽出所有被反引号包裹的 job_type 候选。 */
function extractJobTypes(markdown) {
  const found = new Set();
  const pattern = /`((?:text2image|image2image|text2video|image2video|reference2video)[^`]*)`/g;
  let match = pattern.exec(markdown);
  while (match) {
    found.add(match[1]);
    match = pattern.exec(markdown);
  }
  return found;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!existsSync(SNAPSHOT_PATH)) {
    process.stderr.write(`error: 快照不存在，先跑 sync: ${SNAPSHOT_PATH}\n`);
    process.exit(1);
  }
  if (!existsSync(CATALOG_PATH)) {
    process.stderr.write(`error: 产物不存在，先跑 render: ${CATALOG_PATH}\n`);
    process.exit(1);
  }

  const snapshot = loadSnapshot();
  const overlay = loadOverlay();
  const markdown = readFileSync(CATALOG_PATH, 'utf8');
  const known = new Map(snapshot.models.map((m) => [m.job_type, m]));

  // V10 —— job_type 逐字节一致，且不得存在 trim 后才相等的近似值。
  const trimmedIndex = new Map();
  for (const m of snapshot.models) trimmedIndex.set(m.job_type.replace(/\s+/g, ''), m.job_type);
  const byteExact = (jobType, where) => {
    if (known.has(jobType)) return true;
    const near = trimmedIndex.get(jobType.replace(/\s+/g, ''));
    if (near && near !== jobType) {
      failures.push(
        `V10: ${where} 的 ${JSON.stringify(jobType)} 与快照值 ${JSON.stringify(near)} 只差空白字符，必须逐字节一致`,
      );
      return false;
    }
    return false;
  };

  // V1 —— 产物中出现的 job_type 都存在于快照。
  for (const jobType of extractJobTypes(markdown)) {
    if (!known.has(jobType)) {
      byteExact(jobType, '产物');
      check('V1', false, `产物出现快照中不存在的 job_type ${JSON.stringify(jobType)}`);
    }
  }

  // V2 / V12 —— overlay 的每个引用都存在于快照（孤儿引用为零）。
  for (const ref of overlayReferences(overlay)) {
    if (!ref.job_type) {
      check('V2', false, `${ref.path} 的 job_type 为空`);
      continue;
    }
    if (!known.has(ref.job_type)) {
      byteExact(ref.job_type, ref.path);
      check('V12', false, `孤儿引用 ${ref.path} → ${JSON.stringify(ref.job_type)}`);
    }
  }

  // V3 —— defaults / fallbacks 的 fun_module 与槽位用途匹配。
  for (const group of ['defaults', 'fallbacks']) {
    for (const [slot, jobType] of Object.entries(overlay[group] ?? {})) {
      const allowed = SLOT_MODULES[slot];
      check('V3', Boolean(allowed), `${group}.${slot} 不是已知槽位`);
      const model = known.get(jobType);
      if (allowed && model) {
        check(
          'V3',
          allowed.includes(model.fun_module),
          `${group}.${slot} 指向 ${JSON.stringify(jobType)}（fun_module=${model.fun_module}），允许的是 ${allowed.join('/')}`,
        );
      }
    }
  }

  // V4 —— routing 的 job_type 存在且未被 hidden。
  const hidden = new Set(overlay.hidden ?? []);
  for (const [slot, rules] of Object.entries(overlay.routing ?? {})) {
    const allowed = SLOT_MODULES[slot];
    rules.forEach((rule, i) => {
      const where = `routing.${slot}[${i}]`;
      check('V4', Boolean(rule.when?.trim()), `${where} 缺少 when`);
      check('V4', !hidden.has(rule.job_type), `${where} 指向被 hidden 的 job_type`);
      const model = known.get(rule.job_type);
      if (allowed && model) {
        check(
          'V4',
          allowed.includes(model.fun_module),
          `${where} 的 fun_module=${model.fun_module} 不属于槽位 ${slot}`,
        );
      }
      if (rule.stability !== undefined) {
        check(
          'V4',
          STABILITY_VALUES.includes(rule.stability),
          `${where} 的 stability=${rule.stability} 不在 ${STABILITY_VALUES.join('/')} 内`,
        );
      }
    });
    const last = rules[rules.length - 1];
    if (last && !CATCH_ALL.test(last.when ?? '')) {
      warn('V4', `routing.${slot} 的最后一条不像兜底规则，可能存在无法命中的意图`);
    }
  }

  // V5 —— 幂等：重渲染后产物字节一致。
  try {
    const before = readFileSync(CATALOG_PATH);
    execFileSync('node', [new URL('render-catalog.mjs', import.meta.url).pathname], {
      stdio: 'ignore',
    });
    const after = readFileSync(CATALOG_PATH);
    check('V5', before.equals(after), '重新渲染后产物发生变化，渲染器不幂等');
  } catch (error) {
    check('V5', false, `幂等性检查执行失败: ${error.message}`);
  }

  // V6 —— 环境一致。
  check(
    'V6',
    snapshot.environment === options.env,
    `快照 environment=${snapshot.environment}，发布目标是 ${options.env}`,
  );

  // V7 —— 新鲜度。
  const ageDays = (Date.now() - Date.parse(snapshot.generated_at)) / 86_400_000;
  if (Number.isNaN(ageDays)) {
    check('V7', false, `generated_at 无法解析: ${snapshot.generated_at}`);
  } else if (ageDays > FRESHNESS_FAIL_DAYS || (options.strict && ageDays > FRESHNESS_WARN_DAYS)) {
    check('V7', false, `快照已过期 ${ageDays.toFixed(0)} 天`);
  } else if (ageDays > FRESHNESS_WARN_DAYS) {
    warn('V7', `快照已 ${ageDays.toFixed(0)} 天未更新，发版前建议重新 sync`);
  }

  // V8 —— 产物 digest 与快照一致，且快照 digest 与其模型数据一致。
  const recomputed = snapshotDigest(snapshot.models);
  check('V8', recomputed === snapshot.snapshot_digest, `快照被手改：记录 ${snapshot.snapshot_digest}，实际 ${recomputed}`);
  const embedded = markdown.match(/<!-- snapshot_digest: ([0-9a-f]+) -->/)?.[1];
  check('V8', embedded === snapshot.snapshot_digest, `产物 digest=${embedded ?? '缺失'}，快照 digest=${snapshot.snapshot_digest}`);

  // V9 —— tier 取值合法且带来源脚注。
  for (const item of overlay.featured ?? []) {
    check(
      'V9',
      TIER_VALUES.includes(item.tier),
      `featured ${JSON.stringify(item.job_type)} 的 tier=${item.tier} 不在 ${TIER_VALUES.join('/')} 内`,
    );
    check('V9', Boolean(item.why?.trim()), `featured ${JSON.stringify(item.job_type)} 缺少 why`);
    if (item.stability !== undefined) {
      check(
        'V9',
        STABILITY_VALUES.includes(item.stability),
        `featured ${JSON.stringify(item.job_type)} 的 stability=${item.stability} 非法`,
      );
    }
  }
  check('V9', markdown.includes(TIER_FOOTNOTE), '产物缺少权限等级的来源脚注');

  // V11 —— 显示名不得跨记录拼接。
  const displayNames = new Set(snapshot.models.map((m) => m.display_name).filter(Boolean));
  const tableRow = /^\|\s*`([^`]+)`\s*\|\s*([^|]*)\|/;
  for (const line of markdown.split('\n')) {
    const match = tableRow.exec(line.trim());
    if (!match) continue;
    const [, jobType, rawName] = match;
    const name = rawName.trim();
    const model = known.get(jobType);
    if (!model || !name || !displayNames.has(name)) continue;
    check(
      'V11',
      model.display_name === name,
      `产物把 ${JSON.stringify(jobType)} 标成显示名「${name}」，快照中它是「${model.display_name}」`,
    );
  }

  // V13 —— 分发给用户的 skills/ 整树不得含 CJK，产物与手写文件同管。
  for (const file of walk(SKILLS_DIR)) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (text.includes('\u0000')) continue;
    text.split('\n').forEach((line, i) => {
      if (CJK.test(line)) {
        check('V13', false, `${relative(SKILLS_DIR, file)}:${i + 1} 含中文，分发物必须全英文 —— ${line.trim().slice(0, 60)}`);
      }
    });
  }

  // schema 版本一致。
  check(
    'V0',
    overlay.catalog_schema_version === CATALOG_SCHEMA_VERSION &&
      snapshot.catalog_schema_version === CATALOG_SCHEMA_VERSION,
    'catalog_schema_version 不一致',
  );

  for (const message of warnings) info(`warn  ${message}`);

  if (failures.length) {
    process.stderr.write('\n');
    for (const message of failures) process.stderr.write(`FAIL  ${message}\n`);
    process.stderr.write(`\n${failures.length} 条校验失败，阻断发布。\n`);
    process.exit(1);
  }

  info(
    `OK    V0-V13 全部通过（environment=${snapshot.environment}, models=${snapshot.model_count}, digest=${snapshot.snapshot_digest}${warnings.length ? `, ${warnings.length} 条告警` : ''}）`,
  );
  info(`      快照 ${SNAPSHOT_PATH}`);
  info(`      overlay ${OVERLAY_PATH}`);
  info(`      产物 ${CATALOG_PATH}`);
}

main();
