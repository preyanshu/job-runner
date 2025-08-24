# Emergency Job Management Endpoints

## 🚨 Clear All Running Jobs

### Endpoint: `DELETE /jobs/clear-all`

**Purpose**: Emergency stop all running jobs in the queue and database.

**What it does**:
- Stops all currently active (running) jobs
- Clears all waiting jobs from the queue
- Removes all delayed jobs
- Clears all repeating/recurring jobs
- Updates database to mark stopped jobs as failed
- Completely obliterates the BullMQ queue

**Use Cases**:
- Emergency system shutdown
- Clearing stuck jobs
- Resetting the entire job system
- Debugging queue issues

**Response Example**:
```json
{
  "success": true,
  "message": "All running jobs cleared successfully",
  "summary": {
    "waitingJobsCleared": 5,
    "activeJobsStopped": 2,
    "delayedJobsCleared": 3,
    "repeatingJobsCleared": 1,
    "databaseJobsUpdated": 6,
    "totalCleared": 11
  },
  "timestamp": "2025-08-24T21:05:47.000Z"
}
```

**⚠️ Warning**: This is a destructive operation that will stop ALL jobs immediately.

---

## 📊 Get Queue Status

### Endpoint: `GET /jobs/queue-status`

**Purpose**: Monitor the current state of the job queue.

**Response Example**:
```json
{
  "success": true,
  "queueStatus": {
    "waiting": 3,
    "active": 1,
    "delayed": 2,
    "repeating": 1,
    "failed": 5,
    "total": 12
  },
  "timestamp": "2025-08-24T21:05:47.000Z"
}
```

---

## 🔧 Usage Examples

### Clear All Jobs (cURL)
```bash
curl -X DELETE http://localhost:3000/jobs/clear-all
```

### Get Queue Status (cURL)
```bash
curl http://localhost:3000/jobs/queue-status
```

### Clear All Jobs (JavaScript)
```javascript
const response = await fetch('http://localhost:3000/jobs/clear-all', {
  method: 'DELETE'
});
const result = await response.json();
console.log('Jobs cleared:', result.summary);
```

---

## 🚨 Safety Considerations

1. **Backup**: Consider backing up job data before clearing
2. **Monitoring**: Use the queue status endpoint to verify the operation
3. **Recovery**: After clearing, you'll need to recreate any necessary jobs
4. **Database**: Jobs are marked as failed, not deleted from the database
5. **Queue**: The entire BullMQ queue is obliterated and will be empty after the operation

---

## 🔄 Recovery After Clear

After clearing all jobs, you may need to:

1. **Restart the job runner** to ensure clean state
2. **Recreate essential jobs** that were cleared
3. **Check database** for any jobs that need manual status updates
4. **Monitor logs** for any errors during the clear operation

---

## 📝 Logs

The clear operation logs extensively:
- 🚨 Emergency stop initiated
- 🗑️ Jobs cleared from different states
- ⏹️ Active jobs stopped
- ✅ Operation completed with summary
- ❌ Any errors encountered

Check the console/logs for detailed operation information. 