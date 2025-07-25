import { Sender } from '@questdb/nodejs-client';

class QuestTelemetry {
    constructor() {
        this.localSender = null;
        this.lastErrorLogTime = 0;
        this.errorLogInterval = 60000; // 1 minute between error logs
        this.retryAttempts = 0;
        this.maxRetryAttempts = 5;
        this.baseRetryDelay = 1000; // 1 second
        
        // Health monitoring
        this.healthCheckInterval = 3 * 60 * 1000; // 3 minutes
        this.healthCheckTimer = null;
        this.telemetryStats = {
            totalEvents: 0,
            successfulEvents: 0,
            failedEvents: 0,
            lastHealthCheck: Date.now(),
            connectionStatus: 'disconnected'
        };
        
        // Event batching
        this.batchSize = 50; // Send batch when 50 events collected
        this.maxBatchSize = 200; // Maximum batch size to prevent memory leaks
        this.batchTimeout = 5000; // Send batch after 5 seconds
        this.eventBatch = [];
        this.batchTimer = null;
        
        // Bulletproof features
        this.isShuttingDown = false;
        this.connectionHealthTimer = null;
        this.connectionHealthInterval = 30 * 1000; // 30 seconds
        this.lastSuccessfulSend = Date.now();
        this.maxTimeWithoutSuccess = 5 * 60 * 1000; // 5 minutes
        
        // Event persistence for when QuestDB is down
        this.persistentEventQueue = [];
        this.maxPersistentQueueSize = 10000; // Increased to 10,000 events
        this.isConnectionDown = false;
        this.retryQueueTimer = null;
        this.retryQueueInterval = 10 * 1000; // 10 seconds
    }

    async initialize(config, logger) {
        this.config = config;
        this.logger = logger;
        await this.createLocalSender();
        this.startHealthMonitoring();
        this.startBatchTimer();
        this.startConnectionHealthCheck();
        this.startRetryQueueTimer();
        
        // Graceful shutdown handling
        process.on('SIGINT', () => this.gracefulShutdown());
        process.on('SIGTERM', () => this.gracefulShutdown());
    }

    async gracefulShutdown() {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        
        this.logger.info('QuestDB telemetry graceful shutdown initiated');
        await this.cleanup();
    }

    async createLocalSender() {
        try {
            this.localSender = Sender.fromConfig(this.config.localEndpoint);
            this.retryAttempts = 0;
            this.telemetryStats.connectionStatus = 'connected';
            this.lastSuccessfulSend = Date.now();
            this.logger.debug('QuestDB local sender created successfully');
        } catch (error) {
            this.telemetryStats.connectionStatus = 'failed';
            this.logError(`Failed to create QuestDB local sender: ${error.message}`);
        }
    }

    startHealthMonitoring() {
        this.healthCheckTimer = setInterval(() => {
            this.logHealthStatus();
        }, this.healthCheckInterval);
        
        this.logger.info('QuestDB telemetry health monitoring started (every 3 minutes)');
    }

    startConnectionHealthCheck() {
        this.connectionHealthTimer = setInterval(() => {
            this.checkConnectionHealth();
        }, this.connectionHealthInterval);
        
        this.logger.info('QuestDB telemetry connection health check started (every 30 seconds)');
    }

    startRetryQueueTimer() {
        this.retryQueueTimer = setInterval(() => {
            this.retryPersistentEvents();
        }, this.retryQueueInterval);
        
        this.logger.info('QuestDB telemetry persistent event retry timer started (every 10 seconds)');
    }

    checkConnectionHealth() {
        const timeSinceLastSuccess = Date.now() - this.lastSuccessfulSend;
        
        if (timeSinceLastSuccess > this.maxTimeWithoutSuccess) {
            this.logger.warn(`No successful telemetry sends for ${Math.round(timeSinceLastSuccess / 1000)}s, recreating connection`);
            this.recreateConnection();
        }
    }

    async recreateConnection() {
        try {
            if (this.localSender) {
                await this.localSender.flush();
                await this.localSender.close();
            }
            await this.createLocalSender();
        } catch (error) {
            this.logError(`Failed to recreate QuestDB connection: ${error.message}`);
        }
    }

    startBatchTimer() {
        this.batchTimer = setInterval(() => {
            this.flushBatch();
        }, this.batchTimeout);
        
        this.logger.info(`QuestDB telemetry batching started (batch size: ${this.batchSize}, max: ${this.maxBatchSize}, timeout: ${this.batchTimeout}ms)`);
    }

    async flushBatch() {
        if (this.eventBatch.length === 0) {
            return;
        }

        const batchToSend = [...this.eventBatch];
        this.eventBatch = [];

        try {
            await this.retryWithBackoff(async () => {
                for (const event of batchToSend) {
                    const table = this.localSender.table('event');
                    
                    table.symbol('operationId', event.operationId || 'NULL');
                    table.symbol('blockchainId', event.blockchainId || 'NULL');
                    table.symbol('name', event.name || 'NULL');
                    if (event.value1 !== null) table.symbol('value1', event.value1);
                    if (event.value2 !== null) table.symbol('value2', event.value2);
                    if (event.value3 !== null) table.symbol('value3', event.value3);
                    table.timestampColumn('timestamp', event.timestamp * 1000);
                    
                    await table.at(Date.now(), 'ms');
                }
                
                await this.localSender.flush();
            });
            
            this.telemetryStats.successfulEvents += batchToSend.length;
            this.telemetryStats.connectionStatus = 'connected';
            this.lastSuccessfulSend = Date.now();
            
            this.logger.debug(`Successfully sent batch of ${batchToSend.length} events to QuestDB`);
        } catch (err) {
            this.telemetryStats.failedEvents += batchToSend.length;
            this.telemetryStats.connectionStatus = 'error';
            this.logError(`Error sending batch of ${batchToSend.length} events to QuestDB: ${err.message}`);
            
            // Fallback: try to send events individually
            await this.fallbackToIndividualEvents(batchToSend);
        }
    }

    async fallbackToIndividualEvents(events) {
        this.logger.warn(`Attempting fallback: sending ${events.length} events individually`);
        
        for (const event of events) {
            try {
                await this.retryWithBackoff(async () => {
                    const table = this.localSender.table('event');
                    
                    table.symbol('operationId', event.operationId || 'NULL');
                    table.symbol('blockchainId', event.blockchainId || 'NULL');
                    table.symbol('name', event.name || 'NULL');
                    if (event.value1 !== null) table.symbol('value1', event.value1);
                    if (event.value2 !== null) table.symbol('value2', event.value2);
                    if (event.value3 !== null) table.symbol('value3', event.value3);
                    table.timestampColumn('timestamp', event.timestamp * 1000);
                    
                    await table.at(Date.now(), 'ms');
                    await this.localSender.flush();
                });
                
                this.telemetryStats.successfulEvents++;
                this.lastSuccessfulSend = Date.now();
            } catch (error) {
                this.telemetryStats.failedEvents++;
                this.logError(`Fallback failed for event ${event.operationId}: ${error.message}`);
            }
        }
    }

    logHealthStatus() {
        const now = Date.now();
        const timeSinceLastCheck = now - this.telemetryStats.lastHealthCheck;
        const successRate = this.telemetryStats.totalEvents > 0 
            ? ((this.telemetryStats.successfulEvents / this.telemetryStats.totalEvents) * 100).toFixed(1)
            : 0;

        // Calculate batch status
        const batchStatus = this.eventBatch.length > 0 
            ? `Pending for next batch: ${this.eventBatch.length}/${this.batchSize}`
            : 'Batch: empty';
        
        // Calculate queue status
        const queueStatus = this.persistentEventQueue.length > 0
            ? `Queue: ${this.persistentEventQueue.length}/${this.maxPersistentQueueSize}`
            : 'Queue: empty';

        this.logger.info(
            `[TELEMETRY HEALTH] Status: ${this.telemetryStats.connectionStatus}, ` +
            `Success Rate: ${successRate}%, ` +
            `Events: ${this.telemetryStats.successfulEvents}/${this.telemetryStats.totalEvents} successful, ` +
            `Failed: ${this.telemetryStats.failedEvents}, ` +
            `${batchStatus}, ` +
            `${queueStatus}, ` +
            `Last Success: ${Math.round((now - this.lastSuccessfulSend) / 1000)}s ago, ` +
            `Period: ${Math.round(timeSinceLastCheck / 1000)}s`
        );

        // Reset stats for next period
        this.telemetryStats.totalEvents = 0;
        this.telemetryStats.successfulEvents = 0;
        this.telemetryStats.failedEvents = 0;
        this.telemetryStats.lastHealthCheck = now;
    }

    logError(message) {
        const now = Date.now();
        if (now - this.lastErrorLogTime > this.errorLogInterval) {
            this.logger.error(message);
            this.lastErrorLogTime = now;
        }
    }

    async retryWithBackoff(operation) {
        for (let attempt = 0; attempt < this.maxRetryAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                if (attempt === this.maxRetryAttempts - 1) {
                    throw error;
                }
                
                const delay = this.baseRetryDelay * Math.pow(2, attempt);
                this.logError(`QuestDB operation failed, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetryAttempts}): ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // Recreate sender on connection errors
                if (error.message.includes('ECONNRESET') || error.message.includes('connection')) {
                    this.telemetryStats.connectionStatus = 'reconnecting';
                    await this.createLocalSender();
                }
            }
        }
    }

    async retryPersistentEvents() {
        if (this.persistentEventQueue.length === 0 || !this.localSender) {
            return;
        }

        this.logger.info(`Attempting to retry ${this.persistentEventQueue.length} persistent events`);
        
        const eventsToRetry = [...this.persistentEventQueue];
        this.persistentEventQueue = [];

        try {
            await this.retryWithBackoff(async () => {
                for (const event of eventsToRetry) {
                    const table = this.localSender.table('event');
                    
                    table.symbol('operationId', event.operationId || 'NULL');
                    table.symbol('blockchainId', event.blockchainId || 'NULL');
                    table.symbol('name', event.name || 'NULL');
                    if (event.value1 !== null) table.symbol('value1', event.value1);
                    if (event.value2 !== null) table.symbol('value2', event.value2);
                    if (event.value3 !== null) table.symbol('value3', event.value3);
                    table.timestampColumn('timestamp', event.timestamp * 1000);
                    
                    await table.at(Date.now(), 'ms');
                }
                
                await this.localSender.flush();
            });
            
            this.telemetryStats.successfulEvents += eventsToRetry.length;
            this.telemetryStats.connectionStatus = 'connected';
            this.lastSuccessfulSend = Date.now();
            this.isConnectionDown = false;
            
            this.logger.info(`Successfully retried ${eventsToRetry.length} persistent events to QuestDB`);
        } catch (err) {
            // Put events back in queue for next retry
            this.persistentEventQueue.unshift(...eventsToRetry);
            
            // If queue gets too large, drop oldest events
            if (this.persistentEventQueue.length > this.maxPersistentQueueSize) {
                const droppedCount = this.persistentEventQueue.length - this.maxPersistentQueueSize;
                this.persistentEventQueue = this.persistentEventQueue.slice(0, this.maxPersistentQueueSize);
                this.telemetryStats.failedEvents += droppedCount;
                this.logger.warn(`Dropped ${droppedCount} events due to queue size limit`);
            }
            
            this.telemetryStats.connectionStatus = 'error';
            this.isConnectionDown = true;
            this.logError(`Failed to retry persistent events: ${err.message}`);
        }
    }

    listenOnEvents(eventEmitter, onEventReceived) {
        return eventEmitter.on('operation_status_changed', onEventReceived);
    }

    async sendTelemetryData(
        operationId,
        timestamp,
        blockchainId = '',
        name = '',
        value1 = null,
        value2 = null,
        value3 = null,
    ) {
        this.telemetryStats.totalEvents++;
        
        const event = {
            operationId,
            timestamp,
            blockchainId,
            name,
            value1,
            value2,
            value3
        };

        // If shutting down, try to send immediately instead of dropping
        if (this.isShuttingDown) {
            if (this.localSender && !this.isConnectionDown) {
                try {
                    const table = this.localSender.table('event');
                    
                    table.symbol('operationId', event.operationId || 'NULL');
                    table.symbol('blockchainId', event.blockchainId || 'NULL');
                    table.symbol('name', event.name || 'NULL');
                    if (event.value1 !== null) table.symbol('value1', event.value1);
                    if (event.value2 !== null) table.symbol('value2', event.value2);
                    if (event.value3 !== null) table.symbol('value3', event.value3);
                    table.timestampColumn('timestamp', event.timestamp * 1000);
                    
                    await table.at(Date.now(), 'ms');
                    await this.localSender.flush();
                    
                    this.telemetryStats.successfulEvents++;
                    this.logger.debug(`Sent event ${event.operationId} during shutdown`);
                } catch (error) {
                    this.telemetryStats.failedEvents++;
                    this.logger.warn(`Failed to send event ${event.operationId} during shutdown: ${error.message}`);
                }
            } else {
                this.telemetryStats.failedEvents++;
                this.logger.warn(`Dropping event ${event.operationId} during shutdown - no connection available`);
            }
            return;
        }

        // If QuestDB is down, queue event for later retry
        if (!this.localSender || this.isConnectionDown) {
            this.persistentEventQueue.push(event);
            
            // If memory queue is full, drop oldest events
            if (this.persistentEventQueue.length > this.maxPersistentQueueSize) {
                const droppedEvent = this.persistentEventQueue.shift();
                this.telemetryStats.failedEvents++;
                this.logger.warn(`Dropped event ${droppedEvent.operationId} due to queue size limit`);
            }
            
            this.telemetryStats.connectionStatus = 'disconnected';
            this.isConnectionDown = true;
            this.logError('QuestDB local sender not available, event queued for retry');
            return;
        }

        // Add event to batch
        this.eventBatch.push(event);

        // Prevent memory leaks: force flush if batch gets too large
        if (this.eventBatch.length >= this.maxBatchSize) {
            this.logger.warn(`Batch size limit reached (${this.maxBatchSize}), forcing flush`);
            await this.flushBatch();
        }
        // Send batch if it's full
        else if (this.eventBatch.length >= this.batchSize) {
            await this.flushBatch();
        }
    }

    async cleanup() {
        try {
            this.isShuttingDown = true;
            
            if (this.healthCheckTimer) {
                clearInterval(this.healthCheckTimer);
                this.healthCheckTimer = null;
            }
            
            if (this.batchTimer) {
                clearInterval(this.batchTimer);
                this.batchTimer = null;
            }
            
            if (this.connectionHealthTimer) {
                clearInterval(this.connectionHealthTimer);
                this.connectionHealthTimer = null;
            }
            
            if (this.retryQueueTimer) {
                clearInterval(this.retryQueueTimer);
                this.retryQueueTimer = null;
            }
            
            // Flush any remaining events in batch
            if (this.eventBatch.length > 0) {
                this.logger.info(`Flushing final batch of ${this.eventBatch.length} events before shutdown`);
                await this.flushBatch();
            }
            
            // Flush any persistent events
            if (this.persistentEventQueue.length > 0) {
                this.logger.info(`Flushing final persistent queue of ${this.persistentEventQueue.length} events before shutdown`);
                await this.retryPersistentEvents();
                
                // Log any remaining events that couldn't be sent
                if (this.persistentEventQueue.length > 0) {
                    this.logger.warn(`Could not send ${this.persistentEventQueue.length} events before shutdown`);
                }
            }
            
            if (this.localSender) {
                await this.localSender.flush();
                await this.localSender.close();
                this.localSender = null;
            }
            
            this.logger.info('QuestDB telemetry cleanup completed');
        } catch (error) {
            this.logger.error(`Error during QuestDB telemetry cleanup: ${error.message}`);
        }
    }
}

export default QuestTelemetry;
