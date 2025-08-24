import axios from 'axios';
import { MemeCoinSnapshot } from '../models/MemeCoinSnapshot'; // Adjust path as needed
import { getNetworkConfig, DEFAULT_NETWORK } from '../config/networks';

// Type definitions for the transaction data structure
interface TokenInfo {
  hash: string;
  name: string;
  symbol: string;
  decimals: string;
  totalSupply: string;
  image: string | null;
}

interface Transaction {
  timestamp: string;
  from: string;
  to: string;
  value: string;
  txHash: string;
  status: boolean;
  actionType: string;
  fee: string;
  tokenHash: string;
  token: TokenInfo;
}

interface FlowMetrics {
  totalTransfers: number;
  totalVolume: string;
  uniqueAddresses: string[];
  largeTransfers: Array<{
    txHash: string;
    from: string;
    to: string;
    value: string;
    timestamp: string;
  }>;
  burnTransactions: Array<{
    txHash: string;
    from: string;
    value: string;
    timestamp: string;
  }>;
  topSenders: Array<{
    address: string;
    totalSent: string;
    transactionCount: number;
  }>;
  topReceivers: Array<{
    address: string;
    totalReceived: string;
    transactionCount: number;
  }>;
  volumeByTimeframe: {
    last1h: string;
    last6h: string;
    last24h: string;
  };
  transferPatterns: {
    avgTransferSize: string;
    medianTransferSize: string;
    transferFrequency: number;
  };
  processedTransactionHashes: string[];
}

interface AlertData {
  type: 'LARGE_TRANSFER' | 'BURN_DETECTED' | 'WHALE_MOVEMENT' | 'VOLUME_SPIKE' | 'SUSPICIOUS_PATTERN'| 'WATCHED_WALLET_ACTIVITY';
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  timestamp: Date;
  data: any;
}

interface TokenConfig {
  address: string;
  name: string;
  symbol: string;
  thresholds: {
    largeTransfer: number;
    whalePercentage: number;
    volumeSpike: number;
  };
  watchedAddresses: string[];
}

interface AnalyzeFlowsOptions {
  apiEndpoint?: string;
  transactionLimit?: number;
}

const BURN_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Fetches the newest transactions for a specific token
 */
async function fetchLatestTransactions(
  tokenAddress: string,
  apiEndpoint: string,
  limit: number = 25
): Promise<{ transactions: Transaction[], tokenInfo: TokenInfo | null }> {
  try {
    const endpoints = [
      `${apiEndpoint}/transfers/evm/erc20?tokenHash=${tokenAddress}&offset=0&limit=${limit}`,
      `${apiEndpoint}/tokens/${tokenAddress}/transactions?limit=${limit}`,
      `${apiEndpoint}/contracts/${tokenAddress}/transactions?limit=${limit}`
    ];

    let response: any = null;

    for (const endpoint of endpoints) {
      try {
        console.log(`🔍 Trying endpoint: ${endpoint}`);
        const res = await axios.get(endpoint, { timeout: 30000 });
        
        if (res.data && (res.data.items || res.data.transfers)) {
          response = res.data;
          console.log(`✅ Successfully fetched ${limit} latest transactions`);
          break;
        }
      } catch (error: any) {
        console.log(`❌ Endpoint failed: ${endpoint} - ${error.message}`);
        continue;
      }
    }

    if (!response) {
      throw new Error('All API endpoints failed');
    }

    const transactions = response.items || response.transfers || [];
    const tokenInfo = transactions[0]?.token || null;

    return { transactions, tokenInfo };
  } catch (error) {
    console.error(`Error fetching transactions for token ${tokenAddress}:`, error);
    return { transactions: [], tokenInfo: null };
  }
}

/**
 * Filters out transactions that have already been processed
 */
function getNewTransactions(
  latestTransactions: Transaction[], 
  previousSnapshot: any | null
): Transaction[] {
  if (!previousSnapshot || !previousSnapshot.flowMetrics?.processedTransactionHashes) {
    return latestTransactions;
  }

  const processedHashes = new Set(previousSnapshot.flowMetrics.processedTransactionHashes);
  return latestTransactions.filter(tx => !processedHashes.has(tx.txHash));
}

/**
 * Merges sender/receiver metrics cumulatively
 */
function mergeSenderReceiverMetrics(
  newTransactions: Transaction[],
  previousMetrics: FlowMetrics | null | undefined
): {
  senderMetrics: Map<string, { totalSent: bigint; count: number }>;
  receiverMetrics: Map<string, { totalReceived: bigint; count: number }>;
} {
  const senderMetrics = new Map<string, { totalSent: bigint; count: number }>();
  const receiverMetrics = new Map<string, { totalReceived: bigint; count: number }>();

  // Initialize with previous data if it exists
  if (previousMetrics) {
    previousMetrics.topSenders?.forEach(sender => {
      senderMetrics.set(sender.address.toLowerCase(), {
        totalSent: BigInt(sender.totalSent),
        count: sender.transactionCount
      });
    });

    previousMetrics.topReceivers?.forEach(receiver => {
      receiverMetrics.set(receiver.address.toLowerCase(), {
        totalReceived: BigInt(receiver.totalReceived),
        count: receiver.transactionCount
      });
    });
  }

  // Add new transaction data
  newTransactions.forEach(tx => {
    if (!tx.status) return;

    const value = BigInt(tx.value);
    const sender = tx.from.toLowerCase();
    const receiver = tx.to.toLowerCase();

    // Update sender metrics
    if (senderMetrics.has(sender)) {
      const metrics = senderMetrics.get(sender)!;
      senderMetrics.set(sender, {
        totalSent: metrics.totalSent + value,
        count: metrics.count + 1
      });
    } else {
      senderMetrics.set(sender, { totalSent: value, count: 1 });
    }

    // Update receiver metrics
    if (receiverMetrics.has(receiver)) {
      const metrics = receiverMetrics.get(receiver)!;
      receiverMetrics.set(receiver, {
        totalReceived: metrics.totalReceived + value,
        count: metrics.count + 1
      });
    } else {
      receiverMetrics.set(receiver, { totalReceived: value, count: 1 });
    }
  });

  return { senderMetrics, receiverMetrics };
}

/**
 * Analyzes transaction flows cumulatively
 */
function analyzeCumulativeFlows(
  newTransactions: Transaction[], 
  config: TokenConfig,
  previousSnapshot: any | null
): FlowMetrics {
  const previousMetrics = previousSnapshot?.flowMetrics || null;
  
  // Get cumulative data
  const { senderMetrics, receiverMetrics } = mergeSenderReceiverMetrics(newTransactions, previousMetrics);
  
  // Calculate cumulative unique addresses
  const uniqueAddresses = new Set<string>(previousMetrics?.uniqueAddresses || []);
  
  // Process new transactions
  let newVolume = BigInt(0);
  const newLargeTransfers: FlowMetrics['largeTransfers'] = [];
  const newBurnTransactions: FlowMetrics['burnTransactions'] = [];
  const newTransferSizes: bigint[] = [];

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  let volume1h = BigInt(previousMetrics?.volumeByTimeframe?.last1h || '0');
  let volume6h = BigInt(previousMetrics?.volumeByTimeframe?.last6h || '0');
  let volume24h = BigInt(previousMetrics?.volumeByTimeframe?.last24h || '0');

  newTransactions.forEach(tx => {
    if (!tx.status) return;
    
    const value = BigInt(tx.value);
    const txTime = new Date(tx.timestamp);
    
    newVolume += value;
    newTransferSizes.push(value);
    
    // Track unique addresses
    uniqueAddresses.add(tx.from.toLowerCase());
    uniqueAddresses.add(tx.to.toLowerCase());
    
    // Time-based volume (add new transactions to existing volumes)
    if (txTime >= oneHourAgo) volume1h += value;
    if (txTime >= sixHoursAgo) volume6h += value;
    if (txTime >= oneDayAgo) volume24h += value;
    
    // Detect large transfers in new transactions
    if (Number(value) >= config.thresholds.largeTransfer) {
      newLargeTransfers.push({
        txHash: tx.txHash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        timestamp: tx.timestamp
      });
    }
    
    // Detect burn transactions in new transactions
    if (tx.to.toLowerCase() === BURN_ADDRESS.toLowerCase()) {
      newBurnTransactions.push({
        txHash: tx.txHash,
        from: tx.from,
        value: tx.value,
        timestamp: tx.timestamp
      });
    }
  });

  // Merge with previous large transfers and burns (keep recent ones)
  const allLargeTransfers = [
    ...newLargeTransfers,
    ...(previousMetrics?.largeTransfers?.slice(0, 50) || [])
  ].slice(0, 100);

  const allBurnTransactions = [
    ...newBurnTransactions,
    ...(previousMetrics?.burnTransactions?.slice(0, 50) || [])
  ].slice(0, 100);

  // Calculate cumulative volume
  const previousTotalVolume = BigInt(previousMetrics?.totalVolume || '0');
  const cumulativeTotalVolume = previousTotalVolume + newVolume;

  // Calculate cumulative transfer count
  const previousTransferCount = previousMetrics?.totalTransfers || 0;
  const cumulativeTotalTransfers = previousTransferCount + newTransactions.length;

  // Calculate top senders and receivers from cumulative data
  const topSenders = Array.from(senderMetrics.entries())
    .sort(([,a], [,b]) => Number(b.totalSent - a.totalSent))
    .slice(0, 10)
    .map(([address, metrics]) => ({
      address,
      totalSent: metrics.totalSent.toString(),
      transactionCount: metrics.count
    }));

  const topReceivers = Array.from(receiverMetrics.entries())
    .sort(([,a], [,b]) => Number(b.totalReceived - a.totalReceived))
    .slice(0, 10)
    .map(([address, metrics]) => ({
      address,
      totalReceived: metrics.totalReceived.toString(),
      transactionCount: metrics.count
    }));

  // Calculate transfer patterns
  const avgTransferSize = cumulativeTotalTransfers > 0
    ? cumulativeTotalVolume / BigInt(cumulativeTotalTransfers)
    : BigInt(0);

  const sortedNewSizes = newTransferSizes.sort((a, b) => Number(a - b));
  const medianTransferSize = sortedNewSizes.length > 0 
    ? sortedNewSizes[Math.floor(sortedNewSizes.length / 2)]
    : BigInt(previousMetrics?.transferPatterns?.medianTransferSize || '0');
    
  const transferFrequency = newTransactions.length;

  // Track all processed transaction hashes
  const processedTransactionHashes = [
    ...newTransactions.map(tx => tx.txHash),
    ...(previousMetrics?.processedTransactionHashes || [])
  ].slice(0, 1000);

  return {
    totalTransfers: cumulativeTotalTransfers,
    totalVolume: cumulativeTotalVolume.toString(),
    uniqueAddresses: Array.from(uniqueAddresses),
    largeTransfers: allLargeTransfers,
    burnTransactions: allBurnTransactions,
    topSenders,
    topReceivers,
    volumeByTimeframe: {
      last1h: volume1h.toString(),
      last6h: volume6h.toString(),
      last24h: volume24h.toString()
    },
    transferPatterns: {
      avgTransferSize: avgTransferSize.toString(),
      medianTransferSize: medianTransferSize.toString(),
      transferFrequency
    },
    processedTransactionHashes
  };
}

/**
 * Detects alerts based on flow analysis
 */
function detectAlerts(
  metrics: FlowMetrics, 
  config: TokenConfig, 
  previousSnapshot?: any,
  newTransactions: Transaction[] = []
): AlertData[] {
  const alerts: AlertData[] = [];
  const now = new Date();

  // Large transfer alerts (only for recent transfers)
  const recentLargeTransfers = metrics.largeTransfers.filter(transfer => {
    const transferTime = new Date(transfer.timestamp);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    return transferTime >= oneHourAgo;
  });

  if (recentLargeTransfers.length > 0) {
    alerts.push({
      type: 'LARGE_TRANSFER',
      message: `${recentLargeTransfers.length} large transfer(s) detected in last hour (>${config.thresholds.largeTransfer} tokens)`,
      severity: 'HIGH',
      timestamp: now,
      data: {
        count: recentLargeTransfers.length,
        transfers: recentLargeTransfers.slice(0, 5)
      }
    });
  }

  // Burn detection alerts (recent burns)
  const recentBurns = metrics.burnTransactions.filter(burn => {
    const burnTime = new Date(burn.timestamp);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    return burnTime >= oneHourAgo;
  });

  if (recentBurns.length > 0) {
    const totalBurned = recentBurns.reduce(
      (sum, tx) => sum + BigInt(tx.value), BigInt(0)
    );
    alerts.push({
      type: 'BURN_DETECTED',
      message: `${recentBurns.length} burn transaction(s) detected in last hour, total burned: ${totalBurned.toString()}`,
      severity: 'MEDIUM',
      timestamp: now,
      data: {
        count: recentBurns.length,
        totalBurned: totalBurned.toString(),
        burns: recentBurns.slice(0, 3)
      }
    });
  }

  // Whale movement detection (cumulative data)
  const whaleThreshold = BigInt(config.thresholds.largeTransfer * 10);
  const whaleMovements = metrics.topSenders.filter(sender => 
    BigInt(sender.totalSent) >= whaleThreshold
  );
  
  if (whaleMovements.length > 0) {
    alerts.push({
      type: 'WHALE_MOVEMENT',
      message: `${whaleMovements.length} whale-sized holder(s) detected (cumulative)`,
      severity: 'HIGH',
      timestamp: now,
      data: {
        count: whaleMovements.length,
        whales: whaleMovements.slice(0, 3)
      }
    });
  }

  // Volume spike detection (compare with previous)
  if (previousSnapshot) {
    const currentVolume = BigInt(metrics.volumeByTimeframe.last24h);
    const previousVolume = BigInt(previousSnapshot.flowMetrics?.volumeByTimeframe?.last24h || '0');
    
    if (previousVolume > 0) {
      const volumeChangePercent = Number((currentVolume - previousVolume) * BigInt(100) / previousVolume);
      
      if (volumeChangePercent > config.thresholds.volumeSpike) {
        alerts.push({
          type: 'VOLUME_SPIKE',
          message: `Volume spike detected: ${volumeChangePercent.toFixed(2)}% increase in 24h volume`,
          severity: 'MEDIUM',
          timestamp: now,
          data: {
            changePercent: volumeChangePercent,
            currentVolume: currentVolume.toString(),
            previousVolume: previousVolume.toString()
          }
        });
      }
    }
  }

  // Suspicious pattern detection (cumulative data)
  const suspiciousPatterns = metrics.topSenders.filter(sender => 
    sender.transactionCount > 100 && // High frequency (cumulative)
    Number(sender.totalSent) / sender.transactionCount < 100 // Small amounts
  );

  if (suspiciousPatterns.length > 0) {
    alerts.push({
      type: 'SUSPICIOUS_PATTERN',
      message: `${suspiciousPatterns.length} address(es) with suspicious high-frequency, low-value patterns (cumulative)`,
      severity: 'MEDIUM',
      timestamp: now,
      data: {
        count: suspiciousPatterns.length,
        patterns: suspiciousPatterns.slice(0, 3)
      }
    });
  }

  // Watched wallet activity (recent transactions)

    const watchedActivity = newTransactions.filter(tx => 
    config.watchedAddresses.some(addr => 
      addr.toLowerCase() === tx.from.toLowerCase() || 
      addr.toLowerCase() === tx.to.toLowerCase()
    )
  );

  if (watchedActivity.length > 0) {
    const details = watchedActivity.map(tx => {
      const involvedAddress = config.watchedAddresses.find(addr =>
        addr.toLowerCase() === tx.from.toLowerCase() || addr.toLowerCase() === tx.to.toLowerCase()
      );

      const direction = involvedAddress?.toLowerCase() === tx.from.toLowerCase() ? 'SENT' : 'RECEIVED';

      return {
        txHash: tx.txHash,
        address: involvedAddress,
        direction,
        value: tx.value,
        from: tx.from,
        to: tx.to,
        timestamp: tx.timestamp
      };
    });

    alerts.push({
      type: 'WATCHED_WALLET_ACTIVITY',
      message: `${watchedActivity.length} transaction(s) involved a watched wallet`,
      severity: 'LOW',
      timestamp: now,
      data: {
        count: watchedActivity.length,
        transactions: details.slice(0, 5) // limit to first 5 in alert
      }
    });
  }

  return alerts;
}

/**
 * Calculates risk score based on metrics and alerts
 */
function calculateRiskScore(metrics: FlowMetrics, alerts: AlertData[]): number {
  let riskScore = 1; // Base score

  // Large transfer risk (recent)
  const recentLargeTransfers = metrics.largeTransfers.filter(transfer => {
    const transferTime = new Date(transfer.timestamp);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    return transferTime >= oneHourAgo;
  });

  if (recentLargeTransfers.length > 5) riskScore += 2;
  else if (recentLargeTransfers.length > 0) riskScore += 1;

  // High concentration risk (cumulative)
  const totalVolume = BigInt(metrics.totalVolume);
  if (totalVolume > 0) {
    const topSenderVolume = BigInt(metrics.topSenders[0]?.totalSent || '0');
    const concentration = Number(topSenderVolume * BigInt(100) / totalVolume);
    if (concentration > 50) riskScore += 2;
    else if (concentration > 25) riskScore += 1;
  }

  // Alert-based risk
  const highSeverityAlerts = alerts.filter(a => a.severity === 'HIGH').length;
  const mediumSeverityAlerts = alerts.filter(a => a.severity === 'MEDIUM').length;
  
  riskScore += highSeverityAlerts * 2;
  riskScore += mediumSeverityAlerts;

  // Transfer frequency risk (recent activity)
  if (metrics.transferPatterns.transferFrequency > 20) riskScore += 1;

  return Math.min(riskScore, 10); // Cap at 10
}

/**
 * Main function to analyze meme coin flows and create/save cumulative snapshot
 */
// Helper function to validate Ethereum address format
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export async function analyzeCoinFlows(
  config: TokenConfig,
  network: string = DEFAULT_NETWORK,
  options: AnalyzeFlowsOptions = {}
): Promise<any> {
  // Get network configuration
  const networkConfig = getNetworkConfig(network);
  
  const {
    apiEndpoint = networkConfig.apiEndpoint,
    transactionLimit = 25
  } = options;

  try {
    // Early validation of Ethereum address format
    if (!isValidEthereumAddress(config.address)) {
      const error = new Error(`Invalid Ethereum address format: ${config.address}`);
      (error as any).code = 'INVALID_ADDRESS_FORMAT';
      (error as any).tokenAddress = config.address;
      throw error;
    }

    console.log(`🔍 Analyzing flows for ${config.name} (${config.symbol})...`);

    // Fetch latest transactions
    const { transactions: latestTransactions, tokenInfo } = await fetchLatestTransactions(
      config.address,
      apiEndpoint,
      transactionLimit
    );

    if (!tokenInfo) {
      throw new Error(`Could not fetch token info for ${config.address}`);
    }

    console.log(`📊 Fetched ${latestTransactions.length} latest transactions for ${config.name}`);

    // Get previous snapshot for cumulative analysis (same network)
    const previousSnapshot = await MemeCoinSnapshot.findOne(
      { 
        tokenAddress: config.address,
        network 
      }
    ).sort({ timestamp: -1 });

    // Filter out already processed transactions
    const newTransactions = getNewTransactions(latestTransactions, previousSnapshot);
    console.log(`✨ Found ${newTransactions.length} new transactions to process`);

    if (newTransactions.length === 0) {
      console.log(`⏩ No new transactions for ${config.name}, skipping...`);
      return null;
    }

    // Analyze flows cumulatively
    const flowMetrics = analyzeCumulativeFlows(newTransactions, config, previousSnapshot);
    
    // Detect alerts
    const alerts = detectAlerts(flowMetrics, config, previousSnapshot, newTransactions);
    
    // Calculate risk score
    const riskScore = calculateRiskScore(flowMetrics, alerts);

    // Create and save snapshot
    const snapshot = new MemeCoinSnapshot({
      tokenAddress: config.address,
      network,
      tokenInfo,
      timestamp: new Date(),
      flowMetrics,
      alerts,
      riskScore,
      analysisMetadata: {
        transactionsAnalyzed: latestTransactions.length,
        newTransactionsThisBatch: newTransactions.length,
        cumulativeTransactions: flowMetrics.totalTransfers,
        timeRange: 'cumulative',
        dataQuality: flowMetrics.totalTransfers > 100 ? 'COMPLETE' : 
                     flowMetrics.totalTransfers > 10 ? 'PARTIAL' : 'LIMITED',
        lastUpdated: new Date(),
        apiEndpoint
      }
    });

    await snapshot.save();

    console.log(`✅ Cumulative snapshot saved for ${config.name}:`);
    console.log(`   📈 Cumulative Volume: ${flowMetrics.totalVolume}`);
    console.log(`   🔄 Cumulative Transfers: ${flowMetrics.totalTransfers}`);
    console.log(`   🆕 New Transfers This Batch: ${newTransactions.length}`);
    console.log(`   👥 Unique Addresses: ${flowMetrics.uniqueAddresses.length}`);
    console.log(`   🚨 Alerts: ${alerts.length}`);
    console.log(`   ⚡ Risk Score: ${riskScore}/10`);

    if (alerts.length > 0) {
      console.log(`   🚨 Alerts generated:`);
      alerts.forEach(alert => 
        console.log(`     - ${alert.severity}: ${alert.message}`)
      );
    }

    return snapshot;

  } catch (error) {
    console.error(`Error analyzing ${config.name}:`, error);
    throw error;
  }
}

// Export additional utility functions for advanced usage
export {
  fetchLatestTransactions,
  getNewTransactions,
  mergeSenderReceiverMetrics,
  analyzeCumulativeFlows,
  detectAlerts,
  calculateRiskScore,
  type TokenConfig,
  type AnalyzeFlowsOptions,
  type FlowMetrics,
  type AlertData,
  type Transaction,
  type TokenInfo
};

export default analyzeCoinFlows;