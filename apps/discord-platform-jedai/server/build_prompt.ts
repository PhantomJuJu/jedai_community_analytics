import { STATIC_PROMPT_CORE } from "./static_prompt_core.js";

export function buildHyperparameterBlock(
  tone: string,
  length: string,
  formality: string,
  emoji_density: string,
  structure: string,
  cta_strength: string,
): string {
  const length_help =
    "short: 〜100字（1〜2文） / medium: 101〜300字（2〜5文） / long: 301字〜（補足・背景あり）";
  const emoji_help = "なし=0個 / 少なめ=1〜2個 / 普通=3〜5個 / 多め=6個以上";
  return `[Hyperparameter Definitions — この生成の指定値]
- Tone: ${tone}
- Length: ${length} (${length_help})
- Formality: ${formality}
- Emoji density: ${emoji_density} (${emoji_help})
- Structure: ${structure}
- Call-to-action strength: ${cta_strength}
`;
}

export type AnnouncementInput = {
  tone: string;
  length: string;
  formality: string;
  emoji_density: string;
  structure: string;
  cta_strength: string;
  user_request: string;
};

export function buildFullPrompt(
  input: AnnouncementInput,
  contextFacts?: string,
): string {
  const hyper_block = buildHyperparameterBlock(
    input.tone,
    input.length,
    input.formality,
    input.emoji_density,
    input.structure,
    input.cta_strength,
  );
  const split = STATIC_PROMPT_CORE.split("[Single-parameter Examples");
  if (split.length < 2) {
    throw new Error("STATIC_PROMPT_CORE missing [Single-parameter Examples marker");
  }
  const head = split[0].trimEnd();
  const single_combined =
    "[Single-parameter Examples" +
    split[1].split("[Output instruction]", 1)[0].trimEnd();
  const output_instruction =
    "[Output instruction]" + STATIC_PROMPT_CORE.split("[Output instruction]")[1].trim();
  const context_block =
    contextFacts && contextFacts.trim().length > 0
      ? `\n\n[Context facts]\n${contextFacts.trim()}`
      : "";
  return (
    head +
    context_block +
    "\n\n" +
    hyper_block +
    "\n\n" +
    single_combined +
    "\n\n[User request (natural language)]\n" +
    input.user_request.trim() +
    "\n\n" +
    output_instruction
  );
}
