import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  calcAutoSize,
  transformComboAlgPayload,
  TransformError,
} from '../../skills/mediaio-combo-alg-transformer/scripts/combo-alg-transformer.mjs';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../..');
const transformerScript = path.join(
  repoRoot,
  'skills/mediaio-combo-alg-transformer/scripts/combo-alg-transformer.mjs',
);
const fixture = (name) => JSON.parse(
  fs.readFileSync(path.join(currentDir, 'fixtures', name), 'utf8'),
);

function paramInputs(payload) {
  const params = payload.data.ai_config
    .flatMap((workflow) => workflow.params ?? [])
    .flatMap((group) => group.paraslist ?? []);
  return Object.fromEntries(params.map((param) => [param.pramas_name, param.input]));
}

test('ratio 展示值被转换为 workflow 配置中的真实宽高', () => {
  const payload = transformComboAlgPayload(
    fixture('text2image-soul-character.workflow.json'),
    {
      ...fixture('text2image-soul-character.input.json'),
      model: 'text2image_soul_character',
    },
  );
  const inputs = paramInputs(payload);

  assert.equal(inputs.width, '848');
  assert.equal(inputs.height, '1264');
  assert.equal('method' in payload, false);
  assert.equal('path' in payload, false);
});

test('ToMoviee Lite 转换为与 media-ai 相同层级的 combo_alg body', () => {
  const source = fixture('text2image-soul-character.workflow.json');
  const record = source.data.list[0];
  record.aigc_config = JSON.stringify(record.aigc_config);
  record.ui_config = JSON.stringify(record.ui_config);
  record.action_config = JSON.stringify(record.action_config);
  record.credit_config = JSON.stringify(record.credit_config);
  record.extra_data = JSON.stringify(record.extra_data);

  const input = fixture('text2image-soul-character.input.json');
  const payload = transformComboAlgPayload(source, {
    ...input,
    model: 'text2image_soul_character',
  });
  const fields = payload.user_data.fields;
  const inputs = paramInputs(payload);

  assert.equal(payload.module, 'text2image');
  assert.equal(payload.data.uni_fun_code, 'text2image_soul_character');
  assert.equal(payload.data.country_limited, 'not_t3');
  assert.equal(payload.data.need_publish, true);
  assert.equal(payload.data.publish_zone, false);
  assert.deepEqual(payload.data.slugs, ['explore_all_en']);
  assert.equal(payload.data.concurrency_patterns, true);
  assert.equal(payload.data.concurrency_patterns_count, 4);
  assert.deepEqual(fields.map((item) => [item.field, item.val]), [
    ['prompt', 'A cinematic portrait with soft natural light'],
    ['ratio', '848:1264'],
    ['concurrency_patterns', 4],
  ]);
  assert.equal(inputs.prompt, 'A cinematic portrait with soft natural light');
  assert.equal(inputs.width, '848');
  assert.equal(inputs.height, '1264');
  assert.equal(inputs.template_id, '');
  assert.equal(payload.user_data.credits_number, 0);
  assert.equal(payload.user_data.resultFileType, 'image');
  assert.equal(payload.user_data.ui_mode, 'desktop');
  assert.equal(payload.user_data.prev_task, '');
});

test('country_limited 模型缺少国家分段时拒绝静默猜测', () => {
  const source = fixture('text2image-soul-character.workflow.json');
  assert.throws(
    () => transformComboAlgPayload(source, {
      model: 'text2image_soul_character',
      inputs: {
        prompt: 'portrait',
        ratio: '2:3',
        concurrency_patterns: 4,
      },
    }),
    (error) => error instanceof TransformError
      && error.code === 'COUNTRY_SEGMENT_REQUIRED',
  );
});

test('used_array、mixed media backfill、prefix 和 append 可组合转换', () => {
  const source = {
    data: {
      list: [
        {
          uni_fun_code: 'reference_video_demo',
          fun_module: 'reference2video',
          fun_category: '',
          media: 'video',
          name: 'Reference demo',
          description: '',
          group: '',
          action_config: {},
          credit_config: { type: 'fixed', val: 5 },
          ui_config: {
            params_ui: [
              {
                param: 'mixMedia',
                ui: 'ui_images_videos_audios',
                type: 'backfill',
                used_array: true,
                backfill: [
                  'reference_images',
                  'reference_videos',
                  'reference_audios',
                ],
              },
              {
                param: 'prompt',
                ui: 'ui_prompt',
                type: 'normal',
                prefix: 'cinematic',
              },
              {
                param: 'append_prompt',
                ui: 'ui_style_selector',
                type: 'append',
                append: { param: 'prompt', mode: 'end' },
              },
            ],
          },
          aigc_config: [
            {
              params: [
                {
                  paraslist: [
                    { pramas_name: 'reference_images', default: '', input: '' },
                    { pramas_name: 'reference_videos', default: '', input: '' },
                    { pramas_name: 'reference_audios', default: '', input: '' },
                    { pramas_name: 'prompt', default: '', input: '' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const payload = transformComboAlgPayload(source, {
    model: 'reference_video_demo',
    inputs: {
      mixMedia: {
        reference_images: ['image-1', 'image-2'],
        reference_videos: ['video-1'],
        reference_audios: [],
      },
      prompt: 'a dancer',
      append_prompt: 'watercolor',
    },
  });
  const inputs = paramInputs(payload);

  assert.equal(inputs.reference_images, '["image-1","image-2"]');
  assert.equal(inputs.reference_videos, '["video-1"]');
  assert.equal(inputs.reference_audios, '[]');
  assert.equal(inputs.prompt, 'cinematic,a dancer,watercolor');
  assert.equal(payload.user_data.fields[0].val, 'image-1,image-2::video-1::');
  assert.equal(payload.user_data.credits_number, 5);
});

test('normal used_array 被编码为算法需要的 JSON 数组字符串', () => {
  const source = {
    data: {
      list: [
        {
          uni_fun_code: 'image_array_demo',
          fun_module: 'image2image',
          media: 'image',
          action_config: {},
          credit_config: { type: 'fixed', val: 1 },
          ui_config: {
            params_ui: [
              {
                param: 'images',
                ui: 'ui_simple_upload',
                type: 'normal',
                used_array: true,
              },
            ],
          },
          aigc_config: [
            {
              params: [
                {
                  paraslist: [
                    { pramas_name: 'images', default: '', input: '' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const payload = transformComboAlgPayload(source, {
    model: 'image_array_demo',
    inputs: { images: ['file-1', 'file-2'] },
  });

  assert.equal(paramInputs(payload).images, '["file-1","file-2"]');
  assert.equal(payload.user_data.fields[0].val, 'file-1,file-2');
});

test('autoWidth/autoHeight 复用 media-ai 的约 1MP 对齐算法', () => {
  assert.deepEqual(calcAutoSize(2000, 1000), { width: 1448, height: 728 });
});

test('未知字段直接报错，避免把用户拼写错误静默提交', () => {
  const source = fixture('text2image-soul-character.workflow.json');
  assert.throws(
    () => transformComboAlgPayload(source, {
      model: 'text2image_soul_character',
      inputs: {
        prompt: 'portrait',
        ratio: '2:3',
        concurrency_patterns: 4,
        promtp: 'typo',
      },
      context: { countryLimited: 'not_t3' },
    }),
    (error) => error instanceof TransformError
      && error.code === 'UNKNOWN_INPUT_FIELD',
  );
});

test('CLI 只输出转换后的 body，不输出请求描述', () => {
  const result = spawnSync(process.execPath, [
    transformerScript,
    '--workflow-list',
    path.join(currentDir, 'fixtures/text2image-soul-character.workflow.json'),
    '--model',
    'text2image_soul_character',
    '--input',
    path.join(currentDir, 'fixtures/text2image-soul-character.input.json'),
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.data.uni_fun_code, 'text2image_soul_character');
  assert.equal('method' in payload, false);
  assert.equal('path' in payload, false);
  assert.equal('body' in payload, false);
});
