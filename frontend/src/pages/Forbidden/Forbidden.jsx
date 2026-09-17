import { ShieldX } from "lucide-react";
import { Link } from "react-router-dom";

const Forbidden = () => {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="text-center">

        <div className="mb-6 flex justify-center">
          <ShieldX
            size={80}
            className="text-red-500"
          />
        </div>

        <h1 className="text-4xl font-bold">
          403
        </h1>

        <p className="mt-3 text-slate-500">
          You don't have permission to access this page.
        </p>

        <Link
          to="/dashboard"
          className="mt-8 inline-block rounded-xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          Back to Dashboard
        </Link>

      </div>
    </div>
  );
};

export default Forbidden;