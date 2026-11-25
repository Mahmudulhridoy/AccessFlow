import prisma from '../config/db.js';

export const list = () => prisma.mlModelEvaluation.findMany({ orderBy: { evaluatedAt: 'desc' }, take: 50 });

export const upsert = (record) =>
  prisma.mlModelEvaluation.upsert({
    where: { modelName_modelVersion_datasetVersion: { modelName: record.modelName, modelVersion: record.modelVersion, datasetVersion: record.datasetVersion } },
    create: record,
    update: record,
  });
