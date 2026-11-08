# dsh-model-router

DeepSeek Harness 的串行模型编排层：提供一个 `delegate` 工具，让主代理把任务拆成子任务，对照内置的国内现役模型档案，把每个子任务派给最合适的模型。

主代理始终是编排者。每次 `delegate` 会在选定路由上启动一个全新上下文的子代理，等待结果并内联返回——一次一个子任务、串行执行，每步结果先审查再继续。

## 环境要求

- DeepSeek Harness（带 Web 界面）。包声明 `dsh.bundle`，仅 Host 端（无浏览器部分），`engines.dsh` 为 `>=0.2.0-rc.1 || >=0.2.1-rc.1 || >=0.2.2-rc.1`。
- 模型选择必须被会话策略允许：打开 **插件 → Subagent → Model selection**，开启并勾选要用的路由，然后**新开会话**（策略按新会话记录）。没有记录策略时只允许父会话当前路由——`delegate` 会拒绝并明确说明。

## 安装

```sh
dsh plugin add yunxiao11xie/dsh-model-router
```

## 内置档案（2026-11 校准）

| 模型 | Provider | 适合 |
|---|---|---|
| deepseek-flash（V4.1-Flash） | deepseek-account | 前端、UI、快速迭代、图像理解 |
| deepseek-v4-pro | deepseek-account | 高难推理、复杂分析 |
| glm-5.3 | zai-coding-cn | 后端、工程严谨、审查 |
| glm-5.3-flash | zai-coding-cn | 多模态、快速前端 |
| doubao-seed-evolving | volcengine | 中文写作、Agent（常青 id） |
| hunyuan-turbos-latest | tencent | 中文文档、低成本（常青 id） |
| MiniMax-M3.1-Flash | minimax | 长上下文、批量任务 |
| mimo-v2.6-pro-ultraspeed | alibaba（百炼） | 高吞吐轻量任务 |
| kimi-k3.1-pro / kimi-k3 | moonshot | 长文研究、中文写作 |
| qwen3.8-max / qwen3.8-flash | alibaba | 推理、演示文稿；廉价文档 |
| gpt-6-astra / gpt-6.1-sol | openai | 通用推理、英文写作 |

provider 未配置的条目会被拒绝并给出指引，配置后即可用。可在插件配置里覆盖任意条目或追加新模型：

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

## 代理如何使用

插件注入一段简短的系统提示词：列出档案 + 路由方法论（拆解 → 判断子任务特征 → 对照 strengths 匹配 → 在必填的 `reason` 里说明理由）。任何工作类型都适用——代码、文档、PPT、翻译、调研。

行为规则：

- **串行**：一次一个委派，工具等待结果返回。
- **可审计**：每次调用都记录选型理由。
- **宽松兜底**：点名档案外的模型自动落到 `defaultModel`，结果中注明。
- **策略校验**：路由必须被会话模型选择策略允许且 provider 已挂载；拒绝时说明该怎么做。

## 许可证

MIT
