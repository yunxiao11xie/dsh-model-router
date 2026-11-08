/**
 * dsh-model-router: a serial orchestration layer for the DeepSeek Harness.
 *
 * The plugin keeps a catalog of model profiles (built-in defaults plus user
 * overrides). One model-facing tool, `delegate`, lets the main agent split a
 * request into subtasks, pick a model per subtask against the catalog, and
 * hand each subtask to a child agent on that route. Delegation follows the
 * host's session model-selection policy, falls back to a configured default
 * model, and records why each route was chosen.
 *
 * Host-only: no browser half.
 */

/** Built-in model catalog; user config with the same id merges over it.
 *  Names calibrated against each vendor's current lineup (2026-11):
 *  DeepSeek deepseek-flash(V4.1-Flash)/deepseek-v4-pro, Zhipu GLM-5.3 family,
 *  Doubao doubao-seed-evolving (evergreen id), Kimi K3.1 Pro/K3, Qwen 3.8,
 *  Tencent hunyuan-turbos-latest, MiniMax M3.1 Flash, Xiaomi MiMo (via Bailian).
 *  OpenAI GPT-6 family. */
const DEFAULT_MODELS = [
  {
    id: 'deepseek-flash',
    provider: 'deepseek-account',
    strengths: ['coding', 'frontend', 'ui', 'fast-iteration', 'vision'],
    notes: 'DeepSeek V4.1-Flash：1M 上下文、支持图像理解、成本极低；适合 UI、前端、快速原型与高并发轻量任务',
    cost: 'low',
  },
  {
    id: 'deepseek-v4-pro',
    provider: 'deepseek-account',
    strengths: ['hard-reasoning', 'backend', 'complex-analysis'],
    notes: 'DeepSeek V4 Pro 旗舰：深度推理与复杂分析；账号额度是否覆盖以实际为准',
    cost: 'high',
  },
  {
    id: 'glm-5.3',
    provider: 'zai-coding-cn',
    strengths: ['coding', 'backend', 'engineering-rigor', 'agent', 'review', 'debugging'],
    notes: 'GLM-5.3 旗舰：编程与智能体能力突出（1M 上下文）；适合服务端、基础设施、审查与长程工程任务',
    cost: 'medium',
  },
  {
    id: 'glm-5.3-flash',
    provider: 'zai-coding-cn',
    strengths: ['multimodal', 'coding', 'fast-iteration', 'frontend'],
    notes: 'GLM-5.3-Flash：原生多模态（图片视频）、可生成可交互代码，FlashX 变体约 200 tokens/s；普惠低价',
    cost: 'low',
  },
  {
    id: 'doubao-seed-evolving',
    provider: 'volcengine',
    strengths: ['chinese', 'chinese-writing', 'agent', 'documents', 'vision'],
    notes: '豆包 Seed 旗舰（火山方舟）：单一 Model ID 持续演进、自动升级最新版；1M 上下文、深度思考、图片/视频理解；中文理解与中文生产质量突出，Agent 编排与工具调用强',
    cost: 'medium',
  },
  {
    id: 'hunyuan-turbos-latest',
    provider: 'tencent',
    strengths: ['chinese', 'chinese-writing', 'documents', 'long-context'],
    notes: '腾讯混元旗舰（OpenAI 兼容，latest 常青 id 自动跟随最新版）；中文理解与长文生产性价比高；混元服务正逐步迁移至腾讯 TokenHub',
    cost: 'low',
  },
  {
    id: 'MiniMax-M3.1-Flash',
    provider: 'minimax',
    strengths: ['long-context', 'chinese', 'fast-iteration', 'voice-ecosystem'],
    notes: 'MiniMax 现役新一代（2026-11）；M2.5/M2.7 已于 2026-11-18 下线勿再用；长文本与语音生态见长，价格低',
    cost: 'low',
  },
  {
    id: 'mimo-v2.6-pro-ultraspeed',
    provider: 'alibaba',
    strengths: ['fast-iteration', 'translation', 'documents'],
    notes: '小米 MiMo 超低延迟档，经阿里百炼调用；适合高吞吐轻量任务（分类、抽取、批量翻译）',
    cost: 'low',
  },
  {
    id: 'kimi-k3.1-pro',
    provider: 'moonshot',
    strengths: ['long-context', 'research', 'chinese-writing', 'vision'],
    notes: 'Kimi K3.1 Pro（2026-11 现役旗舰）：1M 上下文、自动上下文缓存、批量推理 6 折；适合超长文档检索、资料整理与中文写作',
    cost: 'medium',
  },
  {
    id: 'kimi-k3',
    provider: 'moonshot',
    strengths: ['long-context', 'documents', 'fast-iteration'],
    notes: 'Kimi K3：1M 上下文的标准档，成本低于 Pro；K2 系列 2026-12 底下线，勿再用',
    cost: 'low',
  },
  {
    id: 'qwen3.8-max',
    provider: 'alibaba',
    strengths: ['reasoning', 'coding', 'presentation', 'chinese-docs'],
    notes: '通义千问 3.8-Max：复杂推理与编程；也适合演示文稿与中文公文长文',
    cost: 'medium',
  },
  {
    id: 'qwen3.8-flash',
    provider: 'alibaba',
    strengths: ['fast-iteration', 'documents', 'translation'],
    notes: '通义千问 3.8-Flash：快速低成本，适合批量文档处理与翻译',
    cost: 'low',
  },
  {
    id: 'gpt-6-astra',
    provider: 'openai',
    strengths: ['hard-reasoning', 'general', 'english-writing'],
    notes: 'GPT-6 Astra：OpenAI 当前旗舰，最高难度推理与英文写作',
    cost: 'high',
  },
  {
    id: 'gpt-6.1-sol',
    provider: 'openai',
    strengths: ['reasoning', 'coding', 'english-writing'],
    notes: 'GPT-6.1 Sol：接近 Astra 的性能、成本更低；适合大部分专业工作',
    cost: 'medium',
  },
];

/** @param {unknown} value */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Build the effective catalog: built-in defaults, then user entries merged
 * over them by id (new ids appended). Returns a Map<id, profile> and the
 * fallback default model id.
 * @param {unknown} rawModels
 * @param {unknown} rawDefault
 */
function buildCatalog(rawModels, rawDefault) {
  const catalog = new Map(
    DEFAULT_MODELS.map((profile) => [profile.id, { strengths: [], notes: '', cost: 'medium', ...profile }]),
  );

  if (Array.isArray(rawModels)) {
    for (const entry of rawModels) {
      if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id.trim() === '') continue;
      if (typeof entry.provider !== 'string' || entry.provider.trim() === '') continue;
      const id = entry.id.trim();
      const base = catalog.get(id) ?? { id, strengths: [], notes: '', cost: 'medium' };
      catalog.set(id, { ...base, ...entry, id, provider: entry.provider.trim() });
    }
  }

  const requested = typeof rawDefault === 'string' ? rawDefault.trim() : '';
  const defaultModel = requested !== '' && catalog.has(requested) ? requested : catalog.keys().next().value;

  return { catalog, defaultModel };
}

/** Text of one ContentBlock[] result, ignoring non-text blocks. */
function textOf(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter((block) => isRecord(block) && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/**
 * Resolve the model routes this Session may delegate to, following the host's
 * own rule: the Session's recorded model-selection policy wins; without one,
 * only the parent Agent's current route is allowed.
 * @returns {{ kind: 'policy', allowed: unknown[] } | { kind: 'parent', parent?: { provider: string, model: string } } | { kind: 'unknown' }}
 */
function readSessionPolicy(ctx, agent) {
  const sessions = ctx.get('sessions');
  if (sessions === undefined || sessions === null || typeof sessions.get !== 'function') {
    return { kind: 'unknown' };
  }
  const session = sessions.get(agent.id);
  if (session === undefined || session === null) {
    return { kind: 'unknown' };
  }

  const events = typeof session.ownEvents === 'function' ? session.ownEvents() : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (isRecord(event) && event.type === 'subagent/model-selection-policy') {
      const data = isRecord(event.data) ? event.data : {};
      const allowed = Array.isArray(data.allowedModels) ? data.allowedModels : [];
      return { kind: 'policy', allowed };
    }
  }

  const header = typeof session.requestHeader === 'function' ? session.requestHeader() : undefined;
  const config = isRecord(header) && isRecord(header.config) ? header.config : {};
  const parent =
    typeof config.provider === 'string' && typeof config.model === 'string'
      ? { provider: config.provider, model: config.model }
      : undefined;
  return { kind: 'parent', parent };
}

/** Whether one configured route is permitted by the Session policy state. */
function routeInPolicy(route, state) {
  const matches = (entry) =>
    isRecord(entry) && entry.provider === route.provider && entry.model === route.model;
  if (state.kind === 'policy') return state.allowed.some(matches);
  if (state.kind === 'parent') return state.parent !== undefined && matches(state.parent);
  return false;
}

/** A readable, actionable policy refusal for one route. */
function policyRefusal(route, state) {
  if (state.kind === 'policy') {
    const allowed =
      state.allowed
        .filter((entry) => isRecord(entry) && typeof entry.provider === 'string' && typeof entry.model === 'string')
        .map((entry) => `${entry.provider}/${entry.model}`)
        .join(', ') || '（无）';
    return (
      `路由 ${route.provider}/${route.model} 不在本会话的模型选择策略里。` +
      `当前允许：${allowed}。请到「插件 → Subagent → Model selection」勾选该路由，然后新开会话（策略只对新会话生效）。`
    );
  }
  if (state.kind === 'parent') {
    const parent = state.parent === undefined ? '（未知）' : `${state.parent.provider}/${state.parent.model}`;
    return (
      `本会话没有记录模型选择策略，只能使用父会话当前路由（${parent}）。` +
      `请到「插件 → Subagent → Model selection」勾选 ${route.provider}/${route.model}，然后新开会话。`
    );
  }
  return '无法读取本会话的模型选择策略，已拒绝委派。';
}

/** The prompt section that teaches the main agent how to route subtasks. */
function catalogPrompt(catalog, defaultModel) {
  const lines = [...catalog.values()].map(
    (profile) =>
      `- \`${profile.id}\`（${profile.provider}，成本 ${profile.cost}）：擅长 ${(profile.strengths ?? []).join('、')}${profile.notes === '' ? '' : `；${profile.notes}`}`,
  );
  return [
    '## Delegating subtasks to other models',
    'You can hand a self-contained subtask to another model with the `delegate` tool. Choose the model yourself, per subtask:',
    '',
    ...lines,
    `- Fallback: \`${defaultModel}\` is used automatically when a named model is not in the catalog, and the result says so.`,
    '',
    'How to decide:',
    '1. Split the request into independent subtasks first. Subtasks can be any kind of work — code, documents, slides, translation, research.',
    '2. For each subtask, judge what it needs (kind of work, language, rigor, speed) and match that against the catalog strengths. Example: a React page suits a model strong in `frontend`/`ui`; a PPT deck suits `presentation`/`slides`; a careful audit suits `engineering-rigor`/`review`.',
    '3. State the match in `reason` — why this model for this subtask. When nothing clearly fits, name the fallback model and say why.',
    '4. Delegate one subtask at a time and wait for the result before the next; review each result before continuing, then verify the combined outcome and report it briefly.',
    'The child starts with a fresh context: write a complete brief (goal, constraints, files, acceptance criteria, working directory). Routes must also be allowed by this Session model-selection policy. Do not delegate work you can do directly, and never put secrets in a brief.',
  ].join('\n');
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {unknown} config
 */
export const inject = ['tools', 'systemPrompt'];

export function apply(ctx, config) {
  const conf = isRecord(config) ? config : {};
  const { catalog, defaultModel } = buildCatalog(conf.models, conf.defaultModel);

  ctx.effect(
    () =>
      ctx.tools.register({
        name: 'delegate',
        description:
          'Delegate one self-contained subtask to a model from the catalog and wait for its result inline. ' +
          'The child starts with a fresh context, so the brief must be complete. ' +
          'Pick the model per subtask against the catalog strengths; a model outside the catalog falls back to the configured default.',
        parameters: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              description: 'Catalog id of the model to use, for example deepseek-flash or glm-5.3.',
            },
            title: {
              type: 'string',
              description: 'Short task title used for the child session label.',
            },
            brief: {
              type: 'string',
              description:
                'Complete, self-contained instructions for the child: goal, constraints, files, acceptance criteria, and the working directory.',
            },
            reason: {
              type: 'string',
              description: 'Why this model fits this subtask, in one sentence, against the catalog strengths.',
            },
            cwd: {
              type: 'string',
              description: 'Optional working directory for the child; defaults to the caller current directory.',
            },
          },
          required: ['model', 'title', 'brief', 'reason'],
        },
        output: {
          schema: {
            type: 'object',
            properties: {
              model: { type: 'string' },
              route: { type: 'string' },
              fallback: { type: 'boolean' },
              fallbackFrom: { type: 'string' },
              reason: { type: 'string' },
              subagentId: { type: 'string' },
              stopReason: { type: 'string' },
              output: { type: 'string' },
            },
            required: ['model', 'route', 'output'],
          },
          render(args, value) {
            const text = isRecord(value) && typeof value.output === 'string' ? value.output : '';
            return [{ type: 'text', text: text === '' ? '(the delegated task returned no text)' : text }];
          },
        },
        timeoutMs: 30 * 60 * 1000,
        isConcurrencySafe() {
          return false;
        },
        async execute(args, exec) {
          const record = isRecord(args) ? args : {};
          const requestedId = typeof record.model === 'string' ? record.model.trim() : '';
          const title = typeof record.title === 'string' ? record.title.trim() : '';
          const brief = typeof record.brief === 'string' ? record.brief.trim() : '';
          const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
          const cwd = typeof record.cwd === 'string' ? record.cwd.trim() : '';
          if (requestedId === '') throw new Error('delegate: model is required');
          if (brief === '') throw new Error('delegate: brief is required and must not be empty');
          if (reason === '') throw new Error('delegate: reason is required (why this model for this subtask)');

          // Catalog lookup with the lenient fallback: an unknown id falls to
          // the configured default model, and the result says so.
          let profile = catalog.get(requestedId);
          let fallback = false;
          if (profile === undefined) {
            profile = catalog.get(defaultModel);
            fallback = true;
            if (profile === undefined) {
              throw new Error(`delegate: no catalog entry for "${requestedId}" and no default model available`);
            }
          }

          const agent = exec.agent;
          if (agent === undefined) {
            throw new Error('delegate: it can only be called from an agent session');
          }

          // Follow the host's delegation rule: a recorded Session policy wins;
          // without one, only the parent Agent's current route may be used.
          const policy = readSessionPolicy(ctx, agent);
          const route = { provider: profile.provider, model: profile.id };
          if (!routeInPolicy(route, policy)) {
            throw new Error(`delegate: ${policyRefusal(route, policy)}`);
          }

          // The policy allows the route; make sure the provider is actually
          // mounted before spending a child on it.
          const llm = ctx.get('llm');
          if (llm !== undefined && llm !== null && typeof llm.listProviders === 'function') {
            const providers = await llm.listProviders();
            const mounted = Array.isArray(providers) && providers.some((p) => isRecord(p) && p.id === profile.provider);
            if (!mounted) {
              throw new Error(
                `delegate: 路由 ${profile.provider}/${profile.model} 在策略内，但 provider「${profile.provider}」当前未配置。` +
                  '请到「设置 → 模型」添加该 provider，或换一个已配置的模型。',
              );
            }
          }

          const subagents = ctx.get('subagents');
          if (subagents === undefined || subagents === null) {
            throw new Error('delegate: the subagents service is unavailable in this profile');
          }

          let activation;
          try {
            activation = await subagents.startActivation({
              provider: 'spawn',
              label: title === '' ? profile.id : `${profile.id}: ${title}`,
              request: {
                prompt: [{ type: 'text', text: brief }],
                parent: agent,
                signal: exec.signal,
                agentOptions: { provider: profile.provider, model: profile.id },
                ...(cwd === '' ? {} : { cwd }),
              },
              signal: exec.signal,
              delivery: 'caller',
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(
              `delegate: could not start the child on ${profile.provider}/${profile.id}: ${message}`,
            );
          }

          let result;
          try {
            result = await activation.result;
          } finally {
            void activation.dispose?.();
          }

          const output = textOf(result?.output ?? []);
          const diagnostic = typeof result?.diagnostic === 'string' ? result.diagnostic : '';
          return {
            model: profile.id,
            route: `${profile.provider}/${profile.id}`,
            ...(fallback ? { fallback: true, fallbackFrom: requestedId } : { fallback: false }),
            reason,
            subagentId: String(activation.childId ?? ''),
            stopReason: typeof result?.stopReason === 'string' ? result.stopReason : String(result?.stopReason ?? ''),
            output: diagnostic === '' ? output : `${output}\n\n[diagnostic] ${diagnostic}`.trim(),
          };
        },
      }),
    'model-router: delegate tool',
  );

  if (catalog.size > 0) {
    ctx.effect(
      () =>
        ctx.systemPrompt.section({
          name: 'model-router.delegation',
          order: 90,
          text: catalogPrompt(catalog, defaultModel),
        }),
      'model-router: prompt section',
    );
  }
}
