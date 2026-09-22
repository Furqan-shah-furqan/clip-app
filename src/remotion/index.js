import React from "react";
import ReactDOM from "react-dom/client";
import { RemotionRoot } from "./Root";

const container = document.getElementById("root");
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(<RemotionRoot />);
}

export default RemotionRoot;
