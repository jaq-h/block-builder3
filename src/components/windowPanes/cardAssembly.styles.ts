import styled from "styled-components";

export const Container = styled.div`
  max-width: 380px;
  height: 100%;
  margin: auto;
  display: flex;
  flex-direction: column;
`;

export const Header = styled.div`
  padding: 16px;
  text-align: center;
  border-bottom: 1px solid #444;
`;

export const HeaderText = styled.h2`
  margin: 0;
  font-size: 18px;
  color: #fff;
`;

export const ContentWrapper = styled.div`
  display: flex;
  flex: 1;
  overflow: scroll;
`;

export const ColumnsWrapper = styled.div`
  display: flex;
  flex: 1;
  height: 100%;
`;

export const Column = styled.div<{ $tint?: string }>`
  display: flex;
  flex-direction: column;
  min-width: 100px;
  width: 100%;
  background-color: ${({ $tint }) => $tint || "transparent"};
`;

export const ColumnHeader = styled.div<{ $tint?: string }>`
  padding: 8px;
  text-align: center;
  border-bottom: 1px solid #444;
  background-color: ${({ $tint }) => $tint || "rgba(50, 50, 50, 0.2)"};
`;

export const ColumnHeaderText = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: #ccc;
`;

export const ProviderColumn = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 60px;
  width: 80px;
  border-right: 1px solid #444;
  background-color: rgba(50, 50, 50, 0.3);
`;

export const ProviderHeader = styled.div`
  padding: 8px;
  text-align: center;
  border-bottom: 1px solid #444;
`;

export const ProviderHeaderText = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: #ccc;
`;

export interface RowProps {
  $isOver: boolean;
  $isValidTarget: boolean;
  $isDisabled: boolean;
  $align: "left" | "right";
}

const breathingAnimation = `
  @keyframes breathing {
    0%, 100% {
      border-color: rgba(255, 255, 255, 0.5);
      box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.1);
    }
    50% {
      border-color: rgba(255, 255, 255, 1);
      box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.2);
    }
  }
`;

export const Row = styled.div.attrs<RowProps>(() => ({}))<RowProps>`
  ${breathingAnimation}
  flex: 1;
  position: relative;
  border: ${({ $isOver }) => ($isOver ? "3px" : "1px")} solid
    ${({ $isOver, $isValidTarget, $isDisabled }) =>
      $isDisabled
        ? "#222"
        : $isOver
          ? "#fff"
          : $isValidTarget
            ? "#888"
            : "#444"};
  background-color: ${({ $isDisabled }) =>
    $isDisabled ? "rgba(0, 0, 0, 0.4)" : "transparent"};
  background-image: ${({ $isOver, $isValidTarget, $isDisabled }) => {
    if ($isDisabled) return "none";
    if ($isOver) {
      return `
        linear-gradient(to right, rgba(255, 255, 255, 0.4) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 1px, transparent 1px)
      `;
    }
    if ($isValidTarget) {
      return `
        linear-gradient(to right, rgba(255, 255, 255, 0.2) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255, 255, 255, 0.2) 1px, transparent 1px)
      `;
    }
    return "none";
  }};
  background-size: ${({ $isOver, $isValidTarget }) =>
    $isOver || $isValidTarget ? "20px 20px" : "auto"};
  animation: ${({ $isOver, $isValidTarget }) =>
    $isOver || $isValidTarget ? "breathing 1.5s ease-in infinite" : "none"};
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: ${({ $align }) =>
    $align === "left" ? "flex-start" : "flex-end"};
  padding: ${({ $isOver }) => ($isOver ? "6px" : "8px")};
  min-height: 200px;
  overflow: visible;
  transition:
    border-width 0.2s,
    padding 0.2s,
    background-image 0.2s;
`;

export const AxisContainer = styled.div<{ $align: "left" | "right" }>`
  position: relative;
  width: 50%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: ${({ $align }) => ($align === "left" ? "flex-start" : "flex-end")};
  padding: 0 8px;
  border-${({ $align }) => ($align === "left" ? "right" : "left")}: 1px solid rgba(255, 255, 255, 0.1);
`;

export const AxisLabel = styled.div`
  position: absolute;
  top: 2px;
  left: 4px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  z-index: 1;
  pointer-events: none;
`;

export const PercentageScale = styled.div`
  position: absolute;
  right: 2px;
  top: 20px;
  bottom: 8px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 9px;
  color: rgba(255, 255, 255, 0.3);
  pointer-events: none;
`;

export const BlockPositioner = styled.div<{ $yPosition: number }>`
  position: absolute;
  left: 0;
  right: 0;
  top: ${({ $yPosition }) => {
    const topOffset = 20;
    const bottomMargin = 8;
    return `calc(${topOffset}px + (100% - ${topOffset + bottomMargin}px) * ${(100 - $yPosition) / 100})`;
  }};
  display: flex;
  justify-content: center;
  pointer-events: none;
  > * {
    pointer-events: auto;
  }
`;

export const UtilityRow = styled.div`
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  border-top: 1px solid #444;
`;

export const UtilityButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  border: 1px solid #666;
  border-radius: 4px;
  background-color: rgba(80, 80, 80, 0.5);
  color: #ccc;
  font-size: 14px;
  cursor: pointer;
  transition:
    background-color 0.2s,
    border-color 0.2s;
  &:hover {
    background-color: rgba(100, 100, 100, 0.7);
    border-color: #888;
    color: #fff;
  }
`;

export const ProviderRow = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  padding: 8px;
  gap: 0;
  overflow: auto;
`;

// Empty cell placeholder styles
export const EmptyCellPlaceholder = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.2);
  font-size: 12px;
`;

// Centered block container for no-axis blocks
export const CenteredBlockContainer = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
`;

// Limit-only axis container (centered)
export const CenteredAxisContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  position: relative;
`;
