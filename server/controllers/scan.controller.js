import * as Scan from "../models/scan.model.js";
import * as Project from "../models/project.model.js";
import { enqueueScan } from "../services/scanWorker.js";

const DAILY_LIMIT = 20;
const DAY = 24 * 60 * 60 * 1000;

const parseId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function get(req, res) {
  const id = parseId(req.params.id);
  const scan = id ? await Scan.findOwned(req.user.id, id) : null;
  if (!scan) return res.status(404).json({ error: "Scan not found" });
  res.json({ scan });
}

export async function listForProject(req, res) {
  const id = parseId(req.params.id);
  const project = id ? await Project.findOwned(req.user.id, id) : null;
  if (!project) return res.status(404).json({ error: "Project not found" });

  const scans = await Scan.listByProject(project.id);
  res.json({ scans });
}

export async function start(req, res) {
  const id = parseId(req.params.id);
  const project = id ? await Project.findOwned(req.user.id, id) : null;
  if (!project) return res.status(404).json({ error: "Project not found" });

  if (req.body?.permissionConfirmed !== true) {
    return res
      .status(400)
      .json({ error: "Confirm that you are allowed to test this website" });
  }

  if (await Project.hasActiveScan(project.id)) {
    return res
      .status(409)
      .json({ error: "A scan is already running for this project" });
  }

  const recent = await Scan.countSince(req.user.id, new Date(Date.now() - DAY));
  if (recent >= DAILY_LIMIT) {
    return res
      .status(429)
      .json({ error: "Daily scan limit reached. Try again tomorrow." });
  }

  const scan = await Scan.create(project.id, project.url);
  enqueueScan(scan.id);
  res.status(202).json({ scan });
}
