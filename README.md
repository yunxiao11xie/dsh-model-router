# dsh-model-router

A serial model-orchestration layer for the DeepSeek Harness: a `delegate` tool that lets the main agent split a request into subtasks and hand each one to the model that fits it best, chosen against a built-in catalog of current Chinese-market models.

The main agent keeps the orchestrator role. Each `delegate` call starts a child agent on the chosen route with a fresh context, waits for its result, and returns it inline — one subtask at a time, serially, so results are reviewed before the next step.

## Requirements

- DeepSeek Harness with the Web UI. The package declares a `dsh.bundle` manifest, is Host-only (no browser half), and its `engines.dsh` is `>=0.2.0-rc.1 || >=0.2.1-rc.1 || >=0.2.2-rc.1`.
- Model selection must be allowed by the Session policy: open **Plugins → Subagent → Model selection**, enable it, tick the routes you want, then start a new Session (the policy is recorded per new Session). Without a recorded policy, only the parent Session's current route may be used — `delegate` refuses and says exactly that.

## Install

```sh
dsh plugin add yunxiao11xie/dsh-model-router
```

## Built-in catalog (calibrated 2026-11)

| Model | Provider | Fits |
|---|---|---|
| deepseek-flash (V4.1-Flash) | deepseek-account | frontend, UI, fast iteration, vision |
| deepseek-v4-pro | deepseek-account | hard reasoning, complex analysis |
| glm-5.3 | zai-coding-cn | backend, engineering rigor, review |
| glm-5.3-flash | zai-coding-cn | multimodal, fast frontend work |
| doubao-seed-evolving | volcengine | Chinese writing, agent work (evergreen id) |
| hunyuan-turbos-latest | tencent | Chinese documents, low cost (evergreen id) |
| MiniMax-M3.1-Flash | minimax | long context, batch work |
| mimo-v2.6-pro-ultraspeed | alibaba (Bailian) | high-volume light tasks |
| kimi-k3.1-pro / kimi-k3 | moonshot | long-context research, Chinese writing |
| qwen3.8-max / qwen3.8-flash | alibaba | reasoning, presentations; cheap documents |
| gpt-6-astra / gpt-6.1-sol | openai | general reasoning, English writing |

Entries whose provider is not configured are simply refused with guidance until you add the provider. Override any entry or add your own in the plugin config:

```yaml
- id: model-router
  name: dsh-model-router
  config:
    defaultModel: deepseek-flash
    models:
      - id: glm-5.3
        provider: zai-coding-cn
        strengths: [coding, backend, review]
        notes: ...
        cost: medium
```

## How the agent uses it

The plugin injects a short system-prompt section listing the catalog and a routing method: split the request, judge what each subtask needs (kind of work, language, rigor, speed), match against `strengths`, and state the match in the required `reason` field. Any work type fits — code, documents, slides, translation, research.

Behavior rules:

- **Serial**: one delegation at a time; the tool waits for the result.
- **Auditable**: every call records why that model was chosen.
- **Lenient fallback**: a model id outside the catalog falls back to `defaultModel`, and the result says so.
- **Policy-checked**: routes must be allowed by the Session model-selection policy and have a mounted provider; refusals explain what to do.

## License

MIT
