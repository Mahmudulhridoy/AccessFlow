import * as Scan from "../models/scan.model.js";
import { ACTIVE_STATUSES, FINISHED_STATUSES } from "../config/scanStatus.js";
import { ERROR_CODES } from "../config/scanErrors.js";

const PAGE_SIZE = 20;
const ALL_STATUSES = [...ACTIVE_STATUSES, ...FINISHED_STATUSES];

export async function listScans(req, res) {
  const { status, errorCode } = req.query;
  const page = Number(req.query.page ?? 1);

  if (status && !ALL_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Unknown status filter" });
  }
  if (errorCode && !ERROR_CODES.includes(errorCode)) {
    return res.status(400).json({ error: "Unknown error code filter" });
  }
  if (!Number.isInteger(page) || page < 1) {
    return res.status(400).json({ error: "Invalid page number" });
  }

  const { total, scans } = await Scan.adminList({
    status,
    errorCode,
    page,
    pageSize: PAGE_SIZE,
  });
  res.json({ scans, total, page, pageSize: PAGE_SIZE });
}

export async function summary(req, res) {
  const [byStatus, byErrorCode] = await Promise.all([
    Scan.countByStatus(),
    Scan.countByErrorCode(),
  ]);

  res.json({
    total: byStatus.reduce((sum, row) => sum + row._count._all, 0),
    byStatus: byStatus.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
    byErrorCode: byErrorCode.map((row) => ({
      errorCode: row.errorCode,
      count: row._count._all,
    })),
  });
}
