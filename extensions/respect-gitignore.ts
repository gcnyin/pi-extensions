/**
 * pi-respect-gitignore extension
 *
 * Overrides the built-in `grep` and `find` tools to use native `rg` / `fd`
 * behavior that respects .gitignore. The built-in tools pass `--hidden` which
 * includes `.git`, hidden directories, and ignores .gitignore rules.
 *
 * This extension mirrors the reference implementation from the pi source
 * (packages/coding-agent/src/core/tools/grep.ts and find.ts) but removes
 * the `--hidden` flag so ripgrep and fd follow their native default:
 * skip hidden files, .git directories, and .gitignore'd content.
 *
 * Only grep and find are affected — all other tools (bash, read, write, edit,
 * ls) remain untouched.
 *
 * Usage:
 *   pi -e ./index.ts
 *   # or copy / symlink into ~/.pi/agent/extensions/
 */

import { createInterface } from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import { stat as fsStat, readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createFindToolDefinition,
  createGrepToolDefinition,
} from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Minimal local path helpers (mirrors resolveToCwd / path logic from
// packages/coding-agent/src/core/tools/path-utils.ts without internal imports)
// ---------------------------------------------------------------------------

function resolveToCwd(filePath: string, cwd: string): string {
  if (filePath.startsWith("~")) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
    filePath = path.join(home, filePath.slice(1));
  }
  return path.resolve(cwd, filePath);
}

// ---------------------------------------------------------------------------
// Constants (mirroring truncate.ts)
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
const GREP_MAX_LINE_LENGTH = 500;
const DEFAULT_FIND_LIMIT = 1000;
const DEFAULT_GREP_LIMIT = 100;

// ---------------------------------------------------------------------------
// Truncation helpers (minimal mirror of truncate.ts)
// ---------------------------------------------------------------------------

function truncateHead(
  content: string,
  opts?: { maxBytes?: number },
): { content: string; truncated: boolean } {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;
  const buf = Buffer.from(content, "utf-8");
  if (buf.length <= maxBytes) return { content, truncated: false };
  // Find a safe UTF-8 boundary
  let cut = maxBytes;
  while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut--;
  return { content: buf.slice(0, cut).toString("utf-8"), truncated: true };
}

function truncateLine(
  line: string,
  maxChars = GREP_MAX_LINE_LENGTH,
): { text: string; wasTruncated: boolean } {
  if (line.length <= maxChars) return { text: line, wasTruncated: false };
  return { text: `${line.slice(0, maxChars)}... [truncated]`, wasTruncated: true };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ---------------------------------------------------------------------------
// Ensure tool binary is available (same logic as tools-manager.ts ensureTool)
// ---------------------------------------------------------------------------

function commandExists(cmd: string): boolean {
  try {
    const result = spawnSync(cmd, ["--version"], { stdio: "pipe" });
    return result.error === undefined || result.error === null;
  } catch {
    return false;
  }
}

function getToolPath(tool: "fd" | "rg"): string | null {
  if (tool === "rg") return commandExists("rg") ? "rg" : null;
  // fd is sometimes installed as "fdfind" on Debian/Ubuntu
  if (commandExists("fd")) return "fd";
  if (commandExists("fdfind")) return "fdfind";
  return null;
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  const rgPath = getToolPath("rg");
  const fdPath = getToolPath("fd");

  // =========================================================================
  // Override grep — reference implementation minus --hidden
  // =========================================================================
  if (rgPath) {
    const grepDef = createGrepToolDefinition(process.cwd());

    pi.registerTool({
      name: "grep",
      label: "grep (rg)",
      description:
        grepDef.description +
        " Respects .gitignore (native rg default; --hidden removed).",
      promptSnippet: grepDef.promptSnippet,
      promptGuidelines: grepDef.promptGuidelines,
      parameters: grepDef.parameters,
      async execute(
        _toolCallId: string,
        params: Record<string, unknown>,
        signal: AbortSignal | undefined,
        _onUpdate: unknown,
        _ctx: unknown,
      ) {
        const {
          pattern,
          path: searchDir,
          glob,
          ignoreCase,
          literal,
          context,
          limit,
        } = params as Record<string, unknown> & { pattern: string };

        return new Promise((resolve, reject) => {
          if (signal?.aborted) {
            reject(new Error("Operation aborted"));
            return;
          }
          let settled = false;
          const settle = (fn: () => void) => {
            if (!settled) { settled = true; fn(); }
          };

          (async () => {
            const cwd = process.cwd();
            const resolvedDir = String(searchDir || ".");
            const searchPath = resolveToCwd(resolvedDir, cwd);

            // Determine if we're searching a directory or a single file.
            let isDirectory = false;
            try {
              const st = await fsStat(searchPath);
              isDirectory = st.isDirectory();
            } catch {
              settle(() => reject(new Error(`Path not found: ${searchPath}`)));
              return;
            }

            const contextValue = context && Number(context) > 0 ? Number(context) : 0;
            const effectiveLimit = Math.max(1, Number(limit) || DEFAULT_GREP_LIMIT);

            // Format file path for output — relative when searching a directory,
            // basename when searching a single file.
            const formatPath = (filePath: string): string => {
              if (isDirectory) {
                const relative = path.relative(searchPath, filePath);
                if (relative && !relative.startsWith("..")) {
                  return relative.replace(/\\/g, "/");
                }
              }
              return path.basename(filePath);
            };

            // File content cache for context lines
            const fileCache = new Map<string, string[]>();
            const getFileLines = async (filePath: string): Promise<string[]> => {
              let lines = fileCache.get(filePath);
              if (!lines) {
                try {
                  const content = await fsReadFile(filePath, "utf-8");
                  lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
                } catch {
                  lines = [];
                }
                fileCache.set(filePath, lines);
              }
              return lines;
            };

            // Build rg args — same as reference, but WITHOUT --hidden
            const args: string[] = ["--json", "--line-number", "--color=never"];
            if (ignoreCase) args.push("--ignore-case");
            if (literal) args.push("--fixed-strings");
            if (glob) args.push("--glob", String(glob));
            args.push("--", pattern, searchPath);

            const child = spawn(rgPath, args, {
              stdio: ["ignore", "pipe", "pipe"],
            });
            const rl = createInterface({ input: child.stdout! });
            let stderr = "";
            let matchCount = 0;
            let matchLimitReached = false;
            let linesTruncated = false;
            let aborted = false;
            let killedDueToLimit = false;
            const outputLines: string[] = [];
            const matches: Array<{
              filePath: string;
              lineNumber: number;
              lineText?: string;
            }> = [];

            const cleanup = () => {
              rl.close();
              signal?.removeEventListener("abort", onAbort);
            };
            const stopChild = (dueToLimit = false) => {
              if (!child.killed) {
                killedDueToLimit = dueToLimit;
                child.kill();
              }
            };
            const onAbort = () => {
              aborted = true;
              stopChild();
            };
            signal?.addEventListener("abort", onAbort, { once: true });

            child.stderr?.on("data", (chunk: Buffer) => {
              stderr += chunk.toString();
            });

            const formatBlock = async (
              filePath: string,
              lineNumber: number,
            ): Promise<string[]> => {
              const relativePath = formatPath(filePath);
              const lines = await getFileLines(filePath);
              if (!lines.length)
                return [`${relativePath}:${lineNumber}: (unable to read file)`];
              const block: string[] = [];
              const start =
                contextValue > 0
                  ? Math.max(1, lineNumber - contextValue)
                  : lineNumber;
              const end =
                contextValue > 0
                  ? Math.min(lines.length, lineNumber + contextValue)
                  : lineNumber;
              for (let cur = start; cur <= end; cur++) {
                const lineText = lines[cur - 1] ?? "";
                const sanitized = lineText.replace(/\r/g, "");
                const isMatchLine = cur === lineNumber;
                const { text: truncatedText, wasTruncated } = truncateLine(sanitized);
                if (wasTruncated) linesTruncated = true;
                if (isMatchLine)
                  block.push(`${relativePath}:${cur}: ${truncatedText}`);
                else block.push(`${relativePath}-${cur}- ${truncatedText}`);
              }
              return block;
            };

            // Stream JSON events from rg
            rl.on("line", (line: string) => {
              if (!line.trim() || matchCount >= effectiveLimit) return;
              let event: any;
              try {
                event = JSON.parse(line);
              } catch {
                return;
              }
              if (event.type === "match") {
                matchCount++;
                const fp = event.data?.path?.text;
                const ln = event.data?.line_number;
                const lt = event.data?.lines?.text;
                if (fp && typeof ln === "number")
                  matches.push({ filePath: fp, lineNumber: ln, lineText: lt });
                if (matchCount >= effectiveLimit) {
                  matchLimitReached = true;
                  stopChild(true);
                }
              }
            });

            child.on("error", (error: Error) => {
              cleanup();
              settle(() =>
                reject(new Error(`Failed to run ripgrep: ${error.message}`)),
              );
            });

            child.on("close", async (code: number | null) => {
              cleanup();
              if (aborted) {
                settle(() => reject(new Error("Operation aborted")));
                return;
              }
              // rg exits 1 = no matches, >1 = error
              if (!killedDueToLimit && code !== 0 && code !== 1) {
                const errMsg =
                  stderr.trim() || `ripgrep exited with code ${code}`;
                settle(() => reject(new Error(errMsg)));
                return;
              }
              if (matchCount === 0) {
                settle(() =>
                  resolve({
                    content: [{ type: "text" as const, text: "No matches found" }],
                    details: undefined,
                  }),
                );
                return;
              }

              // Format matches after streaming finishes
              for (const m of matches) {
                if (contextValue === 0 && m.lineText !== undefined) {
                  const relativePath = formatPath(m.filePath);
                  const sanitized = m.lineText
                    .replace(/\r\n/g, "\n")
                    .replace(/\r/g, "")
                    .replace(/\n$/, "");
                  const { text: truncatedText, wasTruncated } =
                    truncateLine(sanitized);
                  if (wasTruncated) linesTruncated = true;
                  outputLines.push(
                    `${relativePath}:${m.lineNumber}: ${truncatedText}`,
                  );
                } else {
                  const block = await formatBlock(m.filePath, m.lineNumber);
                  outputLines.push(...block);
                }
              }

              let rawOutput = outputLines.join("\n");
              const headTrunc = truncateHead(rawOutput);
              let output = headTrunc.content;
              const notices: string[] = [];
              if (matchLimitReached) {
                notices.push(
                  `${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
                );
              }
              if (headTrunc.truncated) {
                notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
              }
              if (linesTruncated) {
                notices.push(
                  `Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`,
                );
              }
              if (notices.length > 0)
                output += `\n\n[${notices.join(". ")}]`;

              settle(() =>
                resolve({
                  content: [{ type: "text" as const, text: output }],
                  details: undefined,
                }),
              );
            });
          })().catch((err: Error) => settle(() => reject(err)));
        });
      },
      renderCall: grepDef.renderCall,
      renderResult: grepDef.renderResult,
    });
  }

  // =========================================================================
  // Override find — reference implementation minus --hidden
  // =========================================================================
  if (fdPath) {
    const findDef = createFindToolDefinition(process.cwd());

    pi.registerTool({
      name: "find",
      label: "find (fd)",
      description:
        findDef.description +
        " Respects .gitignore (native fd default; --hidden removed).",
      promptSnippet: findDef.promptSnippet,
      promptGuidelines: findDef.promptGuidelines,
      parameters: findDef.parameters,
      async execute(
        _toolCallId: string,
        params: Record<string, unknown>,
        signal: AbortSignal | undefined,
        _onUpdate: unknown,
        _ctx: unknown,
      ) {
        const {
          pattern,
          path: searchDir,
          limit,
        } = params as Record<string, unknown> & { pattern: string };

        return new Promise((resolve, reject) => {
          if (signal?.aborted) {
            reject(new Error("Operation aborted"));
            return;
          }

          let settled = false;
          let stopChild: (() => void) | undefined;
          const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", onAbort);
            stopChild = undefined;
            fn();
          };
          const onAbort = () => {
            stopChild?.();
            settle(() => reject(new Error("Operation aborted")));
          };
          signal?.addEventListener("abort", onAbort, { once: true });

          (async () => {
            const cwd = process.cwd();
            const resolvedDir = String(searchDir || ".");
            const searchPath = resolveToCwd(resolvedDir, cwd);
            const effectiveLimit =
              limit && Number(limit) > 0 ? Number(limit) : DEFAULT_FIND_LIMIT;

            // Build fd args — same as reference, but WITHOUT --hidden
            const args: string[] = [
              "--glob",
              "--color=never",
              "--no-require-git",
              "--max-results",
              String(effectiveLimit),
            ];

            let effectivePattern = pattern;
            if (pattern.includes("/")) {
              args.push("--full-path");
              if (
                !pattern.startsWith("/") &&
                !pattern.startsWith("**/") &&
                pattern !== "**"
              ) {
                effectivePattern = `**/${pattern}`;
              }
            }
            args.push("--", effectivePattern, searchPath);

            const child = spawn(fdPath, args, {
              stdio: ["ignore", "pipe", "pipe"],
            });
            const rl = createInterface({ input: child.stdout! });
            let stderr = "";
            const rawLines: string[] = [];

            stopChild = () => {
              if (!child.killed) child.kill();
            };

            child.stderr?.on("data", (chunk: Buffer) => {
              stderr += chunk.toString();
            });

            rl.on("line", (line: string) => {
              rawLines.push(line);
            });

            child.on("error", (error: Error) => {
              rl.close();
              settle(() =>
                reject(new Error(`Failed to run fd: ${error.message}`)),
              );
            });

            child.on("close", (code: number | null) => {
              rl.close();
              if (signal?.aborted) {
                settle(() => reject(new Error("Operation aborted")));
                return;
              }
              const joined = rawLines.join("\n");
              if (code !== 0) {
                const errMsg = stderr.trim() || `fd exited with code ${code}`;
                if (!joined) {
                  settle(() => reject(new Error(errMsg)));
                  return;
                }
              }
              if (!joined) {
                settle(() =>
                  resolve({
                    content: [
                      {
                        type: "text" as const,
                        text: "No files found matching pattern",
                      },
                    ],
                    details: undefined,
                  }),
                );
                return;
              }

              // Relativize paths
              const relativized: string[] = [];
              for (const rawLine of rawLines) {
                const ln = rawLine.replace(/\r$/, "").trim();
                if (!ln) continue;
                const hadTrailingSlash =
                  ln.endsWith("/") || ln.endsWith("\\");
                let relPath = ln;
                if (ln.startsWith(searchPath)) {
                  relPath = ln.slice(searchPath.length + 1);
                } else {
                  relPath = path.relative(searchPath, ln);
                }
                if (hadTrailingSlash && !relPath.endsWith("/"))
                  relPath += "/";
                relativized.push(relPath.split(path.sep).join("/"));
              }

              const resultLimitReached =
                relativized.length >= effectiveLimit;
              let rawOutput = relativized.join("\n");
              const headTrunc = truncateHead(rawOutput);
              let output = headTrunc.content;
              const notices: string[] = [];
              if (resultLimitReached) {
                notices.push(
                  `${effectiveLimit} results limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
                );
              }
              if (headTrunc.truncated) {
                notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
              }
              if (notices.length > 0)
                output += `\n\n[${notices.join(". ")}]`;

              settle(() =>
                resolve({
                  content: [{ type: "text" as const, text: output }],
                  details: undefined,
                }),
              );
            });
          })().catch((err: Error) => settle(() => reject(err)));
        });
      },
      renderCall: findDef.renderCall,
      renderResult: findDef.renderResult,
    });
  }
}
