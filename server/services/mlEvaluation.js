// Mapping between ml-service/artifacts/**/model_metadata.json (written by the training pipeline) and the
// MlModelEvaluation table, plus the presenter used by the Admin API. Nothing here invents numbers: every
// metric comes from the exported metadata, and synthetic-data models never expose their metrics.

const ORIGINS = { own_collected: 'REAL_ANNOTATED', synthetic_fixture: 'SYNTHETIC_FIXTURE' };
const METRIC_KEYS = ['precision_macro', 'recall_macro', 'f1_macro', 'high_recall'];

export class MetadataError extends Error {}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (v, name) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new MetadataError(`${name} must be a number`);
  return v;
};

export function metadataToRecord(meta) {
  if (!isObj(meta)) throw new MetadataError('metadata is not an object');
  const need = ['model_name', 'model_version', 'training_date_utc', 'dataset', 'test_metrics_selected', 'test_metrics_all_models', 'selection', 'labels'];
  for (const k of need) if (meta[k] === undefined) throw new MetadataError(`missing field: ${k}`);

  const origin = ORIGINS[meta.dataset?.origin];
  if (!origin) throw new MetadataError(`unknown dataset origin: ${meta.dataset?.origin}`);
  const t = meta.test_metrics_selected;
  const evaluatedAt = new Date(meta.training_date_utc);
  if (Number.isNaN(evaluatedAt.getTime())) throw new MetadataError('invalid training_date_utc');
  if (!Array.isArray(meta.labels) || !Array.isArray(t.confusion_matrix) || !isObj(t.per_class)) {
    throw new MetadataError('malformed test metrics');
  }

  const allModels = {};
  for (const [name, m] of Object.entries(meta.test_metrics_all_models)) {
    allModels[name] = Object.fromEntries(METRIC_KEYS.map((k) => [k, num(m[k], `${name}.${k}`)]));
  }

  const { quality_report: qualityReport, ...datasetInfo } = meta.dataset;
  return {
    modelName: String(meta.model_name).slice(0, 80),
    modelVersion: String(meta.model_version).slice(0, 40),
    datasetVersion: String(meta.dataset.version).slice(0, 40),
    datasetOrigin: origin,
    datasetSize: meta.dataset.n_total,
    classCounts: { train: meta.dataset.class_counts_train, test: meta.dataset.class_counts_test },
    labels: meta.labels,
    precisionMacro: num(t.precision_macro, 'precision_macro'),
    recallMacro: num(t.recall_macro, 'recall_macro'),
    f1Macro: num(t.f1_macro, 'f1_macro'),
    perClass: t.per_class,
    confusionMatrix: t.confusion_matrix,
    baselines: { testMetrics: allModels, cv: meta.selection?.cv ?? {}, selected: meta.selection?.selected ?? null, highRecall: num(t.high_recall, 'high_recall') },
    trainingConfig: {
      ...meta.training_config,
      algorithm: meta.algorithm,
      randomForestSelected: Boolean(meta.random_forest_selected),
      evaluationStatus: meta.evaluation_status,
      productionEligible: Boolean(meta.production_eligible),
      eligibilityReason: meta.eligibility_reason ?? null,
      featureVersion: meta.feature_version ?? null,
      ci: meta.test_ci_selected ?? null,
      beatsAxeImpactBaseline: meta.beats_axe_impact_baseline_on_test_macro_f1 ?? null,
      dataset: datasetInfo,
      readinessGates: qualityReport?.readiness_gates ?? null,
      selfConsistency: qualityReport?.self_consistency ?? null,
      environment: meta.environment ?? null,
    },
    evaluatedAt,
  };
}

/** Shape sent to the Admin page. Synthetic-fixture models: metrics are withheld on the server. */
export function presentEvaluation(row) {
  const synthetic = row.datasetOrigin === 'SYNTHETIC_FIXTURE';
  const cfg = row.trainingConfig || {};
  const base = {
    id: row.id,
    modelName: row.modelName,
    modelVersion: row.modelVersion,
    algorithm: cfg.algorithm ?? null,
    featureVersion: cfg.featureVersion ?? null,
    evaluatedAt: row.evaluatedAt,
    dataset: {
      version: row.datasetVersion,
      origin: row.datasetOrigin,
      size: row.datasetSize,
      classCounts: row.classCounts,
      domains: { train: cfg.dataset?.n_domains_train ?? null, test: cfg.dataset?.n_domains_test ?? null },
    },
    labels: row.labels,
    status: synthetic ? 'SYNTHETIC_DEVELOPMENT_ONLY' : cfg.productionEligible ? 'VALIDATED' : 'EXPLORATORY',
    eligibilityReason: cfg.eligibilityReason ?? null,
    readinessGates: cfg.readinessGates ?? null,
    selfConsistency: cfg.selfConsistency ?? null,
  };
  if (synthetic) {
    return { ...base, metricsWithheld: true, metricsWithheldReason: 'Trained on synthetic fixture data: its metrics are not real model performance and are never shown.' };
  }
  return {
    ...base,
    metricsWithheld: false,
    metrics: { precisionMacro: row.precisionMacro, recallMacro: row.recallMacro, f1Macro: row.f1Macro, highRecall: row.baselines?.highRecall ?? null, ci: cfg.ci ?? null },
    perClass: row.perClass,
    confusionMatrix: row.confusionMatrix,
    comparison: { selected: row.baselines?.selected ?? null, testMetrics: row.baselines?.testMetrics ?? {}, cv: row.baselines?.cv ?? {}, beatsAxeImpactBaseline: cfg.beatsAxeImpactBaseline ?? null },
  };
}
