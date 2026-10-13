import * as Project from "../models/project.model.js";

const MAX_PROJECTS = 10;

const parseId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Someone else's project and a missing project both look the same: 404.
async function getOwned(req, res) {
  const id = parseId(req.params.id);
  const project = id ? await Project.findOwned(req.user.id, id) : null;
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  return project;
}

export async function list(req, res) {
  const projects = await Project.listByUser(req.user.id);
  res.json({ projects });
}

export async function create(req, res) {
  if ((await Project.countByUser(req.user.id)) >= MAX_PROJECTS) {
    return res
      .status(409)
      .json({ error: `You can have up to ${MAX_PROJECTS} projects` });
  }
  const { name, url } = req.body;
  const project = await Project.create(req.user.id, name, url);
  res.status(201).json({ project });
}

export async function get(req, res) {
  const project = await getOwned(req, res);
  if (project) res.json({ project });
}

export async function update(req, res) {
  const project = await getOwned(req, res);
  if (!project) return;
  const { name, url } = req.body;
  const updated = await Project.update(project.id, name, url);
  res.json({ project: updated });
}

export async function remove(req, res) {
  const project = await getOwned(req, res);
  if (!project) return;

  if (await Project.hasActiveScan(project.id)) {
    return res.status(409).json({
      error:
        "A scan is still running for this project. Wait for it to finish before deleting.",
    });
  }

  await Project.remove(project.id);
  res.status(204).end();
}
