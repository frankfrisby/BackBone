import express from "express";
import fetch from "node-fetch";
import {
  createLinkedInAuthRequest,
  exchangeLinkedInCode,
  getLinkedInConfig,
  buildLinkedInProfile,
  fetchLinkedInMessages,
  buildLinkedInSyncPayload,
  saveLinkedInSync,
  loadLinkedInSync
} from "./services/linkedin.js";

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || "http://localhost:3000/linkedin/callback";

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, status: "healthy" });
});

app.get("/linkedin/auth", (req, res) => {
  const config = getLinkedInConfig();
  if (!config.clientId || !config.clientSecret) {
    res.status(400).json({ error: "Missing LinkedIn client credentials." });
    return;
  }
  const url = createLinkedInAuthRequest(config, REDIRECT_URI);
  res.redirect(url);
});

app.get("/linkedin/callback", async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;
  if (error) {
    res.status(400).json({ error, errorDescription });
    return;
  }
  if (!code || !state) {
    res.status(400).json({ error: "Missing OAuth code/state." });
    return;
  }

  try {
    const config = getLinkedInConfig();
    await exchangeLinkedInCode(config, code, state, REDIRECT_URI);
    res.json({ ok: true, status: "LinkedIn connected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const syncLinkedIn = async () => {
  const config = getLinkedInConfig();
  if (!config.ready) {
    return { ok: false, error: "LinkedIn not configured." };
  }

  const [profile, messages] = await Promise.all([
    buildLinkedInProfile(config),
    fetchLinkedInMessages(config)
  ]);

  const payload = buildLinkedInSyncPayload(profile, messages);
  saveLinkedInSync(payload);
  return { ok: true, payload };
};

app.post("/linkedin/sync", async (req, res) => {
  try {
    const result = await syncLinkedIn();
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/linkedin/profile", (req, res) => {
  const sync = loadLinkedInSync();
  if (!sync) {
    res.status(404).json({ error: "No LinkedIn sync data found." });
    return;
  }
  res.json(sync);
});

app.listen(PORT, () => {
  console.log(`LinkedIn backend listening on ${PORT}`);
});

const scheduleWeeklySync = async () => {
  const { default: cron } = await import("node-cron");
  cron.schedule("0 9 * * 1", () => {
    syncLinkedIn().catch((error) => {
      console.error("LinkedIn weekly sync failed:", error.message);
    });
  });
};

scheduleWeeklySync().catch((error) => {
  console.error("LinkedIn scheduler failed:", error.message);
});
