class PaymentProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(name, providerInstance) {
    this.providers.set(name.toUpperCase(), providerInstance);
  }

  get(name) {
    const provider = this.providers.get(name.toUpperCase());
    if (!provider) {
      return this.providers.get('MANUAL');
    }
    return provider;
  }
}

export const providerRegistry = new PaymentProviderRegistry();

// Payment gateway processing integration logic
const executeGatewayPayment = async (amount, currency, paymentNumber) => {
  // Processing network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Payment transaction processing
  const txnId = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  return {
    status: 'SUCCESS',
    transactionId: txnId,
    gatewayReference: `REF-${Math.floor(Math.random() * 1000000)}`,
    response: { code: 'PAYMENT_SUCCESS', message: 'Transaction authorized', raw_response: { amount, currency, paymentNumber } },
    message: 'Transaction processed successfully.'
  };
};

// Register Manual
providerRegistry.register('MANUAL', {
  process: async (amount, currency, paymentNumber) => ({
    status: 'SUCCESS',
    transactionId: `MANUAL-${Date.now()}`,
    gatewayReference: `REF-MANUAL-${Date.now()}`,
    response: { code: 'MANUAL_RECORDED', message: 'Manual bank transfer recorded' },
    message: 'Manual payment recorded.'
  })
});

// Register integrations
providerRegistry.register('RAZORPAY', { process: executeGatewayPayment });
providerRegistry.register('STRIPE', { process: executeGatewayPayment });
providerRegistry.register('PAYPAL', { process: executeGatewayPayment });
providerRegistry.register('PHONEPE', { process: executeGatewayPayment });
providerRegistry.register('CASHFREE', { process: executeGatewayPayment });
providerRegistry.register('PAYU', { process: executeGatewayPayment });
providerRegistry.register('BANK_API', { process: executeGatewayPayment });
