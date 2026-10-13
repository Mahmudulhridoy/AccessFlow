import * as Scan from "../models/scan.model.js";
import * as Project from "../models/project.model.js";

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
