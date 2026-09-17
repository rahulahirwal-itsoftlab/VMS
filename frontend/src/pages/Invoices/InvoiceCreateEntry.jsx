// import { ArrowLeft, FileText, ScanLine } from "lucide-react";
// import { Link } from "react-router-dom";
import { Navigate } from "react-router-dom";

/**
 * OCR Invoice Creation temporarily disabled on frontend.
 * Directs user directly to the Manual Invoice Creation Form.
 */
const InvoiceCreateEntry = () => {
  return <Navigate to="/invoices/create" replace />;

  /* OCR temporarily disabled
  const options = [
    {
      title: "Manual Invoice",
      description: "Create an invoice using an existing Purchase Order and enter invoice-specific details manually.",
      button: "Create Manually",
      to: "/invoices/create",
      icon: FileText,
    },
    {
      title: "OCR Invoice",
      description: "Upload an invoice document and automatically extract invoice information using OCR.",
      button: "Create Using OCR",
      to: "/invoices/create/ocr",
      icon: ScanLine,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/invoices" className="rounded-lg p-2 transition hover:bg-slate-100">
          <ArrowLeft size={20} className="text-slate-600" /> 
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Create Invoice</h1>
          <p className="mt-1 text-sm text-slate-500">Choose how you want to create the invoice.</p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <section key={option.to} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
                  <Icon size={24} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-950">{option.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{option.description}</p>
                </div>
              </div>
              <Link
                to={option.to}
                className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                {option.button}
              </Link>
            </section>
          );
        })}
      </div>
    </div>
  );
  */
};

export default InvoiceCreateEntry;
