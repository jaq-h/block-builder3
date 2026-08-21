import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import ErrorBoundary from "./components/common/ErrorBoundary.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Outermost net. Without it a single throw anywhere in the tree leaves
          the user staring at a blank white page with the reason in a console
          they are not looking at. */}
      <ErrorBoundary
        title="Block Builder hit an unexpected error"
        message="Nothing was sent to the exchange. Try again, or reload the page to start fresh."
      >
        <App />
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
