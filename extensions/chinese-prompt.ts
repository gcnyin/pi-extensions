/**
 * Chinese Prompt Extension
 *
 * Detects when the active model name contains a Chinese AI model identifier
 * (deepseek, qwen, minimax, kimi, mimo, glm) and updates the system prompt to
 * require thinking and responding in Chinese.
 *
 * Usage:
 *   pi -e ./chinese-prompt.ts
 *   Or copy to ~/.pi/agent/extensions/ for automatic loading.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Model name substrings that indicate a Chinese-native model. */
const CHINESE_MODELS = [
	"deepseek",
	"qwen",
	"minimax",
	"kimi",
	"mimo",
	"glm",
] as const;

/** 追加到系统提示词末尾的中文指令 */
const CHINESE_INSTRUCTION = `

## 语言要求

你必须使用中文进行思考和回复。
- 所有思考过程、工具调用结果的分析、以及对用户的回复都使用中文。
- 如果用户使用英文提问，你可以理解英文，但回复时仍然使用中文。
- 只有在用户明确要求使用其他语言时，才切换到用户指定的语言。
`;

/**
 * Check whether the given model identifier indicates a Chinese-native model.
 * Matches against model id, model name, and provider id (case-insensitive).
 */
function isChineseModel(id: string, name: string, providerId: string): boolean {
	const lower = `${id}|${name}|${providerId}`.toLowerCase();
	return CHINESE_MODELS.some((keyword) => lower.includes(keyword));
}

export default function chinesePrompt(pi: ExtensionAPI) {
	pi.on("before_agent_start", async (event, ctx) => {
		const model = ctx.model;
		if (!model) return;

		// model.provider is a KnownProvider | string — a plain string union type.
		const provider = model.provider;

		if (!isChineseModel(model.id, model.name, provider)) return;

		// Avoid appending the instruction multiple times if it's already present.
		if (event.systemPrompt.includes("你必须使用中文进行思考和回复")) return;

		return {
			systemPrompt: event.systemPrompt + CHINESE_INSTRUCTION,
		};
	});
}
