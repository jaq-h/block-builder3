import { Link, useLocation } from "react-router-dom";
import { useLiveOrdersCount } from "../../store";
import { navLinkVariants, navBar, navIcon, orderBadge } from "../../App.styles";
import ToolsIcon from "../../assets/icons/tools.svg?react";
import OrdersIcon from "../../assets/icons/orders.svg?react";

// =============================================================================
// NAV BAR
// =============================================================================

function NavBar() {
  const location = useLocation();
  const liveOrderCount = useLiveOrdersCount();

  return (
    <nav className={navBar}>
      <Link
        to="/"
        className={navLinkVariants({ isActive: location.pathname === "/" })}
      >
        <span className={navIcon}>
          <ToolsIcon width={16} height={16} />
        </span>
        Strategy Builder
      </Link>
      <Link
        to="/active"
        className={navLinkVariants({
          isActive: location.pathname === "/active",
        })}
      >
        <span className={navIcon}>
          <OrdersIcon width={16} height={16} />
        </span>
        Active Orders
        {liveOrderCount > 0 && (
          <span className={orderBadge}>{liveOrderCount}</span>
        )}
      </Link>
    </nav>
  );
}

export default NavBar;
