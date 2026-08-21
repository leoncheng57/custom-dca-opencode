import type { QuestionRequest } from "./api.js";

type Question = QuestionRequest["questions"][number];

export function shapeQuestionAnswers(
  questions: Question[],
  selected: string[][],
  custom: string[],
): { answers: string[][]; valid: boolean } {
  const answers = questions.map((question, index) => {
    const choices = selected[index] ?? [];
    const customAnswer = question.custom !== false ? (custom[index] ?? "").trim() : "";
    if (!customAnswer) return choices;
    return question.multiple ? [...choices, customAnswer] : [customAnswer];
  });
  return { answers, valid: answers.every((answer) => answer.length > 0) };
}
