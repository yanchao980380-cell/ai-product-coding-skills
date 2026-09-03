# AI Product Coding Skills

面向 AI 产品经理、设计师和工程师的可复用 Codex skills，目标是把 AI 产品想法更快变成可验证的 MVP。

## 在线工作台

[打开 AI PM 工作台](https://yanchao980380-cell.github.io/ai-product-coding-skills/)

当前已完成第一个环节：PRD 制作。支持粘贴并解析 Markdown、六模块编辑、实时预览、自动保存、AI 换脸示例，以及复制和下载 Markdown。

## 当前内容

```text
index.html
skills/
├── ai-product-prd/
│   ├── SKILL.md
│   └── references/prd-template.md
└── ai-feature-coding/
    ├── SKILL.md
    └── references/implementation-checklist.md
```

- `ai-product-prd`：按“背景和场景、目标、需求范围、流程、埋点、标准和指标”输出超精简 PRD。
- `ai-feature-coding`：根据 PRD、原型或 issue 实现 AI 功能，并覆盖状态、失败处理、风控、埋点和验证。

## 使用方式

将需要的 skill 目录安装到 Codex 的 skills 目录后即可使用。常用协作方式是：先用 `ai-product-prd` 明确 MVP，再用 `ai-feature-coding` 完成功能实现和验收。

## 贡献约定

- 每个 skill 必须包含 `SKILL.md`，且 frontmatter 中有清晰、可区分的 `name` 和 `description`。
- 入口说明保持短小；只在确有复用价值时增加 `references/`、`scripts/` 或 `assets/`。
- 规则应改变实际决策，不重复通用编码常识，也不把单个项目的约定写成所有项目的硬性要求。
- 提交前运行对应的 skill 校验，并用真实用户请求做一次冒烟验证。
