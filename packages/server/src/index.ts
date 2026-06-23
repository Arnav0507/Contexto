import { resolve } from "node:path";
import cors from "cors";
import express from "express";
import { createRouter } from "./routes.js";
import { LearningStore } from "./store.js";

const PORT = Number(process.env.PORT ?? 4000);
const DATA_FILE = process.env.SAC_DATA_FILE
  ? resolve(process.env.SAC_DATA_FILE)
  : resolve(process.cwd(), "data", "learnings.json");

const store = new LearningStore(DATA_FILE);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/api", createRouter(store));

app.listen(PORT, () => {
  // Plain stdout logging is fine here — this is a normal web server, not the
  // MCP stdio server (which must keep stdout clean for the protocol).
  console.log(
    `[sac] shared-context server listening on http://localhost:${PORT}`
  );
  console.log(`[sac] data file: ${DATA_FILE}`);
});
