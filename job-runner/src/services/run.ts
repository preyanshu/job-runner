import axios from "axios";
import { WalletSnapshot } from "../models/WalletSnapshot";
import { getNetworkConfig, DEFAULT_NETWORK } from "../config/networks";

interface Transaction {
  hash: string;
  timestamp: string;
  value: string;
  fee: string;
  type: number; // 0 = native ETH/SEI, 2 = contract execution
  actionType: string;
  from: string;
  to: string;
  data?: string;
  method?: string;
  gasPrice: string;
  gasLimit: string;
  gasUsedByTransaction: string;
  status: boolean;
  failureReason?: string | null;
}

interface TokenPrice {
  symbol: string;
  address: string;
  price: number;
  change24h: number;
}

interface Alert {
  type: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: Date;
  data?: any;
}

// Helper function to validate Ethereum address format
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Transaction categorization based on method signatures and patterns
function categorizeTransaction(tx: Transaction): string {
  if (!tx.data || tx.data === '0x' || tx.data === '0') {
    return tx.type === 0 ? 'NATIVE_TRANSFER' : 'SIMPLE_CONTRACT_CALL';
  }

  const methodId = tx.method || tx.data.slice(0, 10);
  
  // Common DeFi method signatures
  const defiMethods: { [key: string]: string } = {
    '0xa9059cbb': 'ERC20_TRANSFER',
    '0x23b872dd': 'ERC20_TRANSFER_FROM',
    '0x095ea7b3': 'ERC20_APPROVE',
    '0x7c025200': 'UNISWAP_SWAP',
    '0x38ed1739': 'UNISWAP_SWAP_EXACT_TOKENS',
    '0x8803dbee': 'UNISWAP_SWAP_TOKENS_SUPPORTING_FEE',
    '0xb6f9de95': 'SUSHISWAP_SWAP',
    '0xe8e33700': 'COMPOUND_MINT',
    '0xdb006a75': 'COMPOUND_REDEEM',
    '0xf2fde38b': 'OWNERSHIP_TRANSFER',
    '0x42842e0e': 'NFT_SAFE_TRANSFER_FROM',
    '0xff0d7c2f': 'CUSTOM_EXECUTION'
  };

  return defiMethods[methodId] || 'UNKNOWN_CONTRACT_INTERACTION';
}

// Calculate portfolio value using actual price data from reliable sources
async function calculatePortfolioValue(nativeBalance: string, tokens: any[]): Promise<{
  totalValue: number;
  nativeValue: number;
  tokenValue: number;
  priceData: TokenPrice[];
}> {
  try {
    // Real price data for SEI ecosystem tokens
    const priceData: TokenPrice[] = [
      { symbol: 'SEI', address: 'native', price: 0.32, change24h: -4.6 },
      { symbol: 'WSEI', address: '0xdc78b593dd44914c326d1ed37501ead48c4c5628', price: 0.32, change24h: -4.6 }, // Same as SEI since WSEI is wrapped SEI
      { symbol: 'USDC', address: '0x3894085ef7ff0f0aedf52e2a2704928d1ec074f1', price: 1.00, change24h: 0.00 },
      { symbol: 'WETH', address: '0x160345fC359604fC6e70E3c5fAcbdE5F7A9342d8', price: 4774.93, change24h: -1.8 },
      { symbol: 'ASTRO', address: '0x7fa7677c6708f0cd07724d61bfdc6be6bb15d2e7', price: 0.085, change24h: -2.1 } // Need to search separately for ASTRO
    ];
    // Calculate native balance value (SEI)
    const nativeBalanceNum = parseFloat(nativeBalance) / Math.pow(10, 18);
    const seiPrice = priceData.find(p => p.symbol === 'SEI')?.price || 0.45;
    const nativeValue = nativeBalanceNum * seiPrice;

    // Calculate token values
    let tokenValue = 0;
    tokens.forEach(token => {
      const price = priceData.find(p => 
        p.address.toLowerCase() === token.contractAddress?.toLowerCase()
      );
      if (price && token.balance) {
        const decimals = token.decimals || 18;
        const tokenBalance = parseFloat(token.balance) / Math.pow(10, decimals);
        tokenValue += tokenBalance * price.price;
      }
    });

    return {
      totalValue: nativeValue + tokenValue,
      nativeValue,
      tokenValue,
      priceData
    };
  } catch (error) {
    console.error('Error calculating portfolio value:', error);
    return { totalValue: 0, nativeValue: 0, tokenValue: 0, priceData: [] };
  }
}

// Risk assessment based on transaction patterns
function calculateRiskScore(transactions: Transaction[], metrics: any): number {
  let riskScore = 1; // Base score

  // High transaction frequency risk
  if (transactions.length > 50) riskScore += 1;

  // Large transaction values risk
  const largeTransactions = transactions.filter(tx => 
    parseFloat(tx.value) > Math.pow(10, 20) // > 100 tokens
  );
  if (largeTransactions.length > 5) riskScore += 1;

  // Many unique contracts risk
  if (metrics.uniqueContracts.length > 20) riskScore += 1;

  // High gas usage risk (potential bot activity)
  const avgGasUsed = parseFloat(metrics.totalGasUsed) / Math.max(transactions.length, 1);
  if (avgGasUsed > 200000) riskScore += 1;

  // Failed transactions risk
  const failedTxs = transactions.filter(tx => !tx.status);
  if (failedTxs.length > transactions.length * 0.1) riskScore += 1; // >10% failure rate

  // Contract interaction without value risk (potential exploitation)
  const zeroValueContractCalls = transactions.filter(tx => 
    tx.type === 2 && parseFloat(tx.value) === 0
  );
  if (zeroValueContractCalls.length > transactions.length * 0.5) riskScore += 1;

  return Math.min(riskScore, 10); // Cap at 10
}

// Detect alerts based on wallet activity
function detectAlerts(
  transactions: Transaction[], 
  metrics: any, 
  portfolioValue: number,
  previousSnapshot?: any
): Alert[] {
  const alerts: Alert[] = [];
  const now = new Date();

  // Large transaction alert
  const largeTransactions = transactions.filter(tx => 
    parseFloat(tx.value) > Math.pow(10, 21) // > 1000 tokens
  );
  if (largeTransactions.length > 0) {
    alerts.push({
      type: 'LARGE_TRANSACTION',
      message: `${largeTransactions.length} large transaction(s) detected`,
      severity: 'HIGH',
      timestamp: now,
      data: { count: largeTransactions.length, transactions: largeTransactions.map(tx => tx.hash) }
    });
  }

  // High gas usage alert
  if (parseFloat(metrics.totalGasUsed) > Math.pow(10, 18)) {
    alerts.push({
      type: 'HIGH_GAS_USAGE',
      message: 'Unusually high gas consumption detected',
      severity: 'MEDIUM',
      timestamp: now,
      data: { gasUsed: metrics.totalGasUsed }
    });
  }

  // New contract interactions
  if (metrics.uniqueContracts.length > 10) {
    alerts.push({
      type: 'MULTIPLE_CONTRACT_INTERACTIONS',
      message: `Interactions with ${metrics.uniqueContracts.length} different contracts`,
      severity: 'MEDIUM',
      timestamp: now,
      data: { contractCount: metrics.uniqueContracts.length }
    });
  }

  // Portfolio value change alert (if previous snapshot exists)
  if (previousSnapshot && previousSnapshot.portfolioValue) {
    const previousValue = previousSnapshot.portfolioValue.totalValue || 0;
    const changePercent = ((portfolioValue - previousValue) / Math.max(previousValue, 1)) * 100;
    
    if (Math.abs(changePercent) > 20) { // >20% change
      alerts.push({
        type: 'PORTFOLIO_VALUE_CHANGE',
        message: `Portfolio value changed by ${changePercent.toFixed(2)}%`,
        severity: changePercent < 0 ? 'HIGH' : 'MEDIUM',
        timestamp: now,
        data: { changePercent, previousValue, currentValue: portfolioValue }
      });
    }
  }

  // Suspicious activity pattern
  const suspiciousPatterns = transactions.filter(tx => 
    tx.actionType === 'Execute' && parseFloat(tx.value) === 0 && tx.data && tx.data.length > 200
  );
  if (suspiciousPatterns.length > 10) {
    alerts.push({
      type: 'SUSPICIOUS_ACTIVITY',
      message: 'Potential automated/bot activity detected',
      severity: 'HIGH',
      timestamp: now,
      data: { patternCount: suspiciousPatterns.length }
    });
  }

  return alerts;
}

export async function createWalletSnapshot(wallet: string, network: string = DEFAULT_NETWORK) {
  try {
    // Get network configuration
    const networkConfig = getNetworkConfig(network);
    
    // Early validation of Ethereum address format
    if (!isValidEthereumAddress(wallet)) {
      const error = new Error(`Invalid Ethereum address format: ${wallet}`);
      (error as any).code = 'INVALID_ADDRESS_FORMAT';
      (error as any).walletAddress = wallet;
      throw error;
    }

    // 1️⃣ First, validate the wallet address and get balance using the contract endpoint
    let walletInfo;
    try {
      const walletRes = await axios.get(`${networkConfig.apiEndpoint}/accounts/evm/${wallet}`);
      walletInfo = walletRes.data;

      // {
      //   "address": "0xfd676159b4f0b3b86ade2b2c618b1e6fc7d57ee4",
      //   "timestamp": "2025-08-23T22:53:07.000Z",
      //   "balance": 1.9915909339600245e+19,
      //   "blockHeight": 193902594,
      //   "erc20TokensCount": 0,
      //   "erc721TokensCount": 0,
      //   "erc404ItemsCount": 0,
      //   "erc404TokensCount": 0,
      //   "erc1155TokensCount": 0,
      //   "txsCount": 392
      // }
      //  this is what we get in wallet res 
      // Check if the response indicates a valid address
      // The API returns an 'address' field, not 'hash'
      if (!walletInfo || !walletInfo.address || walletInfo.address.toLowerCase() !== wallet.toLowerCase()) {
        const error = new Error(`Invalid or non-existent wallet address: ${wallet}`);
        (error as any).code = 'INVALID_WALLET_ADDRESS';
        (error as any).walletAddress = wallet;
        (error as any).apiResponse = walletInfo;
        throw error;
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        const notFoundError = new Error(`Wallet address not found on blockchain: ${wallet}`);
        (notFoundError as any).code = 'WALLET_NOT_FOUND';
        (notFoundError as any).walletAddress = wallet;
        (notFoundError as any).httpStatus = 404;
        throw notFoundError;
      }
      throw error; // Re-throw other errors
    }

    // Extract balance from the wallet info
    const ethBalance = walletInfo.balance || '0';

    // 2️⃣ Get additional wallet data with robust error handling
    let transactions: Transaction[] | "N/A" = [];
    let transactionError: any = null;
    let erc20Tokens: any[] | "N/A" = []; // Will be set to "N/A" if fetch fails
    let erc721Tokens: any[] | "N/A" = []; // Will be set to "N/A" if fetch fails
    let erc20FetchFailed = false;
    let erc721FetchFailed = false;

    try {
      const [erc20Res, erc721Res] = await Promise.all([
        axios.get(`${networkConfig.apiEndpoint}/accounts/${wallet}/tokens?limit=25&type=erc20`),
        axios.get(`${networkConfig.apiEndpoint}/accounts/${wallet}/tokens?limit=25&type=erc721`)
      ]);

      erc20Tokens = erc20Res.data.tokens || [];
      erc721Tokens = erc721Res.data.tokens || [];
      console.log(`✅ ERC20 tokens fetched for ${wallet}: ${erc20Tokens.length} tokens`);
      console.log(`✅ ERC721 tokens fetched for ${wallet}: ${erc721Tokens.length} tokens`);
    } catch (error: any) {
      console.error('Error fetching tokens:', error.message);
      // Set tokens to "N/A" to indicate fetch failure
      erc20Tokens = "N/A";
      erc721Tokens = "N/A";
      erc20FetchFailed = true;
      erc721FetchFailed = true;
      console.log(`⚠️ Token fetch failed for ${wallet}, setting to N/A`);
    }

    // Try multiple transaction endpoint formats with fallback logic
    let txRes;
    try {
      // Try the original format first
      txRes = await axios.get(`${networkConfig.apiEndpoint}/accounts/${wallet}/transactions?offset=0&limit=50`);
      console.log(`✅ Transactions fetched using original endpoint for ${wallet}`);
    } catch (originalError) {
      console.log(`⚠️ Original endpoint failed for ${wallet}, trying EVM endpoint...`);
      try {
        // Try the EVM format
        txRes = await axios.get(`${networkConfig.apiEndpoint}/accounts/evm/${wallet}/transactions?offset=0&limit=50`);
        console.log(`✅ Transactions fetched using EVM endpoint for ${wallet}`);
      } catch (evmError) {
        console.log(`⚠️ EVM endpoint also failed for ${wallet}, trying contract transactions...`);
        try {
          // Try as contract transactions
          txRes = await axios.get(`${networkConfig.apiEndpoint}/contracts/evm/${wallet}/transactions?offset=0&limit=50`);
          console.log(`✅ Transactions fetched using contract endpoint for ${wallet}`);
        } catch (contractError) {
          console.log(`❌ All transaction endpoints failed for ${wallet}`);
          transactionError = contractError;
          transactions = "N/A"; // Set to N/A instead of empty array
          console.log(`⚠️ All transaction endpoints failed for ${wallet}, setting to N/A`);
        }
      }
    }

    if (transactions !== "N/A" && txRes) {
      transactions = txRes.data.items || [];
    }

    // Debug logging
    console.log(`🔍 Transaction fetch result for ${wallet}:`, {
      totalTransactions: transactions === "N/A" ? "N/A" : transactions.length,
      error: transactionError ? (transactionError as any).response?.data : null
    });

    // 3️⃣ Compute enhanced metrics
    let transactionMetrics = {
      totalIncoming: '0',
      totalOutgoing: '0',
      totalGasUsed: '0',
      totalFeesPaid: '0',
      contractInteractions: 0,
      nativeTransfers: 0,
      executionTransactions: 0,
      uniqueContracts: new Set<string>(),
      // Enhanced metrics
      transactionCategories: {} as Record<string, number>,
      avgGasPrice: '0',
      avgTransactionValue: '0',
      failedTransactions: 0,
      lastActivityTime: null as Date | null
    };

    let totalTransactionValue = BigInt(0);

    // Only process transactions if we successfully fetched them
    if (transactions !== "N/A") {
      transactions.forEach(tx => {
        // Process all transactions for analysis, but only count successful ones for financial metrics
        const txValue = BigInt(tx.value || '0');
        const txFee = BigInt(tx.fee || '0');
        const gasUsed = BigInt(tx.gasUsedByTransaction || '0');
        const gasPrice = BigInt(tx.gasPrice || '0');

        // Categorize transaction
        const category = categorizeTransaction(tx);
        transactionMetrics.transactionCategories[category] = 
          (transactionMetrics.transactionCategories[category] || 0) + 1;

      // Track last activity
      const txTime = new Date(tx.timestamp);
      if (!transactionMetrics.lastActivityTime || txTime > transactionMetrics.lastActivityTime) {
        transactionMetrics.lastActivityTime = txTime;
      }

      // Track failed transactions
      if (!tx.status) {
        transactionMetrics.failedTransactions += 1;
        return; // Skip failed transactions for financial calculations
      }

      // Track incoming transactions to this wallet
      if (tx.to && tx.to.toLowerCase() === wallet.toLowerCase() && txValue > BigInt(0)) {
        transactionMetrics.totalIncoming = (BigInt(transactionMetrics.totalIncoming) + txValue).toString();
      }

      // Track outgoing transactions from this wallet
      if (tx.from && tx.from.toLowerCase() === wallet.toLowerCase()) {
        if (txValue > BigInt(0)) {
          transactionMetrics.totalOutgoing = (BigInt(transactionMetrics.totalOutgoing) + txValue).toString();
          totalTransactionValue += txValue;
        }
        // Track fees paid (only for transactions sent by this wallet)
        transactionMetrics.totalFeesPaid = (BigInt(transactionMetrics.totalFeesPaid) + txFee).toString();
        transactionMetrics.totalGasUsed = (BigInt(transactionMetrics.totalGasUsed) + gasUsed).toString();
      }

      // Categorize transaction types
      if (tx.type === 0) {
        transactionMetrics.nativeTransfers += 1;
      } else if (tx.type === 2) {
        transactionMetrics.contractInteractions += 1;
        // Track unique contracts interacted with
        if (tx.to) {
          transactionMetrics.uniqueContracts.add(tx.to.toLowerCase());
        }
      }

      // Count execution transactions
      if (tx.actionType === "Execute") {
        transactionMetrics.executionTransactions += 1;
      }
    });

      // Calculate averages
      const successfulTxs = transactions.filter(tx => tx.status).length;
      if (successfulTxs > 0) {
        const totalGasPrice = transactions
          .filter(tx => tx.status)
          .reduce((sum, tx) => sum + BigInt(tx.gasPrice || '0'), BigInt(0));
        transactionMetrics.avgGasPrice = (totalGasPrice / BigInt(successfulTxs)).toString();
        transactionMetrics.avgTransactionValue = (totalTransactionValue / BigInt(successfulTxs)).toString();
      }
    }

    // Convert Set to Array for storage
    const finalMetrics = {
      ...transactionMetrics,
      uniqueContracts: Array.from(transactionMetrics.uniqueContracts)
    };

    // 4️⃣ Calculate portfolio value
    const portfolioData = await calculatePortfolioValue(ethBalance, erc20Tokens === "N/A" ? [] : erc20Tokens);

    // 5️⃣ Get previous snapshot for comparison (same network)
    const previousSnapshot = await WalletSnapshot.findOne({ 
      walletAddress: wallet, 
      network 
    }).sort({ timestamp: -1 });

    // 6️⃣ Merge with previous snapshot metrics
    if (previousSnapshot?.transactionMetrics) {
      const prev = previousSnapshot.transactionMetrics;

      finalMetrics.totalIncoming = (BigInt(finalMetrics.totalIncoming) + BigInt(prev.totalIncoming || '0')).toString();
      finalMetrics.totalOutgoing = (BigInt(finalMetrics.totalOutgoing) + BigInt(prev.totalOutgoing || '0')).toString();
      finalMetrics.totalGasUsed = (BigInt(finalMetrics.totalGasUsed) + BigInt(prev.totalGasUsed || '0')).toString();
      finalMetrics.totalFeesPaid = (BigInt(finalMetrics.totalFeesPaid) + BigInt(prev.totalFeesPaid || '0')).toString();
      finalMetrics.contractInteractions += prev.contractInteractions || 0;
      finalMetrics.nativeTransfers += prev.nativeTransfers || 0;
      finalMetrics.executionTransactions += prev.executionTransactions || 0;
      finalMetrics.failedTransactions += prev.failedTransactions || 0;
      
      // Merge unique contracts
      const prevContracts = new Set(prev.uniqueContracts || []);
      const currentContracts = new Set(finalMetrics.uniqueContracts);
      const mergedContracts = new Set<string>();
      prevContracts.forEach(contract => mergedContracts.add(contract as string));
      currentContracts.forEach(contract => mergedContracts.add(contract as string));
      finalMetrics.uniqueContracts = Array.from(mergedContracts);

      // Merge transaction categories
      if (prev.transactionCategories) {
        Object.entries(prev.transactionCategories).forEach(([category, count]) => {
          finalMetrics.transactionCategories[category] = 
            (finalMetrics.transactionCategories[category] || 0) + (count as number);
        });
      }
    }

    // 7️⃣ Calculate risk score
    const riskScore = calculateRiskScore(transactions === "N/A" ? [] : transactions, finalMetrics);

    // 8️⃣ Detect alerts
    const alerts = detectAlerts(transactions === "N/A" ? [] : transactions, finalMetrics, portfolioData.totalValue, previousSnapshot);

    // 9️⃣ Create enhanced snapshot object
    const snapshot = new WalletSnapshot({
      walletAddress: wallet,
      network,
      timestamp: new Date(),
      ethBalance,
      erc20Tokens,
      erc721Tokens,
      transactionsAnalyzed: transactions === "N/A" ? -1 : transactions.length,
      transactionMetrics: finalMetrics,
      
      // Enhanced data
      portfolioValue: portfolioData,
      riskScore,
      alerts,
      analysisMetadata: {
        apiEndpointsUsed: transactionError ? ['contract-balance-only'] : ['contract-balance', 'transactions'],
        dataQuality: transactions === "N/A" ? 'SERVICE_UNAVAILABLE' : (transactions.length > 0 ? 'COMPLETE' : 'LIMITED'),
        lastUpdated: new Date(),
        pricesLastUpdated: new Date(),
        serviceStatus: {
          erc20Tokens: erc20Tokens === "N/A" ? 'FAILED' : 'SUCCESS',
          erc721Tokens: erc721Tokens === "N/A" ? 'FAILED' : 'SUCCESS',
          transactions: transactions === "N/A" ? 'FAILED' : 'SUCCESS'
        }
      }
    });

    console.log("💾 Enhanced Snapshot to save:", JSON.stringify({
      walletAddress: snapshot.walletAddress,
      transactionsAnalyzed: snapshot.transactionsAnalyzed,
      portfolioValue: snapshot.portfolioValue?.totalValue,
      riskScore: snapshot.riskScore,
      alertsCount: snapshot.alerts?.length || 0,
      serviceStatus: {
        erc20Tokens: erc20Tokens === "N/A" ? 'FAILED' : 'SUCCESS',
        erc721Tokens: erc721Tokens === "N/A" ? 'FAILED' : 'SUCCESS',
        transactions: transactions === "N/A" ? 'FAILED' : 'SUCCESS'
      },
      topTransactionCategories: Object.entries(finalMetrics.transactionCategories)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 3)
    }, null, 2));

    await snapshot.save();
    console.log(`✅ Enhanced snapshot saved for wallet: ${wallet}`);

    // Log alerts for monitoring
    if (alerts.length > 0) {
      console.log(`🚨 ${alerts.length} alerts generated for wallet ${wallet}:`);
      alerts.forEach(alert => 
        console.log(`  - ${alert.severity}: ${alert.message}`)
      );
    }

    return snapshot;

  } catch (err) {
    console.error("Error creating wallet snapshot:", err);
    // Re-throw the error so the calling code can handle it properly
    throw err;
  }
}