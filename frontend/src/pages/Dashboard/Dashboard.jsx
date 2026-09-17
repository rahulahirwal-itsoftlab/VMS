import { useAuth } from "../../context/AuthContext";
import { ROLES } from "../../config/permissions";

import AdminDashboard from "../../components/dashboard/roleDashboards/AdminDashboard";
import CaseManagerDashboard from "../../components/dashboard/roleDashboards/CaseManagerDashboard";
import FinanceDashboard from "../../components/dashboard/roleDashboards/FinanceDashboard";
import L1Dashboard from "../../components/dashboard/roleDashboards/L1Dashboard";
import ManagerDashboard from "../../components/dashboard/roleDashboards/ManagerDashboard";

const Dashboard = () => {
  const { user } = useAuth();

  if (!user) return null;

  switch (user.role) {
    case ROLES.SUPER_ADMIN:
      return <AdminDashboard />;

    case ROLES.FINANCE_HEAD:
      return <FinanceDashboard />;

    case ROLES.CASE_MANAGER:
      return <CaseManagerDashboard />;

    case ROLES.TEAM_LEAD:
      return <L1Dashboard />;

    case ROLES.MANAGER:
      return <ManagerDashboard />;

    default:
      return <AdminDashboard />;
  }
};

export default Dashboard;
