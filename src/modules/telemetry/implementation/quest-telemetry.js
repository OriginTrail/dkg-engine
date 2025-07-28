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
            droppedEvents: 0, // Track permanently dropped events
            proofEvents: 0,
            successfulProofEvents: 0,
            lastHealthCheck: Date.now(),
            connectionStatus: 'disconnected',
            startTime: Date.now() // Track when telemetry module started
        };
        
        // Detailed metrics (no logging spam)
        this.metrics = {
            eventsByType: new Map(),
            proofEventsByBlockchain: new Map(),
            finalizedProofsByBlockchain: new Map(), // Track PROOF_CHALANGE_FINALIZED per chain (lifetime)
            submittedProofsByBlockchain: new Map(), // Track PROOF_SUBMITTED per chain (lifetime)
            // Period tracking (resets every 3 minutes)
            periodFinalizedProofsByBlockchain: new Map(), // Track PROOF_CHALANGE_FINALIZED per chain (current period)
            periodSubmittedProofsByBlockchain: new Map(), // Track PROOF_SUBMITTED per chain (current period)
            recentProofEvents: [], // Last 50 proof events
            processedProofEvents: new Set(), // Track processed proof events to prevent duplicates
            lastProofEventTime: null,
            maxRecentEvents: 50,
            totalDroppedEvents: 0, // Lifetime counter
            erroredEvents: new Map(), // Track errored events by type
            erroredEventsByBlockchain: new Map() // Track errored events by blockchain
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
        
        // Count proof events in this batch
        const proofEvents = batchToSend.filter(event => {
            const name = event.name;
            return name && (
                name === 'PROOF_CHALANGE_FINALIZED' ||
                name === 'PROOF_SUBMITTED' ||
                name.includes('PROOF_') ||
                name.includes('proof_') ||
                (name.includes('proof') && (name.includes('submit') || name.includes('final') || name.includes('complete')))
            );
        });

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
            
            // Track successful proof events
            if (proofEvents.length > 0) {
                this.telemetryStats.successfulProofEvents += proofEvents.length;
            }
        } catch (err) {
            this.telemetryStats.failedEvents += batchToSend.length;
            this.telemetryStats.connectionStatus = 'error';
            this.logError(`Error sending batch of ${batchToSend.length} events to QuestDB: ${err.message}`);
            
            // Track errored events by type and blockchain
            batchToSend.forEach(event => {
                // Track by event type
                const typeCount = this.metrics.erroredEvents.get(event.name) || 0;
                this.metrics.erroredEvents.set(event.name, typeCount + 1);
                
                // Track by blockchain
                const blockchainKey = `${event.blockchainId}:${event.name}`;
                const blockchainCount = this.metrics.erroredEventsByBlockchain.get(blockchainKey) || 0;
                this.metrics.erroredEventsByBlockchain.set(blockchainKey, blockchainCount + 1);
            });
            
            // Log failed proof events (important to know)
            if (proofEvents.length > 0) {
                this.logger.error(`[TELEMETRY] Failed to send ${proofEvents.length} proof events: ${proofEvents.map(e => e.operationId).join(', ')}`);
            }
            
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
                
                // Track errored events by type and blockchain
                const typeCount = this.metrics.erroredEvents.get(event.name) || 0;
                this.metrics.erroredEvents.set(event.name, typeCount + 1);
                
                const blockchainKey = `${event.blockchainId}:${event.name}`;
                const blockchainCount = this.metrics.erroredEventsByBlockchain.get(blockchainKey) || 0;
                this.metrics.erroredEventsByBlockchain.set(blockchainKey, blockchainCount + 1);
                
                this.logError(`Fallback failed for event ${event.operationId}: ${error.message}`);
            }
        }
    }

    logHealthStatus() {
        const now = Date.now();
        const timeSinceLastCheck = now - this.telemetryStats.lastHealthCheck;
        
        // Calculate proper failed events (events that weren't successful or dropped)
        const actualFailedEvents = Math.max(0, this.telemetryStats.totalEvents - this.telemetryStats.successfulEvents - this.telemetryStats.droppedEvents);
        
        // Ensure success rate doesn't exceed 100%
        const maxSuccessfulEvents = Math.min(this.telemetryStats.successfulEvents, this.telemetryStats.totalEvents);
        const successRate = this.telemetryStats.totalEvents > 0 
            ? ((maxSuccessfulEvents / this.telemetryStats.totalEvents) * 100).toFixed(1)
            : 0;

        // Calculate batch status
        const batchStatus = this.eventBatch.length > 0 
            ? `Pending for next batch: ${this.eventBatch.length}/${this.batchSize}`
            : 'Batch: empty';
        
        // Calculate queue status
        const queueStatus = this.persistentEventQueue.length > 0
            ? `Queue: ${this.persistentEventQueue.length}/${this.maxPersistentQueueSize}`
            : 'Queue: empty';

        // Explain what happened to non-successful events
        let failureExplanation = '';
        const totalNonSuccessful = actualFailedEvents + this.telemetryStats.droppedEvents;
        if (totalNonSuccessful > 0) {
            const accountedEvents = this.eventBatch.length + this.persistentEventQueue.length;
            const unexplainedEvents = Math.max(0, actualFailedEvents - accountedEvents);
            
            let explanations = [];
            if (this.eventBatch.length > 0) {
                explanations.push(`${this.eventBatch.length} moved to next batch`);
            }
            if (this.persistentEventQueue.length > 0) {
                explanations.push(`${this.persistentEventQueue.length} queued for retry`);
            }
            if (this.telemetryStats.droppedEvents > 0) {
                explanations.push(`${this.telemetryStats.droppedEvents} DROPPED`);
            }
            if (unexplainedEvents > 0) {
                explanations.push(`${unexplainedEvents} in processing pipeline`);
            }
            
            if (explanations.length > 0) {
                failureExplanation = ` (${explanations.join(', ')})`;
            }
        }

        // Include lifetime dropped count if any
        const droppedInfo = this.metrics.totalDroppedEvents > 0 
            ? `, Lifetime dropped: ${this.metrics.totalDroppedEvents}`
            : '';

        // 1. TELEMETRY HEALTH - General system health without proofs
        this.logger.info(
            `[TELEMETRY HEALTH] Status: ${this.telemetryStats.connectionStatus}, ` +
            `Success Rate: ${successRate}%, ` +
            `Events: ${maxSuccessfulEvents}/${this.telemetryStats.totalEvents} successful, ` +
            `Failed: ${totalNonSuccessful}${failureExplanation}, ` +
            `${batchStatus}, ` +
            `${queueStatus}, ` +
            `Last Success: ${Math.round((now - this.lastSuccessfulSend) / 1000)}s ago, ` +
            `Period: ${Math.round(timeSinceLastCheck / 1000)}s${droppedInfo}`
        );

        // 2. TELEMETRY PROOFS - Proof event statistics
        this.logProofStatus();

        // Log error details immediately if there are actually tracked errors
        const totalTrackedErrors = Array.from(this.metrics.erroredEvents.values()).reduce((sum, count) => sum + count, 0);
        if (totalTrackedErrors > 0) {
            this.logErrorDetails();
        }

        // Log detailed metrics every 3rd health check (9 minutes)
        if (this.telemetryStats.lastHealthCheck > 0 && (Date.now() - this.telemetryStats.lastHealthCheck) > 0) {
            const healthCheckCount = Math.floor((now - this.telemetryStats.lastHealthCheck) / this.healthCheckInterval);
            if (healthCheckCount % 3 === 0) {
                this.logDetailedMetrics();
                
                // Log error details if any (backup in case not logged above)
                this.logErrorDetails();
            }
        }

        // Reset stats for next period
        this.telemetryStats.totalEvents = 0;
        this.telemetryStats.successfulEvents = 0;
        this.telemetryStats.failedEvents = 0;
        this.telemetryStats.droppedEvents = 0; // Reset period counter
        this.telemetryStats.proofEvents = 0;
        this.telemetryStats.successfulProofEvents = 0;
        this.telemetryStats.lastHealthCheck = now;
    }

    logProofStatus() {
        const finalizedTotal = Array.from(this.metrics.finalizedProofsByBlockchain.values()).reduce((sum, count) => sum + count, 0);
        const submittedTotal = Array.from(this.metrics.submittedProofsByBlockchain.values()).reduce((sum, count) => sum + count, 0);
        
        if (finalizedTotal > 0 || submittedTotal > 0) {
            // Finalized proofs per blockchain
            const finalizedByChain = Array.from(this.metrics.finalizedProofsByBlockchain.entries())
                .map(([chain, count]) => `${chain}:${count}`)
                .join(', ');

            // Submitted proofs per blockchain  
            const submittedByChain = Array.from(this.metrics.submittedProofsByBlockchain.entries())
                .map(([chain, count]) => `${chain}:${count}`)
                .join(', ');

            const timeSinceLastProof = this.metrics.lastProofEventTime 
                ? Math.round((Date.now() - this.metrics.lastProofEventTime) / 1000)
                : 'never';

            // Calculate telemetry uptime
            const uptimeMs = Date.now() - this.telemetryStats.startTime;
            const uptimeHours = (uptimeMs / (1000 * 60 * 60)).toFixed(1);
            const startTimeFormatted = new Date(this.telemetryStats.startTime).toLocaleString('en-US', { 
                month: '2-digit',
                day: '2-digit',
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
            });

            let proofLog = `[TELEMETRY PROOFS] Since telemetry/ot-node start ${startTimeFormatted} (${uptimeHours}h) - Events received and sent to QuestDB:`;
            
            if (finalizedByChain) {
                proofLog += ` PROOF_CHALANGE_FINALIZED: ${finalizedByChain}`;
            }
            
            if (submittedByChain) {
                proofLog += ` PROOF_SUBMITTED: ${submittedByChain}`;
            }
            
            proofLog += ` Last proof: ${timeSinceLastProof}s ago`;

            this.logger.info(proofLog);
        } else {
            // Calculate telemetry uptime for no events case
            const uptimeMs = Date.now() - this.telemetryStats.startTime;
            const uptimeHours = (uptimeMs / (1000 * 60 * 60)).toFixed(1);
            const startTimeFormatted = new Date(this.telemetryStats.startTime).toLocaleString('en-US', { 
                month: '2-digit',
                day: '2-digit',
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            this.logger.info(`[TELEMETRY PROOFS] Since telemetry/ot-node start ${startTimeFormatted} (${uptimeHours}h) - No proof events received from ot-node (telemetry waiting for proof events)`);
        }
        
        // Reset period counters for next 3-minute period
        this.metrics.periodFinalizedProofsByBlockchain.clear();
        this.metrics.periodSubmittedProofsByBlockchain.clear();
    }

    logDetailedMetrics() {
        const topEventTypes = Array.from(this.metrics.eventsByType.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([type, count]) => `${type}:${count}`)
            .join(', ');

        this.logger.info(`[TELEMETRY METRICS] Top events: ${topEventTypes || 'none'}`);
    }

    logErrorDetails() {
        const totalErroredEvents = Array.from(this.metrics.erroredEvents.values()).reduce((sum, count) => sum + count, 0);
        
        if (totalErroredEvents > 0) {
            // Top 5 errored event types
            const topErroredTypes = Array.from(this.metrics.erroredEvents.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([type, count]) => `${type}:${count}`)
                .join(', ');
            
            // Errored events by blockchain (proof events specifically)
            const erroredByBlockchain = Array.from(this.metrics.erroredEventsByBlockchain.entries())
                .filter(([key]) => key.includes('PROOF_'))
                .map(([key, count]) => `${key}:${count}`)
                .join(', ');
            
            // All errored events by blockchain for complete visibility
            const allErroredByBlockchain = Array.from(this.metrics.erroredEventsByBlockchain.entries())
                .slice(0, 10) // Limit to top 10 to avoid spam
                .map(([key, count]) => `${key}:${count}`)
                .join(', ');
            
            let errorLog = `[TELEMETRY ERRORS] Total errored: ${totalErroredEvents}, Top types: ${topErroredTypes}`;
            
            if (erroredByBlockchain) {
                errorLog += `, Proof errors: ${erroredByBlockchain}`;
            }
            
            if (allErroredByBlockchain) {
                errorLog += `, All errors by chain: ${allErroredByBlockchain}`;
            }
            
            this.logger.warn(errorLog);
        }
    }

    logLifetimeProofSummary() {
        // This method is no longer needed as we moved proof logging to logProofStatus()
        // Keep empty for now to avoid breaking existing timers
    }

    getMetricsSummary() {
        const topEventTypes = Array.from(this.metrics.eventsByType.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([type, count]) => `${type}:${count}`)
            .join(', ');

        // Finalized proofs per blockchain
        const finalizedByBlockchain = Array.from(this.metrics.finalizedProofsByBlockchain.entries())
            .map(([blockchain, count]) => `${blockchain}:${count}`)
            .join(', ');

        // Submitted proofs per blockchain  
        const submittedByBlockchain = Array.from(this.metrics.submittedProofsByBlockchain.entries())
            .map(([blockchain, count]) => `${blockchain}:${count}`)
            .join(', ');

        const timeSinceLastProof = this.metrics.lastProofEventTime 
            ? Math.round((Date.now() - this.metrics.lastProofEventTime) / 1000)
            : 'never';

        let summary = `Top events: ${topEventTypes || 'none'}`;
        
        if (finalizedByBlockchain) {
            summary += `, Finalized proofs: ${finalizedByBlockchain}`;
        }
        
        if (submittedByBlockchain) {
            summary += `, Submitted proofs: ${submittedByBlockchain}`;
        }
        
        summary += `, Last proof: ${timeSinceLastProof}s ago`;

        return summary;
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
                
                // Track dropped events
                this.telemetryStats.droppedEvents += droppedCount;
                this.metrics.totalDroppedEvents += droppedCount;
                this.logger.warn(`PERMANENTLY DROPPED ${droppedCount} events due to queue size limit (total dropped: ${this.metrics.totalDroppedEvents})`);
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
        
        // Track metrics silently
        this.trackEventMetrics(operationId, name, blockchainId, timestamp);
        
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
                } catch (error) {
                    this.telemetryStats.failedEvents++;
                    this.logger.warn(`Failed to send event during shutdown: ${error.message}`);
                }
            } else {
                this.telemetryStats.failedEvents++;
                this.logger.warn(`Dropping event during shutdown - no connection available`);
            }
            return;
        }

        // If QuestDB is down, queue event for later retry
        if (!this.localSender || this.isConnectionDown) {
            this.persistentEventQueue.push(event);
            
            // If memory queue is full, drop oldest events
            if (this.persistentEventQueue.length > this.maxPersistentQueueSize) {
                const droppedEvent = this.persistentEventQueue.shift();
                this.telemetryStats.droppedEvents++;
                this.metrics.totalDroppedEvents++;
                this.logger.warn(`PERMANENTLY DROPPED event ${droppedEvent.operationId} due to queue size limit (total dropped: ${this.metrics.totalDroppedEvents})`);
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

    trackEventMetrics(operationId, name, blockchainId, timestamp) {
        // Track event types
        const currentCount = this.metrics.eventsByType.get(name) || 0;
        this.metrics.eventsByType.set(name, currentCount + 1);
        
        // Track specific proof events
        const isProofEvent = name && (
            name === 'PROOF_CHALANGE_FINALIZED' ||
            name === 'PROOF_SUBMITTED' ||
            name.includes('PROOF_') ||
            name.includes('proof_') ||
            (name.includes('proof') && (name.includes('submit') || name.includes('final') || name.includes('complete')))
        );
        
        if (isProofEvent) {
            // Create unique identifier for this proof event
            const proofEventId = `${operationId}:${name}:${blockchainId}`;
            
            // Check if we've already processed this exact proof event
            if (this.metrics.processedProofEvents.has(proofEventId)) {
                return; // Skip processing this duplicate silently
            }
            
            // Mark this proof event as processed
            this.metrics.processedProofEvents.add(proofEventId);
            
            // Clean up old processed events to prevent memory leaks (keep last 1000)
            if (this.metrics.processedProofEvents.size > 1000) {
                const processedArray = Array.from(this.metrics.processedProofEvents);
                this.metrics.processedProofEvents.clear();
                // Keep the last 500 events
                processedArray.slice(-500).forEach(id => this.metrics.processedProofEvents.add(id));
            }
            
            this.telemetryStats.proofEvents++;
            this.metrics.lastProofEventTime = Date.now();
            
            // Track by blockchain (general)
            const blockchainCount = this.metrics.proofEventsByBlockchain.get(blockchainId) || 0;
            this.metrics.proofEventsByBlockchain.set(blockchainId, blockchainCount + 1);
            
            // Track specific proof types per blockchain
            if (name === 'PROOF_CHALANGE_FINALIZED') {
                // Update lifetime counter
                const finalizedCount = this.metrics.finalizedProofsByBlockchain.get(blockchainId) || 0;
                this.metrics.finalizedProofsByBlockchain.set(blockchainId, finalizedCount + 1);
                
                // Update period counter
                const periodFinalizedCount = this.metrics.periodFinalizedProofsByBlockchain.get(blockchainId) || 0;
                this.metrics.periodFinalizedProofsByBlockchain.set(blockchainId, periodFinalizedCount + 1);
                
                // Parse operation ID for clearer display
                const operationDetails = this.parseOperationId(operationId, blockchainId);
                const periodMinutes = Math.round(this.healthCheckInterval / (1000 * 60)); // 3 minutes
                const eventCount = periodFinalizedCount + 1;
                const eventText = eventCount === 1 ? 'event' : 'events';
                this.logger.info(`[TELEMETRY PROOFS] PROOF_CHALANGE_FINALIZED received from ot-node and emitted to QuestDB for ${blockchainId} ${operationDetails} - ${eventCount} ${eventText} received in last ${periodMinutes} minutes`);
            } else if (name === 'PROOF_SUBMITTED') {
                // Update lifetime counter
                const submittedCount = this.metrics.submittedProofsByBlockchain.get(blockchainId) || 0;
                this.metrics.submittedProofsByBlockchain.set(blockchainId, submittedCount + 1);
                
                // Update period counter
                const periodSubmittedCount = this.metrics.periodSubmittedProofsByBlockchain.get(blockchainId) || 0;
                this.metrics.periodSubmittedProofsByBlockchain.set(blockchainId, periodSubmittedCount + 1);
                
                // Parse operation ID for clearer display
                const operationDetails = this.parseOperationId(operationId, blockchainId);
                const periodMinutes = Math.round(this.healthCheckInterval / (1000 * 60)); // 3 minutes
                const eventCount = periodSubmittedCount + 1;
                const eventText = eventCount === 1 ? 'event' : 'events';
                this.logger.info(`[TELEMETRY PROOFS] PROOF_SUBMITTED received from ot-node and emitted to QuestDB for ${blockchainId} ${operationDetails} - ${eventCount} ${eventText} received in last ${periodMinutes} minutes`);
            }
            
            // Keep recent proof events (for debugging)
            this.metrics.recentProofEvents.push({
                operationId,
                name,
                blockchainId,
                timestamp: Date.now()
            });
            
            // Limit size
            if (this.metrics.recentProofEvents.length > this.metrics.maxRecentEvents) {
                this.metrics.recentProofEvents.shift();
            }
            
            // Log milestones for other proof events (every 10th)
            if (name !== 'PROOF_CHALANGE_FINALIZED' && name !== 'PROOF_SUBMITTED' && this.telemetryStats.proofEvents % 10 === 0) {
                this.logger.info(`[TELEMETRY PROOFS] Proof milestone: ${this.telemetryStats.proofEvents} proof events received (latest: ${operationId}:${name} on ${blockchainId})`);
            }
        }
    }

    parseOperationId(operationId, blockchainId) {
        // Operation ID format: ${blockchainId}-${epoch}-${activeProofPeriodStartBlock}
        // Example: base:8453-7-33325200
        try {
            // Remove the blockchain prefix to get the numbers
            const withoutBlockchain = operationId.replace(`${blockchainId}-`, '');
            const parts = withoutBlockchain.split('-');
            
            if (parts.length >= 2) {
                const epoch = parts[0];
                const block = parts[1];
                return `(epoch: ${epoch}, block: ${block})`;
            }
        } catch (error) {
            // Fallback if parsing fails
        }
        
        // Fallback to original format if parsing fails
        return `(operation: ${operationId})`;
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
