// Imports a trained model's saved evaluation into the database so the Admin ML page can show it.
//   node scripts/import-ml-evaluation.js ../ml-service/artifacts/model_metadata.json
//   node scripts/import-ml-evaluation.js ../ml-service/artifacts/dev/model_metadata.json   (synthetic/dev model: shown without metrics)
// Values are copied from the file exactly as the training pipeline wrote them.
import fs from 'fs';
import prisma from '../config/db.js';
import { metadataToRecord, MetadataError } from '../services/mlEvaluation.js';
import { upsert } from '../models/mlEvaluation.model.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/import-ml-evaluation.js <path to model_metadata.json>');
  process.exit(1);
}

try {
  const record = metadataToRecord(JSON.parse(fs.readFileSync(file, 'utf8')));
  const row = await upsert(record);
  console.log(`Imported evaluation #${row.id}: ${row.modelName} ${row.modelVersion} (dataset ${row.datasetVersion}, ${row.datasetOrigin})`);
} catch (err) {
  console.error(err instanceof MetadataError ? `Invalid metadata: ${err.message}` : `Import failed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
