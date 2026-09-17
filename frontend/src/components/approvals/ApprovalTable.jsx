import { Eye, Check, X, Pause } from "lucide-react";
import StatusBadge from "../common/StatusBadge";

const ApprovalTable = ({
  approvals,
  showActions = true,
}) => {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

      <table className="w-full">

        <thead className="bg-slate-50">

          <tr>

            <th className="px-6 py-4 text-left text-sm font-semibold">
              Invoice
            </th>

            <th className="text-left text-sm font-semibold">
              Vendor
            </th>

            <th className="text-left text-sm font-semibold">
              Amount
            </th>

            <th className="text-left text-sm font-semibold">
              Priority
            </th>

            <th className="text-left text-sm font-semibold">
              Status
            </th>

            <th className="text-left text-sm font-semibold">
              Assigned
            </th>

            <th className="text-center text-sm font-semibold">
              Actions
            </th>

          </tr>

        </thead>

        <tbody>

          {approvals.map((approval) => (

            <tr
              key={approval.id}
              className="border-t hover:bg-slate-50 transition"
            >

              <td className="px-6 py-5 font-semibold">

                {approval.invoiceNo}

              </td>

              <td>

                {approval.vendor}

              </td>

              <td>

                ₹{approval.amount.toLocaleString()}

              </td>

              <td>

                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">

                  {approval.priority}

                </span>

              </td>

              <td>

                <StatusBadge status={approval.status} />

              </td>

              <td>

                {approval.assignedTo}

              </td>

              <td>

                {showActions && (

                  <div className="flex justify-center gap-2">

                    <button className="rounded-lg bg-blue-100 p-2 hover:bg-blue-200">

                      <Eye size={17} />

                    </button>

                    <button className="rounded-lg bg-green-100 p-2 hover:bg-green-200">

                      <Check size={17} />

                    </button>

                    <button className="rounded-lg bg-yellow-100 p-2 hover:bg-yellow-200">

                      <Pause size={17} />

                    </button>

                    <button className="rounded-lg bg-red-100 p-2 hover:bg-red-200">

                      <X size={17} />

                    </button>

                  </div>

                )}

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
};

export default ApprovalTable;