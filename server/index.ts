import { createServer } from "http";
import { createApp } from "./app";
import { setupVite, log } from "./vite";

(async () => {
  const app = await createApp();
  const server = createServer(app);

  if (app.get("env") === "development") {
    await setupVite(app, server);
  }

  if (process.env.VERCEL) {
    return;
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
