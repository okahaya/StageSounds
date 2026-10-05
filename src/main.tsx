import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalGuards } from "./safety/globalGuards";
import "./index.css";

// 画面描画より先に安全装置(緊急停止キー・誤操作ガード等)を起動する。
installGlobalGuards();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
