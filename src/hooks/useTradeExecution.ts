import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { OrderConfig } from "../types/grid";
import { useOrdersStore } from "../store";
import { useTradingMode } from "./useTradingMode";

// =============================================================================
// TYPES
// =============================================================================

export interface UseTradeExecutionReturn {
  /** Current order configuration from the strategy assembly */
  orderConfig: OrderConfig;
  /** Number of orders in the current config */
  orderCount: number;
  /** Whether a success message should be displayed */
  showSuccess: boolean;
  /**
   * Attach this to the feedback strip that carries the success message.
   *
   * The dismissal consults it: a time limit may not take away content the user
   * is currently interacting with, so while the strip holds the focused
   * element the message stays up and goes once focus leaves it.
   */
  feedbackRef: RefObject<HTMLDivElement | null>;
  /** Key that increments on successful submit - used to force-reset StrategyAssembly */
  strategyKey: number;
  /** Initial config to seed StrategyAssembly with (e.g. loaded from active orders) */
  initialConfig: OrderConfig | undefined;
  /** Whether we're currently editing a previously submitted order config */
  isEditMode: boolean;
  /** Whether orders are currently being submitted */
  isSubmitting: boolean;
  /** Current error message, if any */
  error: string | null;
  /** Whether simulation mode is active */
  isSimulationMode: boolean;
  /** Whether the user is allowed to toggle between simulation and API mode */
  canToggle: boolean;
  /** Toggle simulation mode on/off */
  toggleSimulationMode: () => void;
  /** Called by StrategyAssembly when the config changes */
  handleConfigChange: (config: OrderConfig) => void;
  /** Submit the current order config */
  handleExecuteTrade: () => Promise<void>;
  /** Load an existing config into the StrategyAssembly */
  loadConfig: (config: OrderConfig) => void;
  /** Human-readable simulation/environment message */
  simulationMessage: string;
  /** Whether we're effectively in simulation (always, unless the server is live and the toggle is off) */
  isEffectivelySimulation: boolean;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * How long the post-submission success message stays on screen.
 *
 * A reasonable default rather than a compliance figure: 3s - what this was
 * while the message was never rendered at all - is not enough time to read a
 * confirmation, let alone Tab to the "View Active Orders" control it carries.
 * Nothing about 20s makes a time limit permissible on its own; WCAG 2.2.1's
 * own 20 seconds is the minimum *warning* window in the Extend exception, not
 * an allowance for a 20s limit. What keeps this limit from removing content
 * the user is interacting with is the focus guard in the dismissal effect
 * below, which is the rule the number cannot buy.
 */
const SUCCESS_MESSAGE_TIMEOUT_MS = 20_000;

export function useTradeExecution(): UseTradeExecutionReturn {
  const [orderConfig, setOrderConfig] = useState<OrderConfig>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [strategyKey, setStrategyKey] = useState(0);
  const [initialConfig, setInitialConfig] = useState<OrderConfig | undefined>(undefined);
  const [isEditMode, setIsEditMode] = useState(false);

  const feedbackRef = useRef<HTMLDivElement | null>(null);

  /**
   * The one owner of the success message's dismissal.
   *
   * It is an effect keyed on the message itself, so there is never more than
   * one pending dismissal and every transition out of a message cancels it -
   * a new submission, a strategy loaded for edit, a config change, unmount.
   * Three hand-written cancel sites and a ref used to carry that, and the one
   * that was missing (`loadConfig`) was invisible because no route back to a
   * second message happened to pass through it.
   *
   * Every route from one success message to the next passes back through "no
   * message" - the only writer of a non-empty config is `handleConfigChange`,
   * and a submit on an empty one returns early - so a second submission is a
   * second run of this effect and gets a fresh full-length limit rather than
   * what is left of the first one's.
   *
   * The limit does not fire while the strip holds focus. Removing content the
   * user is on is the failure the tab switch's focus handoff exists to avoid,
   * and it is reachable here too: the message carries a focusable control, and
   * unmounting it mid-Tab drops focus to `<body>`. Moving focus instead would
   * be a change of context the user never asked for, so the message simply
   * stays up and goes when focus leaves the strip.
   *
   * "Focus left the strip" is narrower than the `focusout` that reports it,
   * and the event cannot answer it on its own. A window blur - another
   * application, another browser tab, the URL bar - fires `focusout` with no
   * `relatedTarget` while the strip still holds `document.activeElement`,
   * which is indistinguishable from a Tab out by shape alone; reading it as
   * one handed the control back at an arbitrary moment instead of at the
   * limit. So the event is only the prompt to look: the answer is
   * `document.activeElement`, read a tick later because during `focusout` it
   * has not moved yet. That covers a move *within* the strip for the same
   * reason, and needs no second rule for it.
   */
  useEffect(() => {
    if (!showSuccess) return;

    let strip: HTMLElement | null = null;
    let recheck: ReturnType<typeof setTimeout> | undefined;

    const handleFocusOut = () => {
      clearTimeout(recheck);
      recheck = setTimeout(() => {
        const current = strip;
        if (!current || current.contains(document.activeElement)) return;
        current.removeEventListener("focusout", handleFocusOut);
        strip = null;
        setShowSuccess(false);
      }, 0);
    };

    const timer = setTimeout(() => {
      const current = feedbackRef.current;
      if (current && current.contains(document.activeElement)) {
        strip = current;
        strip.addEventListener("focusout", handleFocusOut);
        return;
      }
      setShowSuccess(false);
    }, SUCCESS_MESSAGE_TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
      clearTimeout(recheck);
      strip?.removeEventListener("focusout", handleFocusOut);
    };
  }, [showSuccess]);

  const {
    submitOrders,
    isSubmitting,
    error,
    clearError,
    isSimulationMode,
    toggleSimulationMode,
  } = useOrdersStore();

  // Whether real orders are possible is the server's answer, not the browser's.
  // A build has no credential in it, so `import.meta.env.DEV` no longer tells us
  // anything about what this deployment can do.
  const { liveAvailable: isLiveAvailable } = useTradingMode();

  // ─── Derived state ──────────────────────────────────────────────────
  //
  // server simulation/misconfigured → always simulation, no toggle
  // server live                     → toggle allowed, default simulation
  //
  const canToggle = isLiveAvailable;

  // Without a signing server there is nothing the toggle could switch to.
  const isEffectivelySimulation = !isLiveAvailable || isSimulationMode;

  const orderCount = Object.keys(orderConfig).length;

  // Determine what message to show based on environment and simulation mode
  const simulationMessage = !isLiveAvailable
    ? "Simulation Mode - Orders saved locally"
    : isSimulationMode
      ? "Simulation Mode - Orders saved locally (live trading available)"
      : "Live API Mode - Orders sent to Kraken";

  const handleConfigChange = (config: OrderConfig) => {
    setOrderConfig(config);
    // Clear any previous success message when config changes
    setShowSuccess(false);
    clearError();
  };

  const loadConfig = (config: OrderConfig) => {
    setInitialConfig(config);
    setIsEditMode(true);
    setOrderConfig({});
    setShowSuccess(false);
    clearError();
    setStrategyKey((prev) => prev + 1);
  };

  const handleExecuteTrade = async () => {
    if (Object.keys(orderConfig).length === 0) return;

    const success = await submitOrders(orderConfig);

    if (success) {
      setShowSuccess(true);
      setIsEditMode(false);
      setInitialConfig(undefined);
      setOrderConfig({});
      setStrategyKey((prev) => prev + 1);
    }
  };

  return {
    orderConfig,
    orderCount,
    showSuccess,
    feedbackRef,
    strategyKey,
    initialConfig,
    isEditMode,
    isSubmitting,
    error,
    isSimulationMode,
    canToggle,
    toggleSimulationMode,
    handleConfigChange,
    handleExecuteTrade,
    loadConfig,
    simulationMessage,
    isEffectivelySimulation,
  };
}
