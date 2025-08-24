# Job Runner - Recurring Job System

A Node.js application that runs recurring jobs for blockchain analytics services using BullMQ, Redis, and MongoDB.

## 🏗️ Architecture

The system consists of three main services that can be executed as recurring jobs:

1. **Wallet Snapshot Service** (`src/services/run.ts`) - Creates comprehensive wallet snapshots
2. **Token Flow Analysis Service** (`src/services/token.ts`) - Analyzes coin/token transaction flows
3. **NFT Movement Analysis Service** (`src/services/nft.ts`) - Tracks NFT movements and patterns

## 🚀 Features

- **Recurring Jobs**: Jobs that run at specified intervals (e.g., every 15 minutes, every hour)
- **Scheduled Jobs**: One-time jobs scheduled for a specific date/time
- **Job Persistence**: All jobs are stored in MongoDB with status tracking
- **Queue Management**: BullMQ handles job queuing and execution
- **Worker System**: Background workers process jobs asynchronously
- **Error Handling**: Failed jobs are tracked and can be retried

## 📋 Job Types

### 1. Wallet Snapshot Jobs
- **Action**: `wallet_snapshot`
- **Purpose**: Create comprehensive snapshots of wallet balances, transactions, and holdings
- **Frequency**: Typically every 15-30 minutes for active wallets

### 2. Coin Flow Analysis Jobs
- **Action**: `analyze_coin_flows`
- **Purpose**: Analyze token transaction patterns, detect whale movements, and generate alerts
- **Frequency**: Typically every 30 minutes to 1 hour

### 3. NFT Movement Analysis Jobs
- **Action**: `analyze_nft_movements`
- **Purpose**: Track NFT transfers, detect suspicious patterns, and monitor collection activity
- **Frequency**: Typically every 1-2 hours

## 🛠️ Setup

### Prerequisites
- Node.js 16+
- Redis server
- MongoDB instance

### Installation
```bash
npm install
```

### Environment Configuration
Create a `.env` file with:
```env
REDIS_URL=redis://localhost:6379
MONGODB_URI=mongodb://localhost:27017/job-runner
PORT=3000
```

### Start Services
```bash
# Start Redis and MongoDB (if using Docker)
docker-compose up -d

# Start the application
npm start
```

## 📡 API Endpoints

### Create a Recurring Job
```bash
POST /jobs
```

**Request Body:**
```json
{
  "action": "wallet_snapshot",
  "payload": {
    "wallet": "0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6",
    "options": {
      "includeTransactions": true,
      "includeTokenBalances": true,
      "includeNFTs": true
    }
  },
  "type": "retry",
  "intervalMinutes": 15
}
```

### Create a Scheduled Job
```bash
POST /jobs
```

**Request Body:**
```json
{
  "action": "analyze_coin_flows",
  "payload": {
    "tokenAddress": "0x7fa7677c6708f0cd07724d61bfdc6be6bb15d2e7",
    "options": {
      "transactionLimit": 100,
      "includeAlerts": true
    }
  },
  "type": "scheduled",
  "scheduledAt": "2024-01-15T10:00:00.000Z"
}
```

### List All Jobs
```bash
GET /jobs
```

## 🔄 Job Lifecycle

1. **Creation**: Job is created via API and added to the queue
2. **Queuing**: Job waits in Redis queue until execution time
3. **Execution**: Worker picks up job and runs the appropriate service
4. **Completion**: Job status is updated in MongoDB
5. **Rescheduling**: For recurring jobs, next execution is scheduled

## 📊 Job Statuses

- `pending`: Job is created but not yet executed
- `running`: Job is currently being processed
- `completed`: Job completed successfully
- `failed`: Job failed with an error

## 🎯 Example Usage

### Running the Example Script
```bash
# Compile TypeScript
npx tsc

# Run the example script
node dist/examples/create-recurring-jobs.js
```

This will create:
- Wallet snapshot job running every 15 minutes
- Coin flow analysis job running every 30 minutes  
- NFT movement analysis job running every hour
- One scheduled wallet snapshot job (5 minutes from now)

### Monitoring Jobs
```bash
# Check job status
curl http://localhost:3000/jobs

# Monitor worker logs
# Jobs will show in your application console
```

## 🔧 Configuration

### Job Intervals
- **Wallet Snapshots**: 15-30 minutes (high frequency for active wallets)
- **Coin Analysis**: 30 minutes - 1 hour (medium frequency)
- **NFT Analysis**: 1-2 hours (lower frequency due to less frequent activity)

### Thresholds
Each service has configurable thresholds for alerts:
- Large transfer amounts
- Whale percentage thresholds
- Activity spike percentages
- Suspicious pattern detection

## 🚨 Error Handling

- Failed jobs are marked with `failed` status
- Error details are stored in the job record
- Jobs can be manually retried by updating their status
- Worker logs provide detailed execution information

## 🔍 Monitoring & Debugging

### Worker Logs
The worker provides detailed logging:
- ⚡ Job execution start
- 📊 Service-specific task execution
- ✅ Successful completion
- ❌ Error details
- 🔄 Recurring job rescheduling

### Database Queries
```javascript
// Find failed jobs
db.jobs.find({ status: "failed" })

// Find recurring jobs
db.jobs.find({ type: "retry" })

// Find jobs by action
db.jobs.find({ action: "wallet_snapshot" })
```

## 🚀 Scaling

- Multiple workers can be spawned for parallel job processing
- Redis cluster can be used for high availability
- MongoDB replica sets for data redundancy
- Load balancing across multiple application instances

## 📝 Development

### Adding New Services
1. Create service file in `src/services/`
2. Export main function
3. Add action case in `src/queue/workers.ts`
4. Update job creation examples

### Testing
```bash
# Run tests
npm test

# Test specific service
npm test -- --grep "wallet snapshot"
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Submit pull request

## 📄 License

MIT License - see LICENSE file for details 