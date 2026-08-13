#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  transformComboAlgPayload,
} from '../../skills/mediaio-combo-alg-transformer/scripts/combo-alg-transformer.mjs';

const MODEL = 'text2image_soul_character';
const LIST_URL = 'https://vapi.media.io/v1/workflow/list?fun_module=text2image&page=0&page_size=40';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultOutputDir = path.join(scriptDir, '.output');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--reset-input') {
      options.resetInput = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--output-dir' || arg === '--input') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} 缺少值`);
      }
      options[arg === '--output-dir' ? 'outputDir' : 'input'] = value;
      index += 1;
      continue;
    }
    throw new Error(`无法识别参数 ${arg}`);
  }
  return options;
}

function usage() {
  return `用法：
  node tests/mediaio-combo-alg-transformer/run-live-test.mjs [--output-dir <dir>] [--input <input.json>] [--reset-input]

默认行为：
  1. 请求 ${LIST_URL}
  2. 提取 ${MODEL} 并写入 <model>.workflow.json
  3. 首次运行时生成 <model>.input.json；后续运行读取该文件
  4. 转换并写入 <model>.combo-alg-body.json，同时把完整 body 输出到 stdout
`;
}

function resolveFromCwd(value) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`无法读取 JSON ${filePath}: ${error.message}`);
  }
}

function recordsFromListResponse(source) {
  if (Array.isArray(source?.data?.list)) return source.data.list;
  if (Array.isArray(source?.list)) return source.list;
  throw new Error('workflow/list 响应中缺少 data.list');
}

function selectModelRecord(source) {
  const record = recordsFromListResponse(source).find(
    (item) => item?.uni_fun_code === MODEL,
  );
  if (!record) {
    throw new Error(`workflow/list 中找不到模型 ${MODEL}`);
  }
  return record;
}

function inputTemplate() {
  return {
    inputs: {
      prompt: 'A cinematic portrait with soft natural light',
      ratio: '2:3',
      concurrency_patterns: 4,
    },
    context: {
      countryLimited: 'not_t3',
      isPublic: false,
      isSubscribed: false,
      templateId: '',
    },
  };
}

async function fetchWorkflowList() {
  const response = await fetch(LIST_URL, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`workflow/list 请求失败: HTTP ${response.status} ${responseText.slice(0, 500)}`);
  }
  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new Error(`workflow/list 返回的不是合法 JSON: ${error.message}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }

  const outputDir = options.outputDir
    ? resolveFromCwd(options.outputDir)
    : defaultOutputDir;
  const workflowPath = path.join(outputDir, `${MODEL}.workflow.json`);
  const inputPath = options.input
    ? resolveFromCwd(options.input)
    : path.join(outputDir, `${MODEL}.input.json`);
  const bodyPath = path.join(outputDir, `${MODEL}.combo-alg-body.json`);

  const listResponse = await fetchWorkflowList();
  const workflowRecord = selectModelRecord(listResponse);
  writeJson(workflowPath, workflowRecord);

  if (options.resetInput || !fs.existsSync(inputPath)) {
    writeJson(inputPath, inputTemplate());
  }
  const userInput = readJson(inputPath);
  const payload = transformComboAlgPayload(workflowRecord, {
    ...userInput,
    model: MODEL,
  });
  writeJson(bodyPath, payload);

  process.stderr.write([
    `workflow: ${workflowPath}`,
    `input:    ${inputPath}`,
    `body:     ${bodyPath}`,
    '',
  ].join('\n'));
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    error: {
      code: 'LIVE_TEST_FAILED',
      message: error.message,
    },
  }, null, 2)}\n`);
  process.exitCode = 1;
});
