/**
 * Helper function to clean up blockchain-specific intervals.
 *
 * Services like ProofingService and ClaimRewardsService store intervals
 * using a `${blockchainId}Interval` property pattern. This utility provides
 * a consistent way to clean up those intervals.
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.service - The service instance containing the intervals
 * @param {Object} options.blockchainModuleManager - The blockchain module manager
 * @param {Object} options.logger - The logger instance
 * @param {string} options.serviceName - Name of the service (for logging)
 * @param {string} options.logPrefix - Log prefix e.g., '[CLAIM]' or '[PROOFING]'
 */
function cleanupBlockchainIntervals({
    service,
    blockchainModuleManager,
    logger,
    serviceName,
    logPrefix,
}) {
    logger.info(`${logPrefix} Starting ${serviceName} cleanup`);

    for (const blockchainId of blockchainModuleManager.getImplementationNames()) {
        const intervalKey = `${blockchainId}Interval`;
        if (service[intervalKey]) {
            logger.debug(`${logPrefix} Clearing interval for blockchain ${blockchainId}`);
            clearInterval(service[intervalKey]);
            // eslint-disable-next-line no-param-reassign
            service[intervalKey] = null;
        }
    }

    logger.info(`${logPrefix} ${serviceName} cleanup completed`);
}

export default cleanupBlockchainIntervals;
