import type { ActiveOrdersConfig, OrderStatus } from "../types/activeOrders";

// =============================================================================
// STATE
// =============================================================================

export interface OrdersStoreState {
  submittedOrders: ActiveOrdersConfig;
  isSubmitting: boolean;
  lastSubmissionTime: Date | null;
  error: string | null;
  /** Whether simulation mode is active (orders stored locally, not sent to API) */
  isSimulationMode: boolean;
}

// =============================================================================
// ACTIONS
// =============================================================================

export type OrdersAction =
  | { type: "SUBMIT_START" }
  | {
      type: "SUBMIT_SUCCESS";
      orders: ActiveOrdersConfig;
      timestamp: Date;
    }
  | { type: "SUBMIT_FAILURE"; error: string }
  | { type: "ORDERS_ACTIVATED"; orderIds: string[] }
  | { type: "CANCEL_ORDER"; orderId: string }
  | { type: "CANCEL_ALL" }
  | {
      type: "UPDATE_ORDER_STATUS";
      orderId: string;
      status: OrderStatus;
      filledAt?: Date;
    }
  | { type: "CLEAR_ERROR" }
  | { type: "SET_SIMULATION_MODE"; enabled: boolean }
  | { type: "TOGGLE_SIMULATION_MODE" };

// =============================================================================
// INITIAL STATE FACTORY
// =============================================================================

export const createInitialState = (isSimulationMode: boolean): OrdersStoreState => ({
  submittedOrders: {},
  isSubmitting: false,
  lastSubmissionTime: null,
  error: null,
  isSimulationMode,
});

// =============================================================================
// REDUCER
// =============================================================================

export function ordersReducer(
  state: OrdersStoreState,
  action: OrdersAction,
): OrdersStoreState {
  switch (action.type) {
    case "SUBMIT_START":
      return {
        ...state,
        isSubmitting: true,
        error: null,
      };

    case "SUBMIT_SUCCESS":
      return {
        ...state,
        isSubmitting: false,
        submittedOrders: { ...state.submittedOrders, ...action.orders },
        lastSubmissionTime: action.timestamp,
      };

    case "SUBMIT_FAILURE":
      return {
        ...state,
        isSubmitting: false,
        error: action.error,
      };

    case "ORDERS_ACTIVATED": {
      const updated = { ...state.submittedOrders };
      for (const id of action.orderIds) {
        if (updated[id]) {
          updated[id] = { ...updated[id], status: "active" };
        }
      }
      return { ...state, submittedOrders: updated };
    }

    case "CANCEL_ORDER": {
      const order = state.submittedOrders[action.orderId];
      if (!order) return state;
      return {
        ...state,
        submittedOrders: {
          ...state.submittedOrders,
          [action.orderId]: { ...order, status: "cancelled" },
        },
      };
    }

    case "CANCEL_ALL": {
      const updated = { ...state.submittedOrders };
      for (const id of Object.keys(updated)) {
        if (updated[id].status === "active" || updated[id].status === "pending") {
          updated[id] = { ...updated[id], status: "cancelled" };
        }
      }
      return { ...state, submittedOrders: updated };
    }

    case "UPDATE_ORDER_STATUS": {
      const order = state.submittedOrders[action.orderId];
      if (!order) return state;
      return {
        ...state,
        submittedOrders: {
          ...state.submittedOrders,
          [action.orderId]: {
            ...order,
            status: action.status,
            ...(action.filledAt ? { filledAt: action.filledAt } : {}),
          },
        },
      };
    }

    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "SET_SIMULATION_MODE":
      return { ...state, isSimulationMode: action.enabled };

    case "TOGGLE_SIMULATION_MODE":
      return { ...state, isSimulationMode: !state.isSimulationMode };

    default:
      return state;
  }
}
