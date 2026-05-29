import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import { ThemeProvider } from "./ThemeProvider.js";
import "@databricks/appkit-ui/styles.css";
import "./app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
