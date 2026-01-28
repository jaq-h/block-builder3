// Active Orders widget styled components
import styled from "styled-components";

// =============================================================================
// CONTAINER & LAYOUT
// =============================================================================

export const Container = styled.div`
  max-width: 520px;
  height: 100%;
  margin: auto;
  display: flex;
  flex-direction: column;
  background-color: var(--ds-bg-color);
`;

export const ContentWrapper = styled.div`
  display: flex;
  flex: 1;
  overflow: scroll;
  gap: 6px;
  padding: 6px;
`;

export const ColumnsWrapper = styled.div`
  display: flex;
  flex: 1;
  height: 100%;
  gap: 6px;
`;

// =============================================================================
// HEADER
// =============================================================================

export const Header = styled.div`
  padding: 16px;
  text-align: center;
  border-bottom: 1px solid var(--border-color-neutral);
  background-color: rgba(104, 107, 130, 0.05);
`;

export const HeaderText = styled.h2`
  margin: 0;
  font-size: 18px;
  color: var(--text-color-icon-logo);
`;

// =============================================================================
// STATUS BAR
// =============================================================================

export const StatusBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background-color: rgba(104, 107, 130, 0.08);
  border-bottom: 1px solid var(--border-color-neutral);
`;

export const StatusInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

export const StatusItem = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
`;

export const StatusLabel = styled.span`
  color: rgba(255, 255, 255, 0.5);
`;

export const StatusValue = styled.span<{ $color?: string }>`
  color: ${({ $color }) => $color || "rgba(255, 255, 255, 0.9)"};
  font-weight: 500;
`;

export const StatusDot = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: ${({ $color }) => $color};
  display: inline-block;
`;

// =============================================================================
// COLUMNS
// =============================================================================

export const Column = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 220px;
  width: 100%;
  background-color: rgb(22, 18, 31);
  border: 1px solid rgba(229, 231, 235, 0.2);
  border-radius: 8px;
  overflow: hidden;
  padding: 0;
`;

export const ColumnHeader = styled.div<{ $tint?: string }>`
  padding: 8px;
  text-align: center;
  border-bottom: 1px solid #e5e7eb;
  background-color: ${({ $tint }) => $tint || "rgba(104, 107, 130, 0.08)"};
`;

export const ColumnHeaderText = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
`;

// =============================================================================
// REFRESH BUTTON
// =============================================================================

export const RefreshButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border-color-neutral);
  border-radius: 6px;
  background-color: rgba(104, 107, 130, 0.1);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;

  svg {
    stroke: currentColor;
  }

  &:hover {
    background-color: rgba(133, 91, 251, 0.15);
    border-color: var(--accent-color-purple);
    color: var(--text-color-icon-logo);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

// =============================================================================
// EMPTY STATE
// =============================================================================

export const EmptyStateContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
`;

export const EmptyStateIcon = styled.div`
  margin-bottom: 16px;
  opacity: 0.5;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    stroke: currentColor;
  }
`;

export const EmptyStateTitle = styled.h3`
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
`;

export const EmptyStateDescription = styled.p`
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  max-width: 280px;
`;

// =============================================================================
// ORDER COUNT BADGE
// =============================================================================

export const OrderCountBadge = styled.span<{ $variant?: "entry" | "exit" }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background-color: ${({ $variant }) =>
    $variant === "entry"
      ? "rgba(100, 200, 100, 0.2)"
      : $variant === "exit"
        ? "rgba(200, 100, 100, 0.2)"
        : "rgba(133, 91, 251, 0.2)"};
  color: ${({ $variant }) =>
    $variant === "entry"
      ? "rgba(100, 200, 100, 1)"
      : $variant === "exit"
        ? "rgba(200, 100, 100, 1)"
        : "var(--accent-color-purple)"};
`;

// =============================================================================
// NAVIGATION LINK
// =============================================================================

export const NavLink = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--accent-color-purple);
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.8;
    text-decoration: underline;
  }

  svg {
    width: 12px;
    height: 12px;
  }
`;

// =============================================================================
// FOOTER
// =============================================================================

export const Footer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color-neutral);
  background-color: rgba(104, 107, 130, 0.05);
`;

// =============================================================================
// LAST UPDATED TEXT
// =============================================================================

export const LastUpdated = styled.span`
  font-size: 10px;
  color: rgba(255, 255, 255, 0.4);
`;

// =============================================================================
// DEV CONTROLS (Development Mode Only)
// =============================================================================

export const DevControlsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px;
  background-color: rgba(255, 193, 7, 0.08);
  border-top: 1px dashed rgba(255, 193, 7, 0.3);
`;

export const DevControlsHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  color: #ffc107;
  text-transform: uppercase;
  letter-spacing: 0.5px;

  svg {
    stroke: currentColor;
  }
`;

export const DevControlsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

export const DevButton = styled.button<{
  $variant?: "fill" | "cancel" | "reset";
}>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid
    ${({ $variant }) => {
      switch ($variant) {
        case "fill":
          return "rgba(33, 150, 243, 0.5)";
        case "cancel":
          return "rgba(244, 67, 54, 0.5)";
        case "reset":
          return "rgba(158, 158, 158, 0.5)";
        default:
          return "rgba(255, 193, 7, 0.5)";
      }
    }};
  background-color: ${({ $variant }) => {
    switch ($variant) {
      case "fill":
        return "rgba(33, 150, 243, 0.15)";
      case "cancel":
        return "rgba(244, 67, 54, 0.15)";
      case "reset":
        return "rgba(158, 158, 158, 0.15)";
      default:
        return "rgba(255, 193, 7, 0.15)";
    }
  }};
  color: ${({ $variant }) => {
    switch ($variant) {
      case "fill":
        return "#2196F3";
      case "cancel":
        return "#f44336";
      case "reset":
        return "#9E9E9E";
      default:
        return "#ffc107";
    }
  }};

  svg {
    stroke: currentColor;
  }

  &:hover {
    background-color: ${({ $variant }) => {
      switch ($variant) {
        case "fill":
          return "rgba(33, 150, 243, 0.25)";
        case "cancel":
          return "rgba(244, 67, 54, 0.25)";
        case "reset":
          return "rgba(158, 158, 158, 0.25)";
        default:
          return "rgba(255, 193, 7, 0.25)";
      }
    }};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const DevLabel = styled.span`
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
`;

export const OrderIdSelect = styled.select`
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  background-color: rgba(104, 107, 130, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  min-width: 120px;

  &:focus {
    outline: none;
    border-color: var(--accent-color-purple);
  }

  option {
    background-color: rgb(22, 18, 31);
    color: rgba(255, 255, 255, 0.9);
  }
`;
