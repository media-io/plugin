// 渲染 L2 产物：快照 + overlay → skills/mediaio-generate/references/model-catalog.md
import {
  CATALOG_PATH,
  GENERATION_MODULES,
  compareModels,
  fail,
  info,
  loadOverlay,
  loadSnapshot,
  snapshotDigest,
  writeFileEnsured,
} from './lib.mjs';

const SLOT_LABELS = {
  text2image: 'Text to image (no reference image)',
  image2image: 'Image to image (with reference image)',
  video: 'Video',
};

const MODULE_LABELS = {
  text2image: 'text2image — text to image',
  image2image: 'image2image — image to image',
  text2video: 'text2video — text to video',
  image2video: 'image2video — image to video',
  reference2video: 'reference2video — multi-reference to video',
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
    '> Generated artifact — do not edit by hand. Change `catalog/model-catalog.overlay.json`, then re-run `sh scripts/model-catalog.sh sync`.',
    '',
    '| Field | Value |',
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
    '## 0. How to use this file',
    '',
    '1. **Static first.** Route ordinary intent from this file alone; do not run `mediaio model list`.',
    '2. **After selecting, still run `mediaio model get <job_type>`** for the parameter schema. This file makes no promise about parameters and must not be used to infer them.',
    '3. **Copy `job_type` byte for byte.** Never trim it, never change case, never "fix" a name that looks like a typo. Values containing a space must be quoted in the shell.',
    '4. **Map display name to `job_type` only, never the reverse.** Display names and `job_type` disagree in many cases (see section 6) and some names are shared. When a name is ambiguous, list the candidates and let the user choose.',
    '5. **Report your choice as `Display Name (job_type)`** so any mismatch is visible to the user.',
    '6. **A live lookup is allowed only in these cases**; otherwise never run `model list`:',
    '   - A model the user named is not in section 2 or 5 → `mediaio model list --grep <keyword> --output json`',
    '   - Submission returned `unknown job type` → full `model list` to re-check, and warn that this catalog may be stale',
    '   - The user explicitly asks to see all/latest models, or whether new models exist → full `model list`',
    '   - You need to confirm a fallback target is still online before switching → `model list --grep`',
    '   - This file\'s `generated_at` is more than 30 days old, or `catalog_schema_version` does not match what the skill expects (**decided locally, no request**)',
    '   - This file is missing or its metadata block is corrupt → fall back to runtime discovery',
    '',
  ];
}

function renderDefaults(overlay, index) {
  const lines = ['## 1. Global defaults', '', '| Scenario | Default model | job_type | Fallback | job_type |', '| --- | --- | --- | --- | --- |'];
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
    '## 2. Featured models',
    '',
    '| Display name | job_type | Access tier* | Inputs | When to pick it |',
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
    '\\* Access tier is **manually curated**; the registry has no such field. `unknown` means it has not been confirmed with the product team. Whether a job actually costs credits is decided by `mediaio generate estimate` and the server response — never tell the user a model is free based on this file.',
  );
  lines.push('');
  return lines;
}

function renderRouting(overlay, index) {
  const lines = ['## 3. Scenario routing', '', 'Match in order and **stop at the first hit**; do not keep comparing.', ''];
  for (const [slot, rules] of Object.entries(overlay.routing ?? {})) {
    lines.push(`### ${SLOT_LABELS[slot] ?? slot}`, '');
    lines.push('| # | Condition | Pick | job_type |', '| --- | --- | --- | --- |');
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
    '## 4. Fallback chain',
    '',
    'Triggers: the server reports insufficient permission or insufficient credits, or the user explicitly asks for a free or cheaper option.',
    '',
    '| Scenario | From | To | Note |',
    '| --- | --- | --- | --- |',
  ];
  for (const slot of Object.keys(SLOT_LABELS)) {
    const def = overlay.defaults?.[slot];
    const fb = overlay.fallbacks?.[slot];
    if (!def || !fb) continue;
    const note =
      def === fb
        ? 'The default already is the fallback; no switch needed'
        : 'Re-run estimate after switching, then submit';
    lines.push(
      `| ${cell(SLOT_LABELS[slot])} | ${code(def)} | ${code(fb)} | ${cell(note)} |`,
    );
  }
  lines.push('');
  lines.push('Before falling back, confirm the target is still online under the rules in section 0, then repeat the credit confirmation step.');
  lines.push('');
  return lines;
}

function renderFullIndex(snapshot) {
  const lines = [
    '## 5. Full index',
    '',
    `This snapshot contains ${snapshot.model_count} generation models. This section only answers whether a model exists and what it is called; it is not a selection guide.`,
    '',
  ];
  for (const module of GENERATION_MODULES) {
    const rows = snapshot.models.filter((m) => m.fun_module === module);
    if (!rows.length) continue;
    lines.push(`### ${MODULE_LABELS[module] ?? module} (${rows.length})`, '');
    lines.push('| job_type | Display name | Description |', '| --- | --- | --- |');
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

  const lines = ['## 6. Known pitfalls', ''];

  lines.push(`### 6.1 job_type contains a space (${spaced.length})`, '');
  if (spaced.length) {
    lines.push('These are the real production values and **will not be changed**. Writing them without the space fails with `unknown job type`. Always quote them in the shell.', '');
    lines.push('| job_type | Display name |', '| --- | --- |');
    for (const m of spaced) lines.push(`| ${code(m.job_type)} | ${cell(m.display_name)} |`);
    lines.push('', '```bash', `mediaio model get "${spaced[0].job_type}"`, '```', '');
  } else {
    lines.push('No such values in the current snapshot.', '');
  }

  lines.push(`### 6.2 Prefix does not match fun_module (${mismatched.length})`, '');
  if (mismatched.length) {
    lines.push('Never infer a model\'s module from its job_type prefix. Use this table.', '');
    lines.push('| job_type | Actual fun_module |', '| --- | --- |');
    for (const m of mismatched) lines.push(`| ${code(m.job_type)} | ${cell(m.fun_module)} |`);
    lines.push('');
  } else {
    lines.push('No such values in the current snapshot.', '');
  }

  lines.push(`### 6.3 Duplicate display names (${duplicates.length} groups)`, '');
  if (duplicates.length) {
    lines.push('**A display name is not a primary key.** When the user names one of these, list the candidates and let them choose instead of silently taking the first.', '');
    lines.push('| Display name | job_type candidates |', '| --- | --- |');
    for (const [name, list] of duplicates.sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      lines.push(`| ${cell(name)} | ${list.map(code).join('<br>')} |`);
    }
    lines.push('');
  } else {
    lines.push('No duplicate display names in the current snapshot.', '');
  }

  lines.push('### 6.4 Display name and job_type disagree', '');
  lines.push(
    'A historical artifact; `uni_fun_code` cannot be changed. **Map display name to job_type only, never the reverse.** Typical examples:',
    '',
  );
  lines.push('| job_type | Display name | Commonly misread as |', '| --- | --- | --- |');
  const traps = [
    ['image2image_banana_2', 'Nano Banana 2'],
    ['text2image_banana_2', 'Nano Banana 2'],
    ['text2image_soul_character', 'a Soul / character-specific model'],
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

  // 天幕是 ToMoviee 的中文品牌名，属 V13 中文白名单内的唯一例外。
  const tomoviee = snapshot.models
    .filter((m) => /tomoviee/i.test(m.display_name))
    .sort(compareModels);
  lines.push('### 6.5 ToMoviee is the first-party family, called 天幕 in Chinese', '');
  lines.push(
    'ToMoviee is our own model family. Its Chinese brand name is **天幕**. No display name is literally 天幕, so a user who asks for 天幕 will not match anything by search — resolve the request to the entries below, and let the user choose when several apply.',
    '',
  );
  if (tomoviee.length) {
    lines.push('| job_type | Display name | Module |', '| --- | --- | --- |');
    for (const model of tomoviee) {
      lines.push(`| ${code(model.job_type)} | ${cell(model.display_name)} | ${cell(model.fun_module)} |`);
    }
    lines.push('');
  }
  return lines;
}

function renderCheatSheet(snapshot) {
  return [
    '## 7. Live-lookup command reference',
    '',
    '```bash',
    '# Find a model by keyword (only under condition 1 in section 0)',
    'mediaio model list --grep seedance --output json',
    '',
    '# Restrict to one module',
    'mediaio model list --module image2video --output json',
    '',
    '# Get the parameter schema (run this after every selection)',
    'mediaio model get image2image_media_3.0',
    '',
    '# job_type values containing a space must be quoted',
    'mediaio model get "image2video_seedance _2.5"',
    '```',
    '',
    `> The default text output of \`model list\` has only \`job_type / type / description\` and **no display name**. Add \`--output json\` and read the \`model\` field when you need it.`,
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
