import prisma from '../config/db.js';

// One transaction per scan: either all findings (with nodes and WCAG rows) are saved, or none.
export const saveForScan = (scanId, findings) =>
  prisma.$transaction(
    findings.map(({ nodes, wcag, ...f }) =>
      prisma.finding.create({
        data: { ...f, scanId, nodes: { create: nodes }, wcag: { create: wcag } },
      }),
    ),
  );

// Ownership is enforced through Scan -> Project -> userId; never query findings by id alone.
export const listForOwnedScan = (userId, scanId) =>
  prisma.finding.findMany({
    where: { scanId, scan: { project: { userId } } },
    include: {
      nodes: { orderBy: { ordinal: 'asc' } },
      wcag: true,
      prediction: true,
      explanation: { include: { feedback: { where: { userId }, select: { rating: true, reason: true, comment: true } } } },
    },
    orderBy: { id: 'asc' },
  });

// Just rule ids, element counts and priority of one scan; used to compare a scan with the previous one and to score it.
export const ruleCountsForScan = (scanId) =>
  prisma.finding.findMany({
    where: { scanId },
    select: { ruleId: true, nodeCount: true, prediction: { select: { priority: true } } },
  });

// A short row per finding of one OWNED scan, for the side-by-side scan comparison.
export const listSummaryForOwnedScan = (userId, scanId) =>
  prisma.finding.findMany({
    where: { scanId, scan: { project: { userId } } },
    select: {
      ruleId: true,
      help: true,
      axeImpact: true,
      nodeCount: true,
      prediction: { select: { priority: true } },
    },
    orderBy: { id: 'asc' },
  });
