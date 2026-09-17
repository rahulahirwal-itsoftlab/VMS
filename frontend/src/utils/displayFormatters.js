import { ROLE_LABELS } from "../config/permissions";

export const titleCaseWords = (value = "") =>
  String(value)
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const formatRoleLabel = (role = "") => {
  if (!role) return "";
  return ROLE_LABELS[role] || titleCaseWords(String(role).replaceAll("_", " "));
};

export const formatEnumLabel = (value = "") => {
  if (!value) return "";
  const strValue = String(value);
  if (strValue.startsWith("PENDING_")) {
    const rolePart = strValue.replace("PENDING_", "").replaceAll("_", " ");
    return `PENDING BY ${rolePart.toUpperCase()}`;
  }
  return titleCaseWords(strValue.replaceAll("_", " "));
};

const ROLE_VALUE_PATTERN = /^(SUPER_ADMIN|CASE_MANAGER|TEAM_LEAD|MANAGER|FINANCE_HEAD)$/;

export const formatRoleValuesDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map(formatRoleValuesDeep);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        /role/i.test(key) && typeof nestedValue === "string"
          ? formatRoleLabel(nestedValue)
          : formatRoleValuesDeep(nestedValue),
      ])
    );
  }

  if (typeof value === "string" && ROLE_VALUE_PATTERN.test(value)) {
    return formatRoleLabel(value);
  }

  return value;
};
