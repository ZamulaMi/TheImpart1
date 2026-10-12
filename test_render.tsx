
import React from "react";
import { Window } from "happy-dom";

const window = new Window({ url: "http://localhost:3000/admin" });
global.window = window as any;
global.document = window.document as any;
global.navigator = window.navigator as any;
global.localStorage = window.localStorage as any;
global.sessionStorage = window.sessionStorage as any;

import { createRoot } from "react-dom/client";
import App from "./src/App";

const container = document.createElement("div");
document.body.appendChild(container);

const root = createRoot(container);
console.log("Rendering App on /admin...");
try {
  root.render(<App />);
  console.log("First render scheduled successfully!");
} catch (e) {
  console.error("Render failed:", e);
}
