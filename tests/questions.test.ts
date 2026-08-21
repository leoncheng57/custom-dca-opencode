import { describe, expect, it } from "vitest";

import { shapeQuestionAnswers } from "../client/lib/questions.js";
import { parseQuestionRequests, validateQuestionAnswers } from "../server/opencode/questions.js";

const questions = [
  { question: "Pick one", header: "Single", options: [{ label: "A", description: "first" }] },
  { question: "Pick many", header: "Multiple", multiple: true, custom: false, options: [{ label: "B", description: "second" }] },
];

describe("question answers", () => {
  it("uses custom text as the single answer by default and appends it for multi-select", () => {
    expect(shapeQuestionAnswers(
      [questions[0], { ...questions[1], custom: true }],
      [["A"], ["B"]],
      ["custom", "another"],
    )).toEqual({ answers: [["custom"], ["B", "another"]], valid: true });
  });

  it("requires every question to have an answer", () => {
    expect(shapeQuestionAnswers(questions, [["A"], []], ["", "ignored"]).valid).toBe(false);
  });

  it("normalizes valid upstream requests and validates answer semantics", () => {
    const requests = parseQuestionRequests([{ id: "q1", sessionID: "s1", questions }]);
    expect(requests).toHaveLength(1);
    expect(validateQuestionAnswers(requests[0].questions, [["custom"], ["B"]])).toEqual([["custom"], ["B"]]);
    expect(() => validateQuestionAnswers(requests[0].questions, [["A", "custom"], ["B"]])).toThrow("single-select");
    expect(() => validateQuestionAnswers(requests[0].questions, [["A"], ["custom"]])).toThrow("custom answers");
  });
});
