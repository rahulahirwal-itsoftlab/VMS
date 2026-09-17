import Sidebar from "../components/layout/Sidebar";
import Navbar from "../components/layout/Navbar";
import { Outlet } from "react-router-dom";

const DashboardLayout = () => {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#F4F7FA] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 transition-colors">
      <Sidebar />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar />

        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-5 md:p-6 lg:p-7 custom-scrollbar">
          <div className="mx-auto max-w-[1400px] space-y-4 sm:space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
