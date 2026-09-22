import { createRoot } from "react-dom/client";
import posthog from "posthog-js";
import App from "./App";
import "./index.css";

// Initialize PostHog analytics
const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    persistence: 'localStorage',
    bootstrap: {
      distinctID: 'anonymous'
    },
    loaded: (ph) => {
      console.log("PostHog loaded successfully");
      ph.capture("posthog_init_success");
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
