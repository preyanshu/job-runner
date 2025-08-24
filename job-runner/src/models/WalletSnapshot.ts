import mongoose from 'mongoose';

const tokenPriceSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  address: { type: String, required: true },
  price: { type: Number, required: true },
  change24h: { type: Number, required: true }
}, { _id: false });

const portfolioValueSchema = new mongoose.Schema({
  totalValue: { type: Number, required: true, default: 0 },
  nativeValue: { type: Number, required: true, default: 0 },
  tokenValue: { type: Number, required: true, default: 0 },
  priceData: [tokenPriceSchema]
}, { _id: false });

const alertSchema = new mongoose.Schema({
  type: { 
    type: String, 
    required: true,
    enum: [
      'LARGE_TRANSACTION',
      'HIGH_GAS_USAGE', 
      'MULTIPLE_CONTRACT_INTERACTIONS',
      'PORTFOLIO_VALUE_CHANGE',
      'SUSPICIOUS_ACTIVITY',
      'NEW_TOKEN_INTERACTION',
      'UNUSUAL_PATTERN'
    ]
  },
  message: { type: String, required: true },
  severity: { 
    type: String, 
    required: true, 
    enum: ['LOW', 'MEDIUM', 'HIGH'] 
  },
  timestamp: { type: Date, required: true, default: Date.now },
  data: { type: mongoose.Schema.Types.Mixed }
}, { _id: false });

const analysisMetadataSchema = new mongoose.Schema({
  apiEndpointsUsed: [{ type: String }],
  dataQuality: { 
    type: String, 
    enum: ['COMPLETE', 'LIMITED', 'PARTIAL', 'UNAVAILABLE'],
    default: 'COMPLETE'
  },
  lastUpdated: { type: Date, required: true, default: Date.now },
  pricesLastUpdated: { type: Date, required: true, default: Date.now },
  transactionEndpointUsed: { type: String },
  errorLogs: [{ 
    endpoint: String,
    error: String,
    timestamp: { type: Date, default: Date.now }
  }]
}, { _id: false });

const enhancedTransactionMetricsSchema = new mongoose.Schema({
  // Original metrics
  totalIncoming: { type: String, default: '0' },
  totalOutgoing: { type: String, default: '0' },
  totalGasUsed: { type: String, default: '0' },
  totalFeesPaid: { type: String, default: '0' },
  contractInteractions: { type: Number, default: 0 },
  nativeTransfers: { type: Number, default: 0 },
  executionTransactions: { type: Number, default: 0 },
  uniqueContracts: [{ type: String }],
  
  // Enhanced metrics
  transactionCategories: {
    type: Object,
    default: {}
  },
  avgGasPrice: { type: String, default: '0' },
  avgTransactionValue: { type: String, default: '0' },
  failedTransactions: { type: Number, default: 0 },
  lastActivityTime: { type: Date },
  
  // Advanced analytics
  dailyTransactionCount: { type: Number, default: 0 },
  weeklyTransactionCount: { type: Number, default: 0 },
  monthlyTransactionCount: { type: Number, default: 0 },
  
  // DeFi specific metrics
  defiInteractions: { type: Number, default: 0 },
  nftTransactions: { type: Number, default: 0 },
  tokenApprovals: { type: Number, default: 0 },
  swapTransactions: { type: Number, default: 0 },
  
  // Security metrics
  suspiciousTransactions: { type: Number, default: 0 },
  highValueTransactions: { type: Number, default: 0 },
  contractCreations: { type: Number, default: 0 }
}, { _id: false });

const walletSnapshotSchema = new mongoose.Schema({
  walletAddress: { 
    type: String, 
    required: true,
    lowercase: true,
    validate: {
      validator: function(v: string) {
        return /^0x[a-fA-F0-9]{40}$/.test(v);
      },
      message: 'Invalid Ethereum address format'
    }
  },
  
  network: { 
    type: String, 
    enum: ["testnet", "devnet", "mainnet"], 
    default: "testnet",
    required: true
  }, // Network for this snapshot
  timestamp: { type: Date, default: Date.now, index: true },
  
  // Basic balance information
  ethBalance: { type: String, required: true, default: '0' },
  
  // Token holdings
  erc20Tokens: [{
    contractAddress: { type: String, required: true },
    symbol: { type: String },
    name: { type: String },
    balance: { type: String, required: true },
    decimals: { type: Number, default: 18 },
    balanceFormatted: { type: String },
    usdValue: { type: Number, default: 0 }
  }],
  
  erc721Tokens: [{
    tokenId: { type: String, required: true },
    contractAddress: { type: String, required: true },
    name: { type: String },
    symbol: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed }
  }],
  
  // Transaction analysis
  transactionsAnalyzed: { type: Number, default: 0 },
  transactionMetrics: enhancedTransactionMetricsSchema,
  
  // Enhanced portfolio data
  portfolioValue: portfolioValueSchema,
  
  // Risk assessment
  riskScore: { 
    type: Number, 
    min: 1, 
    max: 10, 
    default: 1 
  },
  riskFactors: [{
    factor: String,
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'] },
    description: String
  }],
  
  // Alert system
  alerts: [alertSchema],
  
  // Metadata and quality indicators
  analysisMetadata: analysisMetadataSchema,
  
  // Comparison with previous snapshot
  changeMetrics: {
    balanceChange: { type: String, default: '0' },
    balanceChangePercent: { type: Number, default: 0 },
    newTokensDetected: { type: Number, default: 0 },
    newContractsInteracted: { type: Number, default: 0 },
    activityIncrease: { type: Number, default: 0 }
  },
  
  // Performance tracking
  processingTime: { type: Number }, // milliseconds
  dataFreshness: { 
    type: String,
    enum: ['REALTIME', 'RECENT', 'STALE'],
    default: 'RECENT'
  }
}, {
  timestamps: true,
  indexes: [
    { walletAddress: 1, timestamp: -1 },
    { 'riskScore': -1 },
    { 'alerts.severity': 1 },
    { 'portfolioValue.totalValue': -1 }
  ]
});

// Virtual for formatted balance
walletSnapshotSchema.virtual('ethBalanceFormatted').get(function() {
  const balance = parseFloat(this.ethBalance) / Math.pow(10, 18);
  return balance.toFixed(6);
});

// Virtual for portfolio change
walletSnapshotSchema.virtual('portfolioChangePercent').get(function() {
  return this.changeMetrics?.balanceChangePercent || 0;
});

// Instance method to get high severity alerts
walletSnapshotSchema.methods.getHighSeverityAlerts = function() {
  return this.alerts.filter((alert: any) => alert.severity === 'HIGH');
};

// Instance method to check if wallet is high risk
walletSnapshotSchema.methods.isHighRisk = function() {
  return this.riskScore >= 7;
};

// Static method to find recent snapshots
walletSnapshotSchema.statics.findRecentSnapshots = function(walletAddress: string, limit: number = 10) {
  return this.find({ walletAddress: walletAddress.toLowerCase() })
    .sort({ timestamp: -1 })
    .limit(limit);
};

// Static method to find wallets by risk level
walletSnapshotSchema.statics.findByRiskLevel = function(minRisk: number, maxRisk: number = 10) {
  return this.find({ 
    riskScore: { $gte: minRisk, $lte: maxRisk } 
  }).sort({ riskScore: -1 });
};

// Pre-save middleware to calculate derived fields
walletSnapshotSchema.pre('save', function(next) {
  // Calculate formatted balance for ERC20 tokens
  if (this.erc20Tokens) {
    this.erc20Tokens.forEach((token: any) => {
      if (token.balance && token.decimals) {
        const balance = parseFloat(token.balance) / Math.pow(10, token.decimals);
        token.balanceFormatted = balance.toFixed(6);
      }
    });
  }
  
  // Set data freshness based on timestamp
  const now = new Date();
  const snapshotAge = now.getTime() - this.timestamp.getTime();
  const oneHour = 60 * 60 * 1000;
  const sixHours = 6 * 60 * 60 * 1000;
  
  if (snapshotAge < oneHour) {
    this.dataFreshness = 'REALTIME';
  } else if (snapshotAge < sixHours) {
    this.dataFreshness = 'RECENT';
  } else {
    this.dataFreshness = 'STALE';
  }
  
  next();
});

export const WalletSnapshot = mongoose.model('WalletSnapshot', walletSnapshotSchema);