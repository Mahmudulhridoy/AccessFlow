import prisma from '../config/db.js';

export const saveMany = (rows) =>
  prisma.aiExplanation.createMany({
    data: rows.map((r) => ({
      findingId: r.findingId,
      source: r.source,
      explanation: r.explanation,
      userImpact: r.userImpact ?? null,
      suggestedFix: r.suggestedFix ?? null,
      exampleCode: r.exampleCode ?? null,
      provider: r.provider ?? null,
      model: r.model ?? null,
    })),
  });
