import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("../services/scanWorker.js", () => ({ enqueueScan: vi.fn() }));
vi.mock("../services/mailer.js", () => ({
  sendResetEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../config/db.js", () => {
  const db = {
    user: [],
    refreshToken: [],
    passwordReset: [],
    project: [],
    scan: [],
  };
  const ids = {
    user: 0,
    refreshToken: 0,
    passwordReset: 0,
    project: 0,
    scan: 0,
  };
  const ok = (row, where = {}) =>
    Object.entries(where).every(([k, v]) => {
      if (k === "project")
        return db.project.some((p) => p.id === row.projectId && ok(p, v));
      if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("notIn" in v) return !v.notIn.includes(row[k]);
        if ("in" in v) return v.in.includes(row[k]);
        if ("gte" in v) return row[k] >= v.gte;
        if ("gt" in v) return row[k] > v.gt;
        if ("not" in v) return row[k] !== v.not;
      }
      return row[k] === v;
    });
  const model = (name, extra = {}) => ({
    findUnique: async ({ where, include }) => {
      const r = db[name].find((x) => ok(x, where)) || null;
      if (r && include?.user)
        return { ...r, user: db.user.find((u) => u.id === r.userId) };
      return r;
    },
    findFirst: async ({ where }) => db[name].find((x) => ok(x, where)) || null,
    findMany: async ({ where = {} } = {}) =>
      db[name].filter((x) => ok(x, where)).reverse(),
    count: async ({ where = {} } = {}) =>
      db[name].filter((x) => ok(x, where)).length,
    create: async ({ data }) => {
      const row = {
        id: ++ids[name],
        createdAt: new Date(),
        revokedAt: null,
        usedAt: null,
        status: "QUEUED",
        role: "USER",
        errorCode: null,
        ...data,
      };
      db[name].push(row);
      return row;
    },
    update: async ({ where, data }) =>
      Object.assign(
        db[name].find((x) => ok(x, where)),
        data,
      ),
    updateMany: async ({ where, data }) => {
      const rows = db[name].filter((x) => ok(x, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
    delete: async ({ where }) => {
      db[name] = db[name].filter((x) => !ok(x, where));
      return {};
    },
    ...extra,
  });
  const prisma = {
    user: model("user"),
    refreshToken: model("refreshToken"),
    passwordReset: model("passwordReset"),
    $transaction: async (ops) => Promise.all(ops),
    project: model("project"),
    scan: model("scan", {
      groupBy: async ({ by }) => {
        const counts = {};
        db.scan.forEach((s) => {
          if (s[by[0]] != null) counts[s[by[0]]] = (counts[s[by[0]]] || 0) + 1;
        });
        return Object.entries(counts).map(([k, n]) => ({
          [by[0]]: k,
          _count: { _all: n },
        }));
      },
    }),
  };
  Object.defineProperty(prisma, "db", { get: () => db });
  return { default: prisma };
});

import app from "../app.js";
import prisma from "../config/db.js";
import { sendResetEmail } from "../services/mailer.js";

const creds = (e) => ({ email: e, password: "password123" });
const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe("module 1 api (in-memory db)", () => {
  it("runs the whole flow", async () => {
    const A = request.agent(app);
    let r = await A.post("/api/auth/register").send(creds("a@test.com"));
    expect(r.status).toBe(201);
    expect(r.headers["set-cookie"][0]).toMatch(/HttpOnly/);
    const tokenA = r.body.accessToken;

    expect(
      (await request(app).post("/api/auth/register").send(creds("a@test.com")))
        .status,
    ).toBe(409);
    expect(
      (
        await request(app)
          .post("/api/auth/register")
          .send({ email: "x@test.com", password: "short" })
      ).status,
    ).toBe(400);

    const wrongPw = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@test.com", password: "nopenope1" });
    const noUser = await request(app)
      .post("/api/auth/login")
      .send(creds("nobody@test.com"));
    expect(wrongPw.status).toBe(401);
    expect(wrongPw.body.error).toBe(noUser.body.error);

    expect((await request(app).get("/api/auth/me")).status).toBe(401);
    expect(
      (await request(app).get("/api/auth/me").set(auth(tokenA))).body.user
        .email,
    ).toBe("a@test.com");

    const oldCookie = r.headers["set-cookie"][0].split(";")[0];
    r = await A.post("/api/auth/refresh");
    expect(r.status).toBe(200);
    expect(
      (await request(app).post("/api/auth/refresh").set("Cookie", oldCookie))
        .status,
    ).toBe(401);
    expect((await A.post("/api/auth/logout")).status).toBe(204);
    expect((await A.post("/api/auth/refresh")).status).toBe(401);

    const B = (
      await request(app).post("/api/auth/register").send(creds("b@test.com"))
    ).body.accessToken;

    let p = await request(app)
      .post("/api/projects")
      .set(auth(tokenA))
      .send({ name: "Site", url: "https://Example.com#top" });
    expect(p.status).toBe(201);
    expect(p.body.project.url).toBe("https://example.com/");
    for (const url of [
      "example.com",
      "ftp://example.com",
      "https://u:p@example.com",
    ]) {
      expect(
        (
          await request(app)
            .post("/api/projects")
            .set(auth(tokenA))
            .send({ name: "x", url })
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await request(app)
          .post("/api/projects")
          .set(auth(tokenA))
          .send({ name: "", url: "https://a.com" })
      ).status,
    ).toBe(400);

    const pid = p.body.project.id;
    expect(
      (await request(app).get("/api/projects").set(auth(B))).body.projects,
    ).toHaveLength(0);
    for (const m of ["get", "delete"]) {
      expect(
        (await request(app)[m](`/api/projects/${pid}`).set(auth(B))).status,
      ).toBe(404);
    }
    expect(
      (
        await request(app)
          .put(`/api/projects/${pid}`)
          .set(auth(B))
          .send({ name: "h", url: "https://h.com" })
      ).status,
    ).toBe(404);
    expect(
      (await request(app).get("/api/projects/abc").set(auth(tokenA))).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .put(`/api/projects/${pid}`)
          .set(auth(tokenA))
          .send({ name: "Renamed", url: "https://example.org" })
      ).body.project.name,
    ).toBe("Renamed");

    expect(
      (
        await request(app)
          .post(`/api/projects/${pid}/scans`)
          .set(auth(tokenA))
          .send({})
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/projects/${pid}/scans`)
          .set(auth(B))
          .send({ permissionConfirmed: true })
      ).status,
    ).toBe(404);
    const s = await request(app)
      .post(`/api/projects/${pid}/scans`)
      .set(auth(tokenA))
      .send({ permissionConfirmed: true });
    expect(s.status).toBe(202);
    expect(
      (
        await request(app)
          .post(`/api/projects/${pid}/scans`)
          .set(auth(tokenA))
          .send({ permissionConfirmed: true })
      ).status,
    ).toBe(409);
    expect(
      (await request(app).delete(`/api/projects/${pid}`).set(auth(tokenA)))
        .status,
    ).toBe(409);

    const sid = s.body.scan.id;
    expect(
      (await request(app).get(`/api/scans/${sid}`).set(auth(tokenA))).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/scans/${sid}`).set(auth(B))).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/projects/${pid}/scans`).set(auth(B)))
        .status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/projects/${pid}/scans`).set(auth(tokenA)))
        .body.scans,
    ).toHaveLength(1);

    expect(
      (await request(app).get("/api/admin/scans").set(auth(tokenA))).status,
    ).toBe(403);
    expect((await request(app).get("/api/admin/scans")).status).toBe(401);

    prisma.db.scan[0].status = "FAILED";
    prisma.db.scan[0].errorCode = "DNS_FAILED";
    prisma.db.user.find((u) => u.email === "b@test.com").role = "ADMIN";
    const adminToken = (
      await request(app).post("/api/auth/login").send(creds("b@test.com"))
    ).body.accessToken;
    const sum = await request(app)
      .get("/api/admin/scans/summary")
      .set(auth(adminToken));
    expect(sum.status).toBe(200);
    expect(sum.body.byErrorCode).toEqual([
      { errorCode: "DNS_FAILED", count: 1 },
    ]);
    expect(
      (
        await request(app)
          .get("/api/admin/scans?status=FAILED")
          .set(auth(adminToken))
      ).body.total,
    ).toBe(1);
    expect(
      (
        await request(app)
          .get("/api/admin/scans?status=BANANA")
          .set(auth(adminToken))
      ).status,
    ).toBe(400);
    expect(
      (await request(app).get("/api/admin/scans?page=0").set(auth(adminToken)))
        .status,
    ).toBe(400);

    expect(
      (await request(app).delete(`/api/projects/${pid}`).set(auth(tokenA)))
        .status,
    ).toBe(204);
  });

  it("resets a forgotten password", async () => {
    const C = request.agent(app);
    await C.post("/api/auth/register").send(creds("c@test.com"));
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send(creds("c@test.com"));
    const oldCookie = oldLogin.headers["set-cookie"][0].split(";")[0];

    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "ghost@test.com" });
    const known = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "c@test.com" });
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(sendResetEmail).toHaveBeenCalledTimes(1);

    const [to, link] = sendResetEmail.mock.calls[0];
    expect(to).toBe("c@test.com");
    const token = new URL(link).searchParams.get("token");

    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "c@test.com" });
    expect(sendResetEmail).toHaveBeenCalledTimes(1);

    const newPassword = "brand-new-pass1";
    expect(
      (
        await request(app)
          .post("/api/auth/reset-password")
          .send({ token: "x".repeat(64), password: newPassword })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/auth/reset-password")
          .send({ token, password: "short" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/auth/reset-password")
          .send({ password: newPassword })
      ).status,
    ).toBe(400);

    expect(
      (
        await request(app)
          .post("/api/auth/reset-password")
          .send({ token, password: newPassword })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .post("/api/auth/reset-password")
          .send({ token, password: newPassword })
      ).status,
    ).toBe(400);

    expect(
      (await request(app).post("/api/auth/login").send(creds("c@test.com")))
        .status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email: "c@test.com", password: newPassword })
      ).status,
    ).toBe(200);
    expect(
      (await request(app).post("/api/auth/refresh").set("Cookie", oldCookie))
        .status,
    ).toBe(401);

    prisma.db.passwordReset.forEach((r) => {
      r.createdAt = new Date(Date.now() - 5 * 60 * 1000);
    });
    await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "c@test.com" });
    expect(sendResetEmail).toHaveBeenCalledTimes(2);
    const latest = new URL(sendResetEmail.mock.calls[1][1]).searchParams.get(
      "token",
    );
    prisma.db.passwordReset.at(-1).expiresAt = new Date(Date.now() - 1000);
    expect(
      (
        await request(app)
          .post("/api/auth/reset-password")
          .send({ token: latest, password: "another-pass1" })
      ).status,
    ).toBe(400);
  });
});
