import { ChevronRight } from "lucide-react";

const Breadcrumb = ({ items }) => {
  return (
    <nav className="flex items-center gap-2 text-sm">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          {idx > 0 && <ChevronRight size={16} className="text-slate-400" />}
          {item.href ? (
            <a href={item.href} className="text-blue-600 hover:text-blue-700 transition">
              {item.label}
            </a>
          ) : (
            <span className="text-slate-600">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
};

export default Breadcrumb;
