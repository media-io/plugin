// 渲染 L2 产物：快照 + overlay → skills/mediaio-generate/references/model-catalog.md
import {
  CATALOG_PATH,
  GENERATION_MODULES,
  fail,
  info,
  loadOverlay,
  loadSnapshot,
  snapshotDigest,
  writeFileEnsured,
} from './lib.mjs';

const SLOT_LABELS = {
  text2image: '纯文生图（无参考图）',
  image2image: '图生图（有参考图）',
  video: '视频',
};

const MODULE_LABELS = {
  text2image: 'text2image — 文生图',
  image2image: 'image2image — 图生图',
  text2video: 'text2video — 文生视频',
  image2video: 'image2video — 图生视频',
  reference2video: 'reference2video — 多参考图生视频',
};

/** 目录里的 job_type 一律用反引号包裹，含空格时额外提示，避免被读成两个词。 */
function code(jobType) {
  return `\`${jobType}\``;
}

function cell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
}

function requireModel(index, jobType, where) {
  const model = index.get(jobType);
  if (!model) fail(`${where} 引用的 job_type 不在快照中: ${JSON.stringify(jobType)}`);
  return model;
}

function renderHeader(snapshot) {
  return [
    '# Media.io Model Catalog',
    '',
    '> 生成产物，请勿手改。改 `catalog/model-catalog.overlay.json` 后重跑 `sh scripts/model-catalog.sh sync`。',
    '',
    '| 元数据 | 值 |',
    '| --- | --- |',
    `| generated_at | ${snapshot.generated_at} |`,
    `| environment | ${snapshot.environment} |`,
    `| vapi | ${snapshot.vapi} |`,
    `| model_count | ${snapshot.model_count} |`,
    `| snapshot_digest | ${snapshot.snapshot_digest} |`,
    `| catalog_schema_version | ${snapshot.catalog_schema_version} |`,
    '',
  ];
}

function renderUsageRules() {
  return [
    '## 0. 使用规则',
    '',
    '1. **静态优先。** 常规意图路由只读本文件，不要跑 `mediaio model list`。',
    '2. **选型后仍要跑 `mediaio model get <job_type>`** 取参数 schema。本文件不承诺参数，也不得从本文件推断参数。',
    '3. **`job_type` 逐字节复制**，禁止 trim、禁止改大小写、禁止"修正"看起来像笔误的名字。含空格的取值在 shell 里必须加引号。',
    '4. **只能由显示名查 `job_type`，不能反推。** 显示名与 `job_type` 大量不对应（见第 6 节），且有重名；重名时列出候选让用户选。',
    '5. **向用户复述选型时写成 `显示名（job_type）`**，让错位暴露在人眼前。',
    '6. **允许回源的场景只有这几种**，其余一律不许跑 `model list`：',
    '   - 用户点名的模型在第 2、5 节找不到 → `mediaio model list --grep <关键词> --output json`',
    '   - 提交返回 `unknown job type` → 全量 `model list` 复核，并提示目录可能过期',
    '   - 用户明确要"看全部/最新模型"、"有没有新模型" → 全量 `model list`',
    '   - 降级前需确认降级目标仍在线 → `model list --grep` 校验',
    '   - 本文件 `generated_at` 距今超过 30 天，或 `catalog_schema_version` 与 skill 期望不符（**纯本地判断，不发请求**）',
    '   - 本文件缺失或元数据块损坏 → 退化为运行时发现',
    '',
  ];
}

function renderDefaults(overlay, index) {
  const lines = ['## 1. 全局默认', '', '| 场景 | 默认模型 | job_type | 降级目标 | job_type |', '| --- | --- | --- | --- | --- |'];
  for (const slot of Object.keys(SLOT_LABELS)) {
    const def = overlay.defaults?.[slot];
    const fb = overlay.fallbacks?.[slot];
    if (!def) continue;
    const defModel = requireModel(index, def, `defaults.${slot}`);
    const fbModel = fb ? requireModel(index, fb, `fallbacks.${slot}`) : null;
    lines.push(
      `| ${cell(SLOT_LABELS[slot])} | ${cell(defModel.display_name)} | ${code(def)} | ${cell(fbModel?.display_name ?? '—')} | ${fb ? code(fb) : '—'} |`,
    );
  }
  lines.push('');
  return lines;
}

function renderFeatured(overlay, index) {
  const lines = [
    '## 2. 精选模型',
    '',
    '| 显示名 | job_type | 权限等级* | 输入 | 何时选它 |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const item of overlay.featured ?? []) {
    const model = requireModel(index, item.job_type, 'featured');
    lines.push(
      `| ${cell(model.display_name)} | ${code(item.job_type)} | ${cell(item.tier)} | ${cell((item.inputs ?? []).join(', '))} | ${cell(item.why)} |`,
    );
  }
  lines.push('');
  lines.push(
    '\\* 权限等级为**人工标注**，registry 无此字段。`unknown` 表示尚未与产品确认。实际是否扣费一律以 `mediaio generate estimate` 与服务端结果为准，不要照本文件向用户承诺免费。',
  );
  lines.push('');
  return lines;
}

function renderRouting(overlay, index) {
  const lines = ['## 3. 场景路由', '', '按顺序匹配，**命中即停**，不要继续往下比。', ''];
  for (const [slot, rules] of Object.entries(overlay.routing ?? {})) {
    lines.push(`### ${SLOT_LABELS[slot] ?? slot}`, '');
    lines.push('| # | 条件 | 选它 | job_type |', '| --- | --- | --- | --- |');
    rules.forEach((rule, i) => {
      const model = requireModel(index, rule.job_type, `routing.${slot}[${i}]`);
      lines.push(
        `| ${i + 1} | ${cell(rule.when)} | ${cell(model.display_name)} | ${code(rule.job_type)} |`,
      );
    });
    lines.push('');
  }
  return lines;
}

function renderFallbackChain(overlay, index) {
  const lines = [
    '## 4. 降级链',
    '',
    '触发条件：服务端返回权限不足、额度不足，或用户明确说要免费/更便宜的。',
    '',
    '| 场景 | 从 | 降到 | 说明 |',
    '| --- | --- | --- | --- |',
  ];
  for (const slot of Object.keys(SLOT_LABELS)) {
    const def = overlay.defaults?.[slot];
    const fb = overlay.fallbacks?.[slot];
    if (!def || !fb) continue;
    const note = def === fb ? '默认模型本身即降级目标，无需切换' : '换模型后重新 estimate 再提交';
    lines.push(
      `| ${cell(SLOT_LABELS[slot])} | ${code(def)} | ${code(fb)} | ${cell(note)} |`,
    );
  }
  lines.push('');
  lines.push('降级前先按第 0 节规则校验目标仍在线，再重新走一次积分确认。');
  lines.push('');
  return lines;
}

function renderFullIndex(snapshot) {
  const lines = ['## 5. 全量索引', '', `快照共 ${snapshot.model_count} 个生成类模型。本节只回答"这个模型存不存在、叫什么"，不负责选型。`, ''];
  for (const module of GENERATION_MODULES) {
    const rows = snapshot.models.filter((m) => m.fun_module === module);
    if (!rows.length) continue;
    lines.push(`### ${MODULE_LABELS[module] ?? module}（${rows.length}）`, '');
    lines.push('| job_type | 显示名 | 描述 |', '| --- | --- | --- |');
    for (const m of rows) {
      lines.push(`| ${code(m.job_type)} | ${cell(m.display_name)} | ${cell(m.description)} |`);
    }
    lines.push('');
  }
  return lines;
}

function renderPitfalls(snapshot) {
  const spaced = snapshot.models.filter((m) => m.job_type.includes(' '));
  const mismatched = snapshot.models.filter(
    (m) => !m.job_type.startsWith(`${m.fun_module}_`),
  );
  const byDisplay = new Map();
  for (const m of snapshot.models) {
    if (!m.display_name) continue;
    if (!byDisplay.has(m.display_name)) byDisplay.set(m.display_name, []);
    byDisplay.get(m.display_name).push(m.job_type);
  }
  const duplicates = [...byDisplay.entries()].filter(([, list]) => list.length > 1);

  const lines = ['## 6. 已知陷阱', ''];

  lines.push(`### 6.1 job_type 内含空格（${spaced.length} 条）`, '');
  if (spaced.length) {
    lines.push('线上真实配置，**不会修改**。写成不带空格的版本会直接 `unknown job type`。shell 里必须加引号。', '');
    lines.push('| job_type | 显示名 |', '| --- | --- |');
    for (const m of spaced) lines.push(`| ${code(m.job_type)} | ${cell(m.display_name)} |`);
    lines.push('', '```bash', `mediaio model get "${spaced[0].job_type}"`, '```', '');
  } else {
    lines.push('当前快照中没有这类取值。', '');
  }

  lines.push(`### 6.2 前缀与 fun_module 不一致（${mismatched.length} 条）`, '');
  if (mismatched.length) {
    lines.push('不要根据 job_type 前缀推断它属于哪个模块，以本表为准。', '');
    lines.push('| job_type | 实际 fun_module |', '| --- | --- |');
    for (const m of mismatched) lines.push(`| ${code(m.job_type)} | ${cell(m.fun_module)} |`);
    lines.push('');
  } else {
    lines.push('当前快照中没有这类取值。', '');
  }

  lines.push(`### 6.3 显示名重名（${duplicates.length} 组）`, '');
  if (duplicates.length) {
    lines.push('**显示名不是主键。** 用户说出一个重名显示名时，列出候选让他选，不要自己挑第一个。', '');
    lines.push('| 显示名 | 对应 job_type |', '| --- | --- |');
    for (const [name, list] of duplicates.sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      lines.push(`| ${cell(name)} | ${list.map(code).join('<br>')} |`);
    }
    lines.push('');
  } else {
    lines.push('当前快照中没有重名。', '');
  }

  lines.push('### 6.4 显示名与 job_type 语义错位', '');
  lines.push(
    '历史原因造成，`uni_fun_code` 不可改。**只能由显示名查 job_type，不能由 job_type 反推显示名。** 典型例子：',
    '',
  );
  lines.push('| job_type | 显示名 | 容易误判成 |', '| --- | --- | --- |');
  const traps = [
    ['image2image_banana_2', 'Nano Banana 2'],
    ['text2image_banana_2', 'Nano Banana 2'],
    ['text2image_soul_character', 'Soul / 角色模型'],
    ['image2video_tomoviee_2.5', 'ToMoviee 2.5'],
  ];
  const index = new Map(snapshot.models.map((m) => [m.job_type, m]));
  for (const [jobType, misread] of traps) {
    const model = index.get(jobType);
    if (model) {
      lines.push(`| ${code(jobType)} | ${cell(model.display_name)} | ${cell(misread)} |`);
    }
  }
  lines.push('');
  return lines;
}

function renderCheatSheet(snapshot) {
  return [
    '## 7. 回源指令速查',
    '',
    '```bash',
    '# 按关键词找模型（第 0 节条件 1 才允许）',
    'mediaio model list --grep seedance --output json',
    '',
    '# 只看某个模块',
    'mediaio model list --module image2video --output json',
    '',
    '# 取参数 schema（每次选型后都要跑）',
    'mediaio model get image2image_media_3.0',
    '',
    '# job_type 含空格时必须加引号',
    'mediaio model get "image2video_seedance _2.5"',
    '```',
    '',
    `> \`model list\` 的默认文本输出只有 \`job_type / type / description\`，**不含显示名**；需要显示名时必须加 \`--output json\` 读 \`model\` 字段。`,
    '',
    '---',
    '',
    `<!-- snapshot_digest: ${snapshot.snapshot_digest} -->`,
    '',
  ];
}

function main() {
  const snapshot = loadSnapshot();
  const overlay = loadOverlay();

  const recomputed = snapshotDigest(snapshot.models);
  if (recomputed !== snapshot.snapshot_digest) {
    fail(`快照 digest 不匹配：文件记录 ${snapshot.snapshot_digest}，实际 ${recomputed}。快照被手改过，请重新 fetch。`);
  }

  const index = new Map(snapshot.models.map((m) => [m.job_type, m]));

  const lines = [
    ...renderHeader(snapshot),
    ...renderUsageRules(),
    ...renderDefaults(overlay, index),
    ...renderFeatured(overlay, index),
    ...renderRouting(overlay, index),
    ...renderFallbackChain(overlay, index),
    ...renderFullIndex(snapshot),
    ...renderPitfalls(snapshot),
    ...renderCheatSheet(snapshot),
  ];

  writeFileEnsured(CATALOG_PATH, `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}`);
  info(`已渲染 ${CATALOG_PATH}`);
}

main();
