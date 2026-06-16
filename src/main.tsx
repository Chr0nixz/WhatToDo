import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { registerI18nExtensions } from "./i18nExtensions";

registerI18nExtensions();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
