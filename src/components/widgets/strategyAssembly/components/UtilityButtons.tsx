import type { FC } from "react";
import { useGridData } from "../contexts/GridDataContext";
import TrashIcon from "../../../../assets/icons/trash.svg?react";
import ReverseIcon from "../../../../assets/icons/reverse.svg?react";
import ClockIcon from "../../../../assets/icons/clock.svg?react";
import {
  utilityRow,
  utilityButton,
  utilityActions,
  utilityPrimaryAction,
} from "../strategyAssembly.styles";
import { executeButtonVariants } from "../../../../App.styles";

interface UtilityButtonsProps {
  orderCount?: number;
  onExecute?: () => void;
  isSubmitting?: boolean;
  isEditMode?: boolean;
}

const UtilityButtons: FC<UtilityButtonsProps> = function UtilityButtons({
  orderCount,
  onExecute,
  isSubmitting = false,
  isEditMode = false,
}) {
  const { clearAll, reverseBlocks } = useGridData();
  const showExecute = orderCount != null && orderCount > 0 && onExecute;

  return (
    <div className={utilityRow}>
      <div className={utilityActions}>
        <button type="button" className={utilityButton} onClick={clearAll}>
          <TrashIcon width={16} height={16} />
          Clear All
        </button>
        <button type="button" className={utilityButton} onClick={reverseBlocks}>
          <ReverseIcon width={16} height={16} />
          Reverse
        </button>
      </div>

      <div className={utilityPrimaryAction}>
        {showExecute && (
          <button
            type="button"
            className={executeButtonVariants({ isSubmitting })}
            onClick={onExecute}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <ClockIcon width={14} height={14} />
                Submitting...
              </>
            ) : isEditMode ? (
              <>Update Order ({orderCount} orders)</>
            ) : (
              <>Execute Trade ({orderCount} orders)</>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default UtilityButtons;
