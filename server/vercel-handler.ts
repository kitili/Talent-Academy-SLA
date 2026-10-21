import { createApp } from "./app";

let appPromise: ReturnType<typeof createApp> | null = null;

export default async function handler(req: any, res: any) {
  try {
    if (!appPromise) {
      appPromise = createApp();
    }
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error("API boot failed:", error);
    appPromise = null;
    if (!res.headersSent) {
      res.status(500).json({ message: "The academy failed to start. Try again in a moment." });
    }
  }
}
