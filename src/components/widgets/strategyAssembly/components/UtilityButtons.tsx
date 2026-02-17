import type { FC } from "react";
import { useGridData } from "../contexts/GridDataContext";
import TrashIcon from "../../../../assets/icons/trash.svg?react";
import ReverseIcon from "../../../../assets/icons/reverse.svg?react";
import { utilityRow, utilityButton } from "../strategyAssembly.styles";

/**
 * UtilityButtons — subscribes only to GridDataContext for action callbacks.
 *
 * GridDataContext only changes when grid/orderConfig/pattern change, so this
 * component is shielded from hover and drag state changes entirely.
 *
 * Previously, these buttons re-rendered on every mouse movement because they
 * were part of the monolithic StrategyAssemblyInner.
 */
const UtilityButtons: FC = function UtilityButtons() {
  const { clearAll, reverseBlocks } = useGridData();

  return (
    <div className={utilityRow}>
      <button className={utilityButton} onClick={clearAll}>
        <TrashIcon width={16} height={16} />
        Clear All
      </button>
      <button className={utilityButton} onClick={reverseBlocks}>
        <ReverseIcon width={16} height={16} />
        Reverse
      </button>
    </div>
  );
};

export default UtilityButtons;
