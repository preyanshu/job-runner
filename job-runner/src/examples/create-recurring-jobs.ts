import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

// Example function to create recurring jobs
async function createRecurringJobs() {
  try {
    console.log('🚀 Creating recurring jobs for all services...\n');

    // 1. Create recurring wallet snapshot job (runs every 15 minutes)
    const walletSnapshotJob = await axios.post(`${API_BASE_URL}/jobs`, {
      action: 'wallet_snapshot',
      payload: {
        wallet: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        options: {
          includeTransactions: true,
          includeTokenBalances: true,
          includeNFTs: true
        }
      },
      type: 'retry',
      intervalMinutes: 15
    });
    console.log('✅ Wallet snapshot job created:', walletSnapshotJob.data.job._id);

    // 2. Create recurring coin flow analysis job (runs every 30 minutes)
    const coinFlowJob = await axios.post(`${API_BASE_URL}/jobs`, {
      action: 'analyze_coin_flows',
      payload: {
        tokenAddress: '0x7fa7677c6708f0cd07724d61bfdc6be6bb15d2e7', // ASTRO token
        options: {
          transactionLimit: 100,
          includeAlerts: true,
          thresholdConfig: {
            largeTransfer: 10000, // $10k
            whalePercentage: 5,   // 5% of supply
            volumeSpike: 200      // 200% increase
          }
        }
      },
      type: 'retry',
      intervalMinutes: 30
    });
    console.log('✅ Coin flow analysis job created:', coinFlowJob.data.job._id);

    // 3. Create recurring NFT movement analysis job (runs every hour)
    const nftMovementJob = await axios.post(`${API_BASE_URL}/jobs`, {
      action: 'analyze_nft_movements',
      payload: {
        collectionAddress: '0x1234567890123456789012345678901234567890', // Example NFT collection
        options: {
          transactionLimit: 50,
          includeAlerts: true,
          thresholdConfig: {
            massTransfer: 10,     // 10+ NFTs moved at once
            whaleAccumulation: 100, // 100+ NFTs accumulated
            activitySpike: 300    // 300% increase in activity
          }
        }
      },
      type: 'retry',
      intervalMinutes: 60
    });
    console.log('✅ NFT movement analysis job created:', nftMovementJob.data.job._id);

    console.log('\n🎉 All recurring jobs created successfully!');
    console.log('\n📋 Job Summary:');
    console.log('- Wallet snapshots: Every 15 minutes');
    console.log('- Coin flow analysis: Every 30 minutes');
    console.log('- NFT movement analysis: Every hour');

  } catch (error: any) {
    console.error('❌ Error creating recurring jobs:', error.response?.data || error.message);
  }
}

// Example function to create a scheduled one-time job
async function createScheduledJob() {
  try {
    console.log('\n⏰ Creating a scheduled one-time job...');

    const scheduledJob = await axios.post(`${API_BASE_URL}/jobs`, {
      action: 'wallet_snapshot',
      payload: {
        wallet: '0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6',
        options: {
          includeTransactions: true,
          includeTokenBalances: true
        }
      },
      type: 'scheduled',
      scheduledAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes from now
    });

    console.log('✅ Scheduled job created:', scheduledJob.data.job._id);
    console.log('⏰ Will run at:', new Date(scheduledJob.data.job.scheduledAt));

  } catch (error: any) {
    console.error('❌ Error creating scheduled job:', error.response?.data || error.message);
  }
}

// Example function to list all jobs
async function listJobs() {
  try {
    console.log('\n📋 Listing all jobs...');
    const response = await axios.get(`${API_BASE_URL}/jobs`);
    const jobs = response.data;
    
    console.log(`Found ${jobs.length} jobs:`);
    jobs.forEach((job: any) => {
      console.log(`- ID: ${job._id}`);
      console.log(`  Action: ${job.action}`);
      console.log(`  Type: ${job.type}`);
      console.log(`  Status: ${job.status}`);
      if (job.type === 'retry') {
        console.log(`  Interval: ${job.intervalMinutes} minutes`);
      }
      if (job.type === 'scheduled') {
        console.log(`  Scheduled for: ${new Date(job.scheduledAt)}`);
      }
      console.log(`  Created: ${new Date(job.createdAt)}`);
      console.log('');
    });

  } catch (error: any) {
    console.error('❌ Error listing jobs:', error.response?.data || error.message);
  }
}

// Main execution
async function main() {
  console.log('🎯 Job Runner - Recurring Job Examples\n');
  
  await createRecurringJobs();
  await createScheduledJob();
  await listJobs();
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { createRecurringJobs, createScheduledJob, listJobs }; 