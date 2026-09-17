import { createContext, useContext, useState } from "react";

const AppDataContext = createContext();

export const AppDataProvider = ({ children }) => {
  const [vendors, setVendors] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);

  const value = {
    vendors,
    setVendors,

    purchaseOrders,
    setPurchaseOrders,

    invoices,
    setInvoices,

    payments,
    setPayments,
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};

export const useAppData = () => useContext(AppDataContext);