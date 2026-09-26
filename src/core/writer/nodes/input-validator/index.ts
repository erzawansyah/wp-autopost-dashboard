import { WriterRequest, WriterRequestSchema } from "../../types/contracts";

export interface InputValidatorResult {
  isValid: boolean;
  sanitizedRequest?: WriterRequest;
  error?: {
    code: string;
    message: string;
    details?: string[];
  };
}

/**
 * Node 1: Input Validator & Sanitizer
 * Memvalidasi skema input, membersihkan string dari karakter berbahaya, dan mengisi default value.
 */
export function executeInputValidator(rawInput: unknown): InputValidatorResult {
  const result = WriterRequestSchema.safeParse(rawInput);

  if (!result.success) {
    const errorMessages = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    return {
      isValid: false,
      error: {
        code: "INVALID_INPUT",
        message: `Validasi parameter gagal: ${errorMessages.join("; ")}`,
        details: errorMessages,
      },
    };
  }

  const data = result.data;

  // Sanitasi keyword & instruksi
  const sanitizedKeyword = data.content.keyword
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, "");
  const sanitizedBrief = data.content.brief
    ? data.content.brief.trim()
    : undefined;
  const sanitizedInstructions = data.customInstructions
    ? data.customInstructions.trim()
    : undefined;

  const sanitizedRequest: WriterRequest = {
    ...data,
    content: {
      ...data.content,
      keyword: sanitizedKeyword,
      brief: sanitizedBrief,
      wordCountTarget: data.content.wordCountTarget || 800,
    },
    customInstructions: sanitizedInstructions,
  };

  return {
    isValid: true,
    sanitizedRequest,
  };
}
