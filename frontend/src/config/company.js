export const COMPANY_CONFIG = {
  name: import.meta.env.VITE_COMPANY_NAME || "ACRE ",
  logo: import.meta.env.VITE_COMPANY_LOGO_URL || "",
  address: import.meta.env.VITE_COMPANY_ADDRESS || "123 Corporate Blvd, Suite 400",
  city: import.meta.env.VITE_COMPANY_CITY || "Mumbai",
  state: import.meta.env.VITE_COMPANY_STATE || "Maharashtra",
  country: import.meta.env.VITE_COMPANY_COUNTRY || "India",
  pinCode: import.meta.env.VITE_COMPANY_PIN_CODE || "400001",
  phone: import.meta.env.VITE_COMPANY_PHONE || "+91-22-12345678",
  email: import.meta.env.VITE_COMPANY_EMAIL || "info@ACREprocurement.com",
  website: import.meta.env.VITE_COMPANY_WEBSITE || "www.ACREprocurement.com",
  gstin: import.meta.env.VITE_COMPANY_GST || "27AAAAA1111A1Z1",
  pan: import.meta.env.VITE_COMPANY_PAN || "AAAAA1111A",
};
