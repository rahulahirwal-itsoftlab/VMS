export const VENDOR_TABLE = 'vendors';

export const VENDOR_COLUMNS = {
  ID: 'id',
  NAME: 'name',
  VENDOR_CODE: 'vendor_code',
  EMAIL: 'email',
  PHONE: 'phone',
  ADDRESS: 'address',
  CITY: 'city',
  STATE: 'state',
  ZIP_CODE: 'zip_code',
  TAX_ID: 'tax_id',
  CATEGORY: 'category',
  CONTACT_PERSON: 'contact_person',
  BANK_ACCOUNT_NO: 'bank_account_no',
  IFSC_CODE: 'ifsc_code',
  PAYMENT_TERMS: 'payment_terms',
  IS_ACTIVE: 'is_active',
  DELETED_AT: 'deleted_at',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
};

export const VendorEntity = {
  table: VENDOR_TABLE,
  columns: VENDOR_COLUMNS,
  fields: {
    id: 'UUID',
    name: 'String',
    vendor_code: 'String (Unique)',
    email: 'String (Unique)',
    phone: 'String',
    address: 'String',
    city: 'String',
    state: 'String',
    zip_code: 'String',
    tax_id: 'String (Unique)',
    category: 'String',
    contact_person: 'String',
    bank_account_no: 'String',
    ifsc_code: 'String',
    payment_terms: 'String', 
    is_active: 'Boolean',
    deleted_at: 'DateTime (Nullable)',
    created_at: 'DateTime',
    updated_at: 'DateTime',
  }
};

export default VendorEntity;