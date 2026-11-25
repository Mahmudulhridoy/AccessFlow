import prisma from '../config/db.js';

// Ownership is enforced through Finding -> Scan -> Project -> userId: a user can only rate explanations of their own scans.
export const findOwnedExplanation = (userId, findingId) =>
  prisma.aiExplanation.findFirst({
    where: { findingId, finding: { scan: { project: { userId } } } },
    select: { id: true, source: true },
  });

export const upsert = (explanationId, userId, { rating, reason, comment }) =>
  prisma.explanationFeedback.upsert({
    where: { explanationId_userId: { explanationId, userId } },
    create: { explanationId, userId, rating, reason, comment },
    update: { rating, reason, comment },
    select: { rating: true, reason: true, comment: true },
  });

// Admin view: no user ids or emails, only what is needed for the quality summary.
export const listForAdmin = () =>
  prisma.explanationFeedback.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5000,
    select: {
      rating: true,
      reason: true,
      comment: true,
      createdAt: true,
      explanation: { select: { source: true, finding: { select: { ruleId: true } } } },
    },
  });
