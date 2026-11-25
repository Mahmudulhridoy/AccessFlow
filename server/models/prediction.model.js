import prisma from '../config/db.js';

export const saveMany = (rows) =>
  prisma.mlPrediction.createMany({
    data: rows.map((r) => ({
      findingId: r.findingId,
      priority: r.priority,
      source: r.source,
      modelName: r.modelName ?? null,
      modelVersion: r.modelVersion ?? null,
      probabilities: r.probabilities ?? undefined,
      features: r.features ?? undefined,
      failureReason: r.failureReason ?? null,
    })),
  });
