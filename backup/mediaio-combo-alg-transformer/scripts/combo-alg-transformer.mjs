#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DEFAULT_EXPLORE_SLUG = 'explore_all_en';
const IMAGE_MODULES = new Set([
  'text2image',
  'image2image',
  'character_generator',
]);

export class TransformError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'TransformError';
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function parseJsonField(value, fieldName, fallback) {
  if (value == null || value === '') return clone(fallback);
  if (typeof value !== 'string') return clone(value);

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new TransformError(
      'INVALID_WORKFLOW_CONFIG',
      `workflow 的 ${fieldName} 不是合法 JSON`,
      { field: fieldName, cause: error.message },
    );
  }
}

function listRecords(source) {
  if (Array.isArray(source)) return source;
  if (Array.isArray(source?.data?.list)) return source.data.list;
  if (Array.isArray(source?.list)) return source.list;
  if (source?.uni_fun_code) return [source];
  throw new TransformError(
    'INVALID_WORKFLOW_SOURCE',
    '输入必须是 workflow/list 响应、list 数组或单个 workflow 配置',
  );
}

export function selectWorkflow(source, uniFunCode) {
  if (!uniFunCode) {
    throw new TransformError('MODEL_REQUIRED', '缺少 uni_fun_code/model');
  }

  const record = listRecords(source).find(
    (item) => item?.uni_fun_code === uniFunCode,
  );
  if (!record) {
    throw new TransformError(
      'MODEL_NOT_FOUND',
      `workflow/list 中找不到模型 ${uniFunCode}`,
      { uni_fun_code: uniFunCode },
    );
  }
  return record;
}

export function normalizeWorkflow(record) {
  if (!record?.uni_fun_code) {
    throw new TransformError(
      'INVALID_WORKFLOW_RECORD',
      'workflow 配置缺少 uni_fun_code',
    );
  }

  const aiConfig = parseJsonField(record.aigc_config, 'aigc_config', []);
  const uiConfig = parseJsonField(record.ui_config, 'ui_config', {});
  const actionConfig = parseJsonField(
    record.action_config,
    'action_config',
    {},
  );
  const creditConfig = parseJsonField(
    record.credit_config,
    'credit_config',
    {},
  );
  if (!Array.isArray(aiConfig) || aiConfig.length === 0) {
    throw new TransformError(
      'INVALID_WORKFLOW_CONFIG',
      'aigc_config 必须是非空数组',
    );
  }
  if (!Array.isArray(uiConfig?.params_ui)) {
    throw new TransformError(
      'INVALID_WORKFLOW_CONFIG',
      'ui_config.params_ui 必须是数组',
    );
  }

  return {
    ...clone(record),
    aiConfig,
    uiConfig,
    actionConfig,
    creditConfig,
  };
}

function allAlgorithmParams(aiConfig) {
  return aiConfig.flatMap((workflow) =>
    (workflow?.params ?? []).flatMap((group) => group?.paraslist ?? []),
  );
}

function algorithmParamMap(aiConfig) {
  const result = new Map();
  for (const param of allAlgorithmParams(aiConfig)) {
    if (!result.has(param?.pramas_name)) {
      result.set(param?.pramas_name, param);
    }
  }
  return result;
}

function bool(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function valueIsEmpty(value) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

function csvValues(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => csvValues(item)).filter(Boolean);
  }
  if (value == null || value === '') return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function serializeFieldValue(value, config) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(',');
  if (typeof value === 'object' && config?.type === 'backfill') {
    const targets = Array.isArray(config.backfill)
      ? config.backfill
      : [config.backfill].filter(Boolean);
    return targets
      .map((target) => {
        const targetValue = value[target];
        return Array.isArray(targetValue) ? targetValue.join(',') : targetValue ?? '';
      })
      .join('::');
  }
  return value;
}

function normalizedOptionValue(value) {
  if (Array.isArray(value)) return value.join(':');
  return value;
}

function sameOptionValue(left, right) {
  return String(normalizedOptionValue(left)) === String(normalizedOptionValue(right));
}

function dependencyValues(inputs, context) {
  return {
    ...inputs,
    account: context.account ?? context.accountTier,
    country_limited: resolveCountryLimited(context, false),
  };
}

function ruleAllows(rule, values, ignoreMissing = true) {
  if (!rule?.field) return true;
  const current = values[rule.field];
  if (current === undefined && ignoreMissing) return true;
  const candidates = String(rule.val ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if ((rule.opt ?? 'in') === 'in') {
    return candidates.includes(String(current));
  }
  return String(current ?? '') === String(rule.val ?? '');
}

function configIsVisible(config, values) {
  const showRules = config?.rule?.show;
  if (!Array.isArray(showRules)) return true;
  return showRules.every((rule) => ruleAllows(rule, values, false));
}

function resolveConfiguredValue(config, value, values) {
  if (!Array.isArray(config?.options) || config.options.length === 0) {
    return value;
  }

  const matched = config.options.find((option) => {
    if (typeof option !== 'object' || option == null) {
      return sameOptionValue(option, value);
    }
    return (
      sameOptionValue(option.value, value)
      || sameOptionValue(option.name, value)
      || sameOptionValue(option.alias, value)
    );
  });
  if (!matched) return value;
  if (typeof matched !== 'object' || matched == null) return matched;

  const showRules = matched?.rule?.show;
  if (
    Array.isArray(showRules)
    && !showRules.every((rule) => ruleAllows(rule, values, true))
  ) {
    throw new TransformError(
      'OPTION_NOT_AVAILABLE',
      `字段 ${config.param} 的选项 ${value} 在当前条件下不可用`,
      { field: config.param, value },
    );
  }
  return normalizedOptionValue(matched.value);
}

function directParamDefault(config, params) {
  if (config?.default !== undefined && config?.default !== null && config.default !== '') {
    return config.default;
  }
  if (config?.type === 'backfill') {
    if (config?.default === '') return '';
    const targets = Array.isArray(config?.backfill)
      ? config.backfill
      : [config?.backfill].filter(Boolean);
    const defaults = targets.map((target) => params.get(target)?.default ?? '');
    return defaults.some((item) => item !== '')
      ? defaults.join(config?.param === 'ratio' ? ':' : ',')
      : '';
  }
  return params.get(config?.param)?.default ?? config?.default ?? '';
}

function normalizeInputShape(request) {
  if (request?.inputs && typeof request.inputs === 'object') {
    return clone(request.inputs);
  }
  if (Array.isArray(request?.fields)) {
    return Object.fromEntries(
      request.fields.map((item) => [item.field, item.val]),
    );
  }
  if (request && typeof request === 'object') {
    const { context: _context, model: _model, uni_fun_code: _code, ...inputs } = request;
    return clone(inputs);
  }
  throw new TransformError('INVALID_INPUT', '用户输入必须是 JSON 对象');
}

function buildFields(workflow, request, context) {
  const inputs = normalizeInputShape(request);
  const params = algorithmParamMap(workflow.aiConfig);
  const values = dependencyValues(inputs, context);
  const configs = workflow.uiConfig.params_ui;
  const fieldRecords = [];
  const known = new Set(configs.map((config) => config.param));
  const directParams = new Set(params.keys());

  for (const config of configs) {
    if (!configIsVisible(config, values)) continue;

    const hasInput = Object.prototype.hasOwnProperty.call(inputs, config.param);
    let rawValue = hasInput
      ? inputs[config.param]
      : directParamDefault(config, params);
    rawValue = resolveConfiguredValue(config, rawValue, values);

    const required = config.required ?? true;
    if (required && valueIsEmpty(rawValue)) {
      throw new TransformError(
        'REQUIRED_INPUT_MISSING',
        `缺少必填字段 ${config.param}`,
        { field: config.param, ui: config.ui },
      );
    }

    fieldRecords.push({
      field: {
        val: serializeFieldValue(rawValue, config),
        field: config.param,
        required,
        default: config.default ?? '',
        type: config.type ?? 'normal',
        ...(config.backfill !== undefined ? { backfill: clone(config.backfill) } : {}),
        ...(config.append !== undefined ? { append: clone(config.append) } : {}),
      },
      config,
      rawValue,
    });
  }

  for (const [field, rawValue] of Object.entries(inputs)) {
    if (known.has(field)) continue;
    if (!directParams.has(field)) {
      throw new TransformError(
        'UNKNOWN_INPUT_FIELD',
        `模型 ${workflow.uni_fun_code} 不支持字段 ${field}`,
        { field, supported: [...known].sort() },
      );
    }
    fieldRecords.push({
      field: { val: serializeFieldValue(rawValue), field, type: 'normal' },
      config: null,
      rawValue,
    });
  }

  return { fieldRecords, fields: fieldRecords.map((item) => item.field) };
}

function splitBackfillValue(value, targets) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return targets.map((target) => value[target] ?? '');
  }
  if (typeof value !== 'string') return [value];
  if (value.includes('::')) return value.split('::');
  if (value.includes(',')) return value.split(',');
  if (value.includes(':')) return value.split(':');
  return [value];
}

function firstUploadMetadata(context) {
  if (Array.isArray(context.uploads)) return context.uploads[0] ?? null;
  if (context.upload && typeof context.upload === 'object') return context.upload;
  return null;
}

export function calcAutoSize(width, height, options = {}) {
  const {
    targetPixels = 1024 * 1024,
    align = 8,
    allowUpscale = false,
    longSideRange = null,
  } = options;
  if (!(width > 0) || !(height > 0)) {
    throw new TransformError(
      'UPLOAD_METADATA_INVALID',
      'autoWidth/autoHeight 需要合法的上传媒体 width 和 height',
    );
  }

  const ratio = width / height;
  let outHeight = Math.sqrt(targetPixels / ratio);
  let outWidth = outHeight * ratio;
  if (longSideRange) {
    const longSide = Math.max(outWidth, outHeight);
    if (longSideRange.min && longSide < longSideRange.min) {
      const scale = longSideRange.min / longSide;
      outWidth *= scale;
      outHeight *= scale;
    }
    if (longSideRange.max && longSide > longSideRange.max) {
      const scale = longSideRange.max / longSide;
      outWidth *= scale;
      outHeight *= scale;
    }
  }
  if (!allowUpscale) {
    const scale = Math.min(1, width / outWidth, height / outHeight);
    outWidth *= scale;
    outHeight *= scale;
  }
  return {
    width: Math.round(outWidth / align) * align,
    height: Math.round(outHeight / align) * align,
  };
}

function replaceAutoDimension(value, context) {
  if (value !== 'autoWidth' && value !== 'autoHeight') return value;
  const upload = firstUploadMetadata(context) ?? {};
  const size = calcAutoSize(Number(upload.width), Number(upload.height));
  return value === 'autoWidth' ? String(size.width) : String(size.height);
}

function mutateAiConfig(aiConfig, fieldRecords, module, context) {
  const result = clone(aiConfig);
  const params = algorithmParamMap(result);
  const appendRecords = [];

  for (const record of fieldRecords) {
    const { config, rawValue } = record;
    const fieldName = record.field.field;
    const type = config?.type ?? 'normal';
    const directParam = params.get(fieldName);

    if (type === 'append' && !directParam) {
      appendRecords.push(record);
      continue;
    }

    if (type === 'backfill') {
      const targets = Array.isArray(config?.backfill)
        ? config.backfill
        : [config?.backfill].filter(Boolean);
      const values = splitBackfillValue(rawValue, targets);
      targets.forEach((target, index) => {
        const param = params.get(target);
        if (!param) return;
        const value = replaceAutoDimension(values[index] ?? '', context);
        param.input = config?.used_array
          ? JSON.stringify(csvValues(value))
          : value;
      });
      continue;
    }

    if (!directParam) continue;
    if ((module === 'image2image' && fieldName === 'images') || config?.used_array) {
      const values = csvValues(rawValue);
      directParam.input = values.length > 0
        ? JSON.stringify(values)
        : directParam.default;
      continue;
    }

    directParam.input = config?.prefix
      ? `${config.prefix},${rawValue}`
      : rawValue;
  }

  for (const record of appendRecords) {
    const targetName = record.config?.append?.param;
    const target = params.get(targetName);
    if (!target) continue;
    const value = record.rawValue;
    if (record.config?.append?.mode === 'front') {
      target.input = `${value},${target.input}`;
    } else {
      target.input = `${target.input},${value}`;
    }
  }

  return result;
}

function resolveCountryLimited(context, required) {
  const explicit = context.countryLimited ?? context.country_limited;
  if (explicit === 't3' || explicit === 'not_t3') return explicit;
  if (typeof context.isT3Country === 'boolean') {
    return context.isT3Country ? 't3' : 'not_t3';
  }
  if (required) {
    throw new TransformError(
      'COUNTRY_SEGMENT_REQUIRED',
      '该模型启用了 country_limited；请提供 context.countryLimited=t3|not_t3 或 context.isT3Country',
    );
  }
  return undefined;
}

function fieldValue(fields, name) {
  return fields.find((item) => item.field === name)?.val;
}

function fieldRuleMatches(rule, inputs, countryLimited) {
  const current = rule?.field === 'country_limited'
    ? countryLimited
    : inputs[rule?.field];
  const candidates = String(rule?.val ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if ((rule?.opt ?? 'in') === 'in') {
    return candidates.includes(String(current));
  }
  return String(current ?? '') === String(rule?.val ?? '');
}

export function estimateCredits(workflow, inputs, context = {}) {
  if (context.creditsNumber !== undefined) return context.creditsNumber;
  if (context.free === true) return 0;
  if (context.isPremium && bool(inputs.unlimit)) return 0;

  const config = workflow.creditConfig ?? {};
  if (config.type === 'fixed') return config.val ?? 1;
  if (config.type === 'field_conf' && Array.isArray(config.field_conf)) {
    const countryLimited = resolveCountryLimited(context, false);
    const match = config.field_conf.find((item) => {
      const rules = Array.isArray(item?.fields) ? item.fields : [];
      if (
        workflow.actionConfig?.country_limited
        && !rules.some((rule) => rule?.field === 'country_limited')
      ) {
        return false;
      }
      return rules.every((rule) => fieldRuleMatches(rule, inputs, countryLimited));
    });
    if (match) return match.val;
  }
  return config.val ?? 1;
}

function publishingContext(context) {
  const isPublic = bool(context.isPublic ?? context.publish);
  const publishZone = context.publishZone ?? context.publish_zone ?? '';
  const paid = bool(
    context.isSubscribed
    || context.isPremium
    || context.isSubscribedOrPremium,
  );
  const needPublish = paid ? isPublic : isPublic && Boolean(publishZone);
  return {
    explore: context.explore ?? needPublish,
    needPublish,
    publishZone: isPublic && Boolean(publishZone),
    slugs: context.slugs ?? (
      isPublic && publishZone
        ? [publishZone, context.slugCategory ?? DEFAULT_EXPLORE_SLUG]
        : isPublic && paid
          ? [context.slugCategory ?? DEFAULT_EXPLORE_SLUG]
          : []
    ),
  };
}

export function transformComboAlgPayload(source, request = {}) {
  const uniFunCode = request.uni_fun_code ?? request.model;
  const workflow = normalizeWorkflow(selectWorkflow(source, uniFunCode));
  const context = { ...(request.context ?? {}) };
  const { fieldRecords, fields } = buildFields(workflow, request, context);
  const aiConfig = mutateAiConfig(
    workflow.aiConfig,
    fieldRecords,
    workflow.fun_module,
    context,
  );
  const publication = publishingContext(context);
  const countryLimited = workflow.actionConfig?.country_limited
    ? resolveCountryLimited(context, true)
    : resolveCountryLimited(context, false);
  const normalizedInputs = Object.fromEntries(
    fields.map((item) => [item.field, item.val]),
  );
  const patternNum = fieldValue(fields, 'concurrency_patterns');
  const idle = fieldValue(fields, 'idle') ?? fieldValue(fields, 'is_idle');
  const usedUnlimited = fieldValue(fields, 'unlimit');
  const creditsNumber = estimateCredits(workflow, normalizedInputs, context);
  const prevTask = context.prevTask ?? context.prev_task ?? '';

  const data = {
    ai_config: aiConfig,
    action_config: clone(workflow.actionConfig),
    uni_fun_code: workflow.uni_fun_code,
    fun_module: workflow.fun_module,
    fun_category: workflow.fun_category ?? '',
    media: workflow.media,
    used_unlimited: bool(usedUnlimited),
    idle: bool(idle),
    need_publish: publication.needPublish,
    publish_zone: publication.publishZone,
    slugs: clone(publication.slugs),
    concurrency_patterns: Number(patternNum) > 0,
  };
  if (patternNum !== undefined) data.concurrency_patterns_count = patternNum;
  if (countryLimited) data.country_limited = countryLimited;

  const userData = {
    data: { fields: clone(fields) },
    resultFileType: workflow.media
      ?? (IMAGE_MODULES.has(workflow.fun_module) ? 'image' : 'video'),
    originalFileStorage: 'oss',
    originalFileType: 'image',
    resultKey: 'request_data.viduResult',
    taskSource: 'hook',
    resultFileStorage: 'oss',
    resultMedia: workflow.media,
    template_id: context.templateId ?? context.template_id ?? '',
    thumbnail_url: context.thumbnailUrl ?? context.thumbnail_url ?? '',
    cap_id: context.capId ?? context.cap_id ?? '',
    name: workflow.name,
    description: workflow.description,
    group: workflow.group,
    category: workflow.fun_category,
    uniqueCode: workflow.uni_fun_code,
    isHookTask: true,
    credits_number: creditsNumber,
    fields: clone(fields),
    explore: publication.explore,
    isFromCRCTpl: true,
    isFromTpl: true,
    module: workflow.fun_module,
    promptValues: context.promptValues ?? null,
    exploreTrackInfo: clone(context.exploreTrackInfo ?? {}),
    not_publish_explore: bool(workflow.actionConfig?.not_publish_explore),
    ...(workflow.type !== undefined ? { type: workflow.type } : {}),
    ...(context.tracking ?? {}),
    ...(context.userData ?? {}),
    prev_task: prevTask,
  };

  const chipConfig = workflow.uiConfig.params_ui.find(
    (item) => item?.chip && item?.chip_mode,
  );
  if (chipConfig) {
    userData.chip = true;
    userData.chip_mode = chipConfig.chip_mode;
  }

  return {
    data,
    prev_task: prevTask,
    explore: publication.explore,
    user_data: userData,
    module: workflow.fun_module,
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--pretty') options.pretty = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const value = args[index + 1];
      if (value == null || value.startsWith('--')) {
        throw new TransformError('CLI_ARGUMENT_INVALID', `${arg} 缺少值`);
      }
      options[key] = value;
      index += 1;
    } else {
      throw new TransformError('CLI_ARGUMENT_INVALID', `无法识别参数 ${arg}`);
    }
  }
  return options;
}

function readJson(path) {
  const text = path === '-'
    ? fs.readFileSync(0, 'utf8')
    : fs.readFileSync(path, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new TransformError('JSON_INVALID', `${path} 不是合法 JSON`, {
      path,
      cause: error.message,
    });
  }
}

function outputJson(value, options) {
  const text = `${JSON.stringify(value, null, options.pretty ? 2 : 0)}\n`;
  if (options.output) fs.writeFileSync(options.output, text);
  else process.stdout.write(text);
}

function usage() {
  return `用法：
  node combo-alg-transformer.mjs --workflow-list <list.json> --model <uni_fun_code> --input <input.json> [--output <file>] [--pretty]

说明：
  --workflow-list       /v1/workflow/list 的完整响应、list 数组或单模型配置
  --input               {"inputs": {...}, "context": {...}}；传 - 可从 stdin 读取
  输出                  只包含转换后的 combo_alg JSON body
`;
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  if (!options.workflowList) {
    throw new TransformError('CLI_ARGUMENT_INVALID', '缺少 --workflow-list');
  }
  if (!options.model) {
    throw new TransformError('CLI_ARGUMENT_INVALID', '缺少 --model');
  }
  if (!options.input) {
    throw new TransformError('CLI_ARGUMENT_INVALID', '缺少 --input');
  }

  const source = readJson(options.workflowList);
  const requestInput = readJson(options.input);
  const payload = transformComboAlgPayload(source, {
    ...requestInput,
    model: options.model,
  });
  outputJson(payload, options);
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1]);
if (isMain) {
  try {
    runCli();
  } catch (error) {
    const body = error instanceof TransformError
      ? { error: { code: error.code, message: error.message, details: error.details } }
      : { error: { code: 'UNEXPECTED_ERROR', message: error.message } };
    process.stderr.write(`${JSON.stringify(body, null, 2)}\n`);
    process.exitCode = 1;
  }
}
