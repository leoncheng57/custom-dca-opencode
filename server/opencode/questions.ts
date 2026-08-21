export interface QuestionInfo {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionRequest {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: unknown;
}

export function parseQuestionRequests(value: unknown): QuestionRequest[] {
  if (!Array.isArray(value)) throw new Error("invalid question response from OpenCode");
  const requests = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    if (typeof source.id !== "string" || typeof source.sessionID !== "string" || !Array.isArray(source.questions)) return [];
    const questions = source.questions.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const question = item as Record<string, unknown>;
      if (typeof question.question !== "string" || typeof question.header !== "string" || !Array.isArray(question.options)) return [];
      const options = question.options.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const option = item as Record<string, unknown>;
        return typeof option.label === "string" && typeof option.description === "string"
          ? [{ label: option.label, description: option.description }]
          : [];
      });
      if (options.length !== question.options.length) return [];
      return [{
        question: question.question,
        header: question.header,
        options,
        ...(typeof question.multiple === "boolean" ? { multiple: question.multiple } : {}),
        ...(typeof question.custom === "boolean" ? { custom: question.custom } : {}),
      }];
    });
    if (questions.length !== source.questions.length) return [];
    return [{ id: source.id, sessionID: source.sessionID, questions, ...(source.tool === undefined ? {} : { tool: source.tool }) }];
  });
  if (requests.length !== value.length) throw new Error("invalid question response from OpenCode");
  return requests;
}

export function validateQuestionAnswers(questions: QuestionInfo[], value: unknown): string[][] {
  if (!Array.isArray(value) || value.length !== questions.length) {
    throw new Error(`answers must contain exactly ${questions.length} entries`);
  }
  return value.map((answer, index) => {
    if (!Array.isArray(answer) || answer.length === 0 || answer.some((item) => typeof item !== "string" || !item.trim())) {
      throw new Error("each question requires at least one non-empty answer");
    }
    const normalized = answer.map((item) => (item as string).trim());
    if (new Set(normalized).size !== normalized.length) throw new Error("question answers must not contain duplicates");
    const question = questions[index];
    if (!question.multiple && normalized.length !== 1) throw new Error("single-select questions require exactly one answer");
    const labels = new Set(question.options.map((option) => option.label));
    if (question.custom === false && normalized.some((item) => !labels.has(item))) {
      throw new Error("custom answers are not allowed for this question");
    }
    return normalized;
  });
}
