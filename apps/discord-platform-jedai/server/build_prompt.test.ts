import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFullPrompt, buildHyperparameterBlock, type AnnouncementInput } from "./build_prompt.js";

const baseInput: AnnouncementInput = {
  tone: "カジュアル",
  length: "medium",
  formality: "ですます",
  emoji_density: "普通",
  structure: "箇条書き中心",
  cta_strength: "普通",
  user_request: "来週土曜21時の練習会告知。参加はリアクション。",
};

describe("buildHyperparameterBlock", () => {
  it("embeds all six hyperparameter values", () => {
    const block = buildHyperparameterBlock(
      "真面目",
      "long",
      "敬語",
      "なし",
      "段落中心",
      "強め",
    );
    assert.match(block, /Tone: 真面目/);
    assert.match(block, /Length: long/);
    assert.match(block, /Formality: 敬語/);
    assert.match(block, /Emoji density: なし/);
    assert.match(block, /Structure: 段落中心/);
    assert.match(block, /Call-to-action strength: 強め/);
    assert.match(block, /\[User request\] 内の文体・長さ・構成・絵文字・CTA の記述より優先する/);
  });
});

describe("buildFullPrompt", () => {
  it("includes hyperparameter block and user request", () => {
    const prompt = buildFullPrompt(baseInput);
    assert.match(prompt, /Tone: カジュアル/);
    assert.match(prompt, /Length: medium/);
    assert.match(prompt, /\[User request \(natural language\)\]\n来週土曜21時の練習会告知。参加はリアクション。/);
    assert.match(prompt, /\[Output instruction\]/);
  });

  it("changes hyperparameter lines when tone changes", () => {
    const casual = buildFullPrompt(baseInput);
    const serious = buildFullPrompt({ ...baseInput, tone: "真面目" });
    assert.match(casual, /Tone: カジュアル/);
    assert.match(serious, /Tone: 真面目/);
    assert.notEqual(casual, serious);
  });

  it("appends optional context facts before user request", () => {
    const prompt = buildFullPrompt(baseInput, "- 日時: 5/24 21:00");
    assert.match(prompt, /\[Context facts\]\n- 日時: 5\/24 21:00/);
  });

  it("places hyperparameter block before few-shot examples", () => {
    const prompt = buildFullPrompt({ ...baseInput, emoji_density: "なし" });
    const hyperIdx = prompt.indexOf("Emoji density: なし");
    const fewShotIdx = prompt.indexOf("[Single-parameter Examples");
    assert.ok(hyperIdx >= 0, "hyperparameter block missing");
    assert.ok(fewShotIdx >= 0, "few-shot section missing");
    assert.ok(hyperIdx < fewShotIdx, "hyperparameter must precede few-shot examples");
  });

  it("differs when emoji_density changes", () => {
    const none = buildFullPrompt({ ...baseInput, emoji_density: "なし" });
    const many = buildFullPrompt({ ...baseInput, emoji_density: "多め" });
    assert.notEqual(none, many);
    assert.match(none, /Emoji density: なし/);
    assert.match(many, /Emoji density: 多め/);
  });

  it("includes strict emoji rules in output instruction", () => {
    const prompt = buildFullPrompt(baseInput);
    assert.match(prompt, /Emoji density: なし → use zero emoji characters/);
    assert.match(prompt, /Do not copy emoji count, tone, or length from few-shot/);
  });
});
