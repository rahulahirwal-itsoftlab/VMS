const STORAGE_KEY = "vendors";

export const getVendors = () => {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveVendor = (vendor) => {
  const vendors = getVendors();

  vendors.push({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...vendor,
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(vendors));
};

export const deleteVendor = (id) => {
  const vendors = getVendors().filter((v) => v.id !== id);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(vendors));
};

export const getVendorById = (id) => {
  return getVendors().find((v) => v.id === id);
};

export const updateVendor = (id, updatedVendor) => {
  const vendors = getVendors().map((vendor) =>
    vendor.id === id ? { ...vendor, ...updatedVendor } : vendor
  );

  localStorage.setItem(STORAGE_KEY, JSON.stringify(vendors));
};