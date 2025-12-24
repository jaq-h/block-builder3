import { useState } from "react";
import StrategyAssembly from "./components/widgets/strategyAssembly/strategyAssembly";
import type { OrderConfig } from "./components/widgets/strategyAssembly/StrategyAssemblyTypes";

function App() {
  // App manages the order config at its level
  const [orderConfig, setOrderConfig] = useState<OrderConfig>({});

  const handleConfigChange = (config: OrderConfig) => {
    console.log("Order config updated:", config);
    setOrderConfig(config);
    // Could send to API, update other widgets, etc.
  };

  const handleExecuteTrade = () => {
    // Use orderConfig to execute trade
    console.log("Executing trade with config:", orderConfig);
  };

  return (
    <div>
      {/* Widget is self-contained, just emits config changes */}
      <StrategyAssembly onConfigChange={handleConfigChange} />

      {/* Example: Other widgets can use orderConfig */}
      {Object.keys(orderConfig).length > 0 && (
        <div style={{ padding: "16px", textAlign: "center" }}>
          <button
            onClick={handleExecuteTrade}
            style={{
              padding: "8px 16px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Execute Trade ({Object.keys(orderConfig).length} orders)
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
