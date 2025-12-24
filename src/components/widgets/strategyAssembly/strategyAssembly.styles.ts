// Strategy Assembly styled components
import styled from "styled-components";

// =============================================================================
// CONTAINER & LAYOUT
// =============================================================================

export const Container = styled.div`
  max-width: 620px;
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
  padding: 6px 0;
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
// PATTERN SELECTOR
// =============================================================================

export const PatternSelectorRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  background-color: rgba(104, 107, 130, 0.08);
  border-bottom: 1px solid var(--border-color-neutral);
`;

export const PatternButton = styled.button<{ $isActive: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 16px;
  border: 2px solid
    ${({ $isActive }) =>
      $isActive
        ? "var(--outline-color-primary)"
        : "var(--border-color-neutral)"};
  border-radius: 8px;
  background-color: ${({ $isActive }) =>
    $isActive ? "rgba(133, 91, 251, 0.2)" : "rgba(104, 107, 130, 0.1)"};
  color: ${({ $isActive }) =>
    $isActive ? "var(--text-color-icon-logo)" : "rgba(255, 255, 255, 0.6)"};
  cursor: pointer;
  transition: all 0.2s;
  min-width: 120px;

  &:hover {
    background-color: ${({ $isActive }) =>
      $isActive ? "rgba(133, 91, 251, 0.3)" : "rgba(104, 107, 130, 0.15)"};
    border-color: ${({ $isActive }) =>
      $isActive
        ? "var(--outline-color-secondary)"
        : "var(--accent-color-purple)"};
  }
`;

export const PatternLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
`;

export const PatternDescription = styled.span`
  font-size: 9px;
  opacity: 0.7;
  margin-top: 2px;
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
  padding: 4px;
  padding-top: 8px;
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
// UTILITY ROW
// =============================================================================

export const UtilityRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  border-top: 1px solid var(--border-color-neutral);
  background-color: rgba(104, 107, 130, 0.05);
`;

export const UtilityButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  border: 1px solid var(--border-color-neutral);
  border-radius: 6px;
  background-color: rgba(104, 107, 130, 0.1);
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  cursor: pointer;
  transition:
    background-color 0.2s,
    border-color 0.2s;

  &:hover {
    background-color: rgba(133, 91, 251, 0.15);
    border-color: var(--accent-color-purple);
    color: var(--text-color-icon-logo);
  }
`;

export const UtilityIcon = styled.img`
  width: 16px;
  height: 16px;
  filter: brightness(0) invert(1);
  opacity: 0.8;
`;

// =============================================================================
// DEBUG PANEL
// =============================================================================

export const DebugPanel = styled.div`
  padding: 8px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  background-color: rgba(104, 107, 130, 0.05);
  border-top: 1px solid var(--border-color-dimmed);
`;

// =============================================================================
// COLUMN TINT HELPERS
// =============================================================================

export const columnTints = {
  entry: {
    cell: "rgba(100, 200, 100, 0.08)",
    header: "rgba(100, 200, 100, 0.15)",
  },
  exit: {
    cell: "rgba(200, 100, 100, 0.08)",
    header: "rgba(200, 100, 100, 0.15)",
  },
} as const;
