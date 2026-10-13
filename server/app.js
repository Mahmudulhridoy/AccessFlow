import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import env from "./config/env.js";
import authRoutes from "./routes/auth.routes.js";
import passwordResetRoutes from "./routes/passwordReset.routes.js";
import projectRoutes from "./routes/project.routes.js";
import scanRoutes from "./routes/scan.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

// Behind Render/Railway the real client IP comes from the proxy header
if (env.isProd) app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/auth", passwordResetRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api", scanRoutes);
app.use("/api/admin", adminRoutes);

app.use(errorHandler);

export default app;
