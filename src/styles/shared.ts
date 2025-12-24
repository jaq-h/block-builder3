// Shared styled components for Strategy Assembly widget
import styled, { css } from 'styled-components';
import { colors, spacing, borders, animations, transitions } from './theme';

// =============================================================================
// LAYOUT COMPONENTS
// =============================================================================

export const FlexColumn = styled.div`
  display: flex;
  flex-direction: column;
`;

export const FlexRow = styled.div`
  display: flex;
  flex-direction: row;
`;

export const FlexCenter = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const FlexSpaceBetween = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

// =============================================================================
// HEADER COMPONENTS
// =============================================================================

export const BaseHeader = styled.div`
  padding: ${spacing.md};
  text-align: center;
  border-bottom: ${borders.width.default} solid ${colors.border.neutral};
  background-color: ${colors.bg.header};
`;

export const HeaderText = styled.span<{ $size?: 'sm' | 'md' | 'lg' }>`
  font-weight: 600;
  color: ${colors.text.secondary};
  font-size: ${({ $size }) =>
    $size === 'sm' ? '12px' :
    $size === 'lg' ? '18px' :
    '14px'
  };
`;

// =============================================================================
// BADGE COMPONENTS
// =============================================================================

export type BadgeType = 'primary' | 'conditional' | 'accent';

const badgeStyles = {
  primary: css`
    background-color: ${colors.entry.badge};
    color: ${colors.entry.text};
    border-color: ${colors.entry.badgeBorder};
  `,
  conditional: css`
    background-color: ${colors.conditional.badge};
    color: ${colors.conditional.text};
    border-color: ${colors.conditional.badgeBorder};
  `,
  accent: css`
    background-color: ${colors.accent.bgSubtle};
    color: ${colors.accent.secondary};
    border-color: ${colors.accent.primary};
  `,
};

export const Badge = styled.div<{ $type?: BadgeType }>`
  padding: ${spacing.xxs} ${spacing.sm};
  border-radius: ${borders.radius.sm};
  font-size: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border: ${borders.width.default} solid;
  ${({ $type = 'accent' }) => badgeStyles[$type]}
`;

// =============================================================================
// BUTTON COMPONENTS
// =============================================================================

export const BaseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${spacing.md};
  padding: ${spacing.md} ${spacing.xl};
  border: ${borders.width.default} solid ${colors.border.dimmed};
  border-radius: ${borders.radius.md};
  background-color: ${colors.bg.header};
  color: ${colors.text.secondary};
  font-size: 14px;
  cursor: pointer;
  transition: ${transitions.default};

  &:hover {
    background-color: ${colors.accent.bgSubtle};
    border-color: ${colors.accent.primary};
    color: ${colors.text.primary};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const IconButton = styled(BaseButton)`
  padding: ${spacing.md};
  min-width: auto;
`;

// =============================================================================
// PLACEHOLDER COMPONENTS
// =============================================================================

export const EmptyPlaceholder = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${colors.text.placeholder};
  font-size: 12px;
`;

// =============================================================================
// ALERT/WARNING COMPONENTS
// =============================================================================

export const WarningAlert = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${spacing.lg};
  margin: ${spacing.md};
  border: ${borders.width.medium} dashed ${colors.accent.primary};
  border-radius: ${borders.radius.lg};
  background-color: ${colors.accent.bgSubtle};
  text-align: center;
`;

export const WarningIcon = styled.div`
  font-size: 24px;
  margin-bottom: ${spacing.md};
`;

export const WarningText = styled.div`
  font-size: 11px;
  color: ${colors.accent.primary};
  font-weight: 500;
`;

export const WarningSubtext = styled.div`
  font-size: 9px;
  color: ${colors.accent.bgHover};
  margin-top: ${spacing.xs};
`;

// =============================================================================
// ANIMATION MIXINS
// =============================================================================

export const breathingMixin = css`
  ${animations.cellBreathing}
`;

export const blockBreathingMixin = css`
  ${animations.blockBreathing}
`;

// =============================================================================
// COMMON PATTERNS
// =============================================================================

export const AbsolutePositioned = styled.div<{
  $top?: string;
  $right?: string;
  $bottom?: string;
  $left?: string;
}>`
  position: absolute;
  ${({ $top }) => $top && `top: ${$top};`}
  ${({ $right }) => $right && `right: ${$right};`}
  ${({ $bottom }) => $bottom && `bottom: ${$bottom};`}
  ${({ $left }) => $left && `left: ${$left};`}
`;

export const ScrollContainer = styled.div`
  overflow: auto;
  flex: 1;
`;

// =============================================================================
// LABEL COMPONENTS
// =============================================================================

export const Label = styled.span<{ $size?: 'xs' | 'sm' | 'md' }>`
  color: ${colors.text.muted};
  font-size: ${({ $size }) =>
    $size === 'xs' ? '8px' :
    $size === 'sm' ? '9px' :
    '10px'
  };
  pointer-events: none;
`;

export const OrderTypeLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: ${colors.text.secondary};
  text-transform: capitalize;
`;

// =============================================================================
// DIVIDER COMPONENTS
// =============================================================================

export const HorizontalDivider = styled.div<{ $color?: string }>`
  width: 100%;
  height: ${borders.width.default};
  background-color: ${({ $color }) => $color || colors.border.neutral};
`;

export const VerticalDivider = styled.div<{ $color?: string }>`
  width: ${borders.width.default};
  height: 100%;
  background-color: ${({ $color }) => $color || colors.border.neutral};
`;

// =============================================================================
// CARD/PANEL COMPONENTS
// =============================================================================

export const Panel = styled.div`
  background-color: ${colors.bg.column};
  border: ${borders.width.default} solid ${colors.border.dimmed};
  border-radius: ${borders.radius.lg};
  overflow: hidden;
`;

export const PanelHeader = styled(BaseHeader)`
  background-color: ${colors.bg.headerHover};
`;

export const PanelContent = styled.div`
  padding: ${spacing.md};
`;

// =============================================================================
// DEBUG COMPONENTS
// =============================================================================

export const DebugPanel = styled.div`
  padding: ${spacing.md};
  font-size: 10px;
  color: ${colors.text.muted};
  background-color: ${colors.bg.overlay};
  border-top: ${borders.width.default} solid ${colors.border.dimmed};
`;
