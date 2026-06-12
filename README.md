# pi-extensions

**pi 扩展集合 / pi Extension Collection**

一组 [pi](https://github.com/earendil-works/pi) 探索性编程智能体的实用扩展。

A collection of useful extensions for the [pi](https://github.com/earendil-works/pi) exploratory programming agent.

---

## 扩展列表 / Extensions

> **注意 / Note:** 中文提示词无需额外扩展，在 `~/.pi/agent/AGENTS.md` 中添加一条提示词（如 `使用中文回复`）即可做到。

### 1. `extensions/respect-gitignore.ts` — 尊重 .gitignore / Respect .gitignore

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
pi -e ./extensions/respect-gitignore.ts
```

### 同时加载多个扩展 / Load Multiple Extensions

```bash
pi -e ./extensions/respect-gitignore.ts
```

### 持久安装 / Persistent

将扩展文件复制或链接到 pi 的自动加载目录：

Copy or symlink the extension files into pi's autoload directory:

```bash
mkdir -p ~/.pi/agent/extensions/
cp extensions/respect-gitignore.ts ~/.pi/agent/extensions/
```

## 依赖 / Dependencies

- `respect-gitignore.ts` — 需要系统中安装 `rg` (ripgrep) 和 `fd` (fd-find)。依赖 `@earendil-works/pi-coding-agent` 类型。

- `respect-gitignore.ts` — Requires `rg` (ripgrep) and `fd` (fd-find) installed on the system. Depends on `@earendil-works/pi-coding-agent` types.

## 许可 / License

MIT
