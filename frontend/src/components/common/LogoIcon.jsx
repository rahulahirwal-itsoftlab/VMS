import React from "react";

const LogoIcon = ({ size, className }) => (
  <img
    src="/logo.png"
    className={`object-contain shrink-0 rounded-md ${className || ""}`}
    style={{ width: size, height: size }}
    alt="Logo"
  />
);

export default LogoIcon;
