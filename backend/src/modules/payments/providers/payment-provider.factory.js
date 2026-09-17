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

// Simulated payment gateway processing logic
const mockProcessPayment = async (amount, currency, paymentNumber) => {
  // Simulate processing network delay
  await new Promise((resolve) => setTimeout(resolve, 300));

  // 95% success rate simulation
  const isSuccessful = Math.random() > 0.05;
  const txnId = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  if (isSuccessful) {
    return {
      status: 'SUCCESS',
      transactionId: txnId,
      gatewayReference: `REF-${Math.floor(Math.random() * 1000000)}`,
      response: { code: 'PAYMENT_SUCCESS', message: 'Transaction authorized', raw_response: { amount, currency, paymentNumber } },
      message: 'Transaction processed successfully.'
    };
  } else {
    return {
      status: 'FAILED',
      transactionId: txnId,
      gatewayReference: null,
      response: { code: 'PAYMENT_FAILED', message: 'Insufficient funds or gateway timeout' },
      message: 'Transaction failed.'
    };
  }
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
providerRegistry.register('RAZORPAY', { process: mockProcessPayment });
providerRegistry.register('STRIPE', { process: mockProcessPayment });
providerRegistry.register('PAYPAL', { process: mockProcessPayment });
providerRegistry.register('PHONEPE', { process: mockProcessPayment });
providerRegistry.register('CASHFREE', { process: mockProcessPayment });
providerRegistry.register('PAYU', { process: mockProcessPayment });
providerRegistry.register('BANK_API', { process: mockProcessPayment });
