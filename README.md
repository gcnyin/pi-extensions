# pi-extensions

**pi 扩展集合 / pi Extension Collection**

一组 [pi](https://github.com/earendil-works/pi) 探索性编程智能体的实用扩展。

A collection of useful extensions for the [pi](https://github.com/earendil-works/pi) exploratory programming agent.

---

## 扩展列表 / Extensions

### 1. `extensions/chinese-prompt.ts` — 中文提示词 / Chinese Prompt

自动检测中文 AI 模型，将系统提示词切换为中文。

Automatically detects Chinese-native AI models and switches the system prompt to Chinese.

**检测的模型 / Detected Models:**

`deepseek` · `qwen` · `minimax` · `kimi` · `mimo` · `glm`

**工作方式 / How It Works:**

- 在 `before_agent_start` 钩子中检查模型 ID、名称和提供商 ID（不区分大小写）。
- 匹配成功后，将中文语言要求追加到系统提示词末尾。
- 避免重复追加（已含中文指令时跳过）。

- Checks model id, name, and provider id (case-insensitive) in the `before_agent_start` hook.
- On match, appends a Chinese-language requirement to the end of the system prompt.
- Avoids duplicate injection (skips if Chinese instruction is already present).

**使用 / Usage:**

```bash
pi -e ./extensions/chinese-prompt.ts
```

或复制到 `~/.pi/agent/extensions/` 以自动加载。

Or copy to `~/.pi/agent/extensions/` for automatic loading.

---

### 2. `extensions/respect-gitignore.ts` — 尊重 .gitignore / Respect .gitignore

覆盖内置的 `grep` 和 `find` 工具，使其遵循 `.gitignore` 规则。

Overrides the built-in `grep` and `find` tools to respect `.gitignore` rules.

**背景 / Background:**

pi 内置的 `grep` / `find` 工具在调用 `rg` / `fd` 时传递了 `--hidden` 参数，导致它们搜索 `.git` 目录、隐藏文件，并忽略 `.gitignore` 规则。此扩展移除了 `--hidden`，恢复原生行为。

The built-in `grep` / `find` tools pass `--hidden` to `rg` / `fd`, causing them to search `.git` directories, hidden files, and ignore `.gitignore` rules. This extension removes `--hidden`, restoring native behavior.

**工作方式 / How It Works:**

- 使用 `pi.registerTool()` 覆盖 `grep` 和 `find`。
- 内部实现镜像了 pi 源码（`packages/coding-agent/src/core/tools/grep.ts` 和 `find.ts`），但去掉了 `--hidden` 标志。
- 仅影响 `grep` 和 `find`，其他工具（`bash`、`read`、`write`、`edit`、`ls`）不受影响。

- Overrides `grep` and `find` via `pi.registerTool()`.
- Internal implementation mirrors the pi source (`packages/coding-agent/src/core/tools/grep.ts` and `find.ts`), minus the `--hidden` flag.
- Only affects `grep` and `find`; all other tools (`bash`, `read`, `write`, `edit`, `ls`) remain untouched.

**使用 / Usage:**

```bash
pi -e ./extensions/respect-gitignore.ts
```

或复制到 `~/.pi/agent/extensions/` 以自动加载。

Or copy to `~/.pi/agent/extensions/` for automatic loading.

---

## 安装 / Installation

### 单次使用 / One-off

```bash
pi -e ./extensions/chinese-prompt.ts
pi -e ./extensions/respect-gitignore.ts
```

### 同时加载多个扩展 / Load Multiple Extensions

```bash
pi -e ./extensions/chinese-prompt.ts -e ./extensions/respect-gitignore.ts
```

### 持久安装 / Persistent

将扩展文件复制或链接到 pi 的自动加载目录：

Copy or symlink the extension files into pi's autoload directory:

```bash
mkdir -p ~/.pi/agent/extensions/
cp extensions/chinese-prompt.ts ~/.pi/agent/extensions/
cp extensions/respect-gitignore.ts ~/.pi/agent/extensions/
```

## 依赖 / Dependencies

- `chinese-prompt.ts` — 仅依赖 `@earendil-works/pi-coding-agent` 类型。
- `respect-gitignore.ts` — 需要系统中安装 `rg` (ripgrep) 和 `fd` (fd-find)。依赖 `@earendil-works/pi-coding-agent` 类型。

- `chinese-prompt.ts` — Only depends on `@earendil-works/pi-coding-agent` types.
- `respect-gitignore.ts` — Requires `rg` (ripgrep) and `fd` (fd-find) installed on the system. Depends on `@earendil-works/pi-coding-agent` types.

## 许可 / License

MIT
