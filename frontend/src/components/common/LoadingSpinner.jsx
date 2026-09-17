const LoadingSpinner = ({ size = "md", text = "Loading..." }) => {
  const sizeClass = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  }[size];

  return (
    <div className="flex items-center justify-center gap-3">
      <div className={`${sizeClass} animate-spin rounded-full border-4 border-slate-200 border-t-blue-600`} />
      {text && <span className="text-sm text-slate-600">{text}</span>}
    </div>
  );
};

export default LoadingSpinner;
