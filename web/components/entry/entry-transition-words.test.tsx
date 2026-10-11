import { afterEach, describe, expect, it, vi } from "vitest";
import { splitEntryWords } from "./entry-transition-words";
afterEach(() => vi.unstubAllGlobals());
describe("entry title segmentation", () => {
  it("preserves English spacing, punctuation and Chinese content", () => {
    expect(splitEntryWords("New Research", "en")).toEqual([
      "New",
      " ",
      "Research",
    ]);
    const words = splitEntryWords("新建研究", "zh-CN");
    expect(words.length).toBeGreaterThan(1);
    expect(words.join("")).toBe("新建研究");
    expect(splitEntryWords("A precise question.", "en").join("")).toBe(
      "A precise question.",
    );
  });
  it("keeps Chinese titles intact when segmentation is unavailable", () => {
    vi.stubGlobal("Intl", { ...Intl, Segmenter: undefined });
    expect(splitEntryWords("研究历史", "zh-CN")).toEqual(["研究历史"]);
  });
});
