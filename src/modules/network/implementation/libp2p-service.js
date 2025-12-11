import appRootPath from 'app-root-path';
import libp2p from 'libp2p';
import KadDHT from 'libp2p-kad-dht';
import { join } from 'path';
import Bootstrap, { tag } from 'libp2p-bootstrap';
import { NOISE } from 'libp2p-noise';
import MPLEX from 'libp2p-mplex';
import TCP from 'libp2p-tcp';
import pipe from 'it-pipe';
import map from 'it-map';
import { encode, decode } from 'it-length-prefixed';
import { create as _create, createFromPrivKey, createFromB58String } from 'peer-id';
import { InMemoryRateLimiter } from 'rolling-rate-limiter';
import toobusy from 'toobusy-js';
import { mkdir, writeFile, readFile, stat } from 'fs/promises';
import ip from 'ip';
import { TimeoutController } from 'timeout-abort-controller';
import {
    NETWORK_API_RATE_LIMIT,
    NETWORK_API_SPAM_DETECTION,
    NETWORK_MESSAGE_TYPES,
    NETWORK_API_BLACK_LIST_TIME_WINDOW_MINUTES,
    LIBP2P_KEY_DIRECTORY,
    LIBP2P_KEY_FILENAME,
    NODE_ENVIRONMENTS,
    BYTES_IN_MEGABYTE,
} from '../../../constants/constants.js';

const devEnvironment =
    process.env.NODE_ENV === NODE_ENVIRONMENTS.DEVELOPMENT ||
    process.env.NODE_ENV === NODE_ENVIRONMENTS.TEST;

const initializationObject = {
    addresses: {
        listen: ['/ip4/0.0.0.0/tcp/9000'],
    },
    modules: {
        transport: [TCP],
        streamMuxer: [MPLEX],
        connEncryption: [NOISE],
        dht: KadDHT,
    },
};

class Libp2pService {
    async initialize(config, logger) {
        this.config = config;
        this.logger = logger;

        initializationObject.peerRouting = this.config.peerRouting;

        const externalIp =
            ip.isV4Format(this.config.nat.externalIp) && ip.isPublic(this.config.nat.externalIp)
                ? this.config.nat.externalIp
                : undefined;

        if (this.config.nat.externalIp != null && externalIp == null) {
            this.logger.warn(
                `Invalid external ip defined in configuration: ${this.config.nat.externalIp}. External ip must be in V4 format, and public.`,
            );
        }

        initializationObject.config = {
            dht: {
                enabled: true,
                ...this.config.dht,
            },
            nat: {
                ...this.config.nat,
                externalIp,
            },
        };
        initializationObject.dialer = this.config.connectionManager;

        if (this.config.bootstrap.length > 0) {
            initializationObject.modules.peerDiscovery = [Bootstrap];
            initializationObject.config.peerDiscovery = {
                autoDial: true,
                [tag]: {
                    enabled: true,
                    list: this.config.bootstrap,
                },
            };
        }
        initializationObject.addresses = {
            listen: [`/ip4/0.0.0.0/tcp/${this.config.port}`],
            announce: externalIp ? [`/ip4/${externalIp}/tcp/${this.config.port}`] : [],
        };
        let id;
        if (!this.config.peerId) {
            if (!devEnvironment || !this.config.privateKey) {
                this.config.privateKey = await this.readPrivateKeyFromFile();
            }

            if (!this.config.privateKey) {
                id = await _create({ bits: 1024, keyType: 'RSA' });
                this.config.privateKey = id.toJSON().privKey;
                await this.savePrivateKeyInFile(this.config.privateKey);
            } else {
                id = await createFromPrivKey(this.config.privateKey);
            }
            this.config.peerId = id;
        }

        initializationObject.peerId = this.config.peerId;
        this._initializeRateLimiters();
        this.sessions = {};
        this.node = await libp2p.create(initializationObject);
        const peerId = this.node.peerId.toB58String();
        this.config.id = peerId;
    }

    async start() {
        await this.node.start();
        const port = parseInt(this.node.multiaddrs.toString().split('/')[4], 10);
        this.logger.info(`Network ID is ${this.config.id}, connection port is ${port}`);
    }

    async onPeerConnected(listener) {
        this.node.connectionManager.on('peer:connect', listener);
    }

    async savePrivateKeyInFile(privateKey) {
        const { fullPath, directoryPath } = this.getKeyPath();
        await mkdir(directoryPath, { recursive: true });
        await writeFile(fullPath, privateKey);
    }

    getKeyPath() {
        let directoryPath;
        if (!devEnvironment) {
            directoryPath = join(
                appRootPath.path,
                '..',
                this.config.appDataPath,
                LIBP2P_KEY_DIRECTORY,
            );
        } else {
            directoryPath = join(appRootPath.path, this.config.appDataPath, LIBP2P_KEY_DIRECTORY);
        }

        const fullPath = join(directoryPath, LIBP2P_KEY_FILENAME);
        return { fullPath, directoryPath };
    }

    async readPrivateKeyFromFile() {
        const keyPath = this.getKeyPath();
        if (await this.fileExists(keyPath.fullPath)) {
            const key = (await readFile(keyPath.fullPath)).toString();
            return key;
        }
    }

    async fileExists(filePath) {
        try {
            await stat(filePath);
            return true;
        } catch (e) {
            return false;
        }
    }

    _initializeRateLimiters() {
        const basicRateLimiter = new InMemoryRateLimiter({
            interval: NETWORK_API_RATE_LIMIT.TIME_WINDOW_MILLS,
            maxInInterval: NETWORK_API_RATE_LIMIT.MAX_NUMBER,
        });

        const spamDetection = new InMemoryRateLimiter({
            interval: NETWORK_API_SPAM_DETECTION.TIME_WINDOW_MILLS,
            maxInInterval: NETWORK_API_SPAM_DETECTION.MAX_NUMBER,
        });

        this.rateLimiter = {
            basicRateLimiter,
            spamDetection,
        };

        this.blackList = {};
    }

    getMultiaddrs() {
        return this.node.multiaddrs;
    }

    getProtocols(peerIdObject) {
        return this.node.peerStore.protoBook.get(peerIdObject);
    }

    getAddresses(peerIdObject) {
        return this.node.peerStore.addressBook.get(peerIdObject);
    }

    getPeers() {
        return this.node.connectionManager.connections;
    }

    getPeerId() {
        return this.node.peerId;
    }

    handleMessage(protocol, handler) {
        this.logger.info(`Enabling network protocol: ${protocol}`);

        this.node.handle(protocol, async (handlerProps) => {
            const { stream } = handlerProps;
            const peerIdString = handlerProps.connection.remotePeer.toB58String();
            const handleStartTime = Date.now();

            this.logger.debug(
                `[libp2p-debug] Incoming connection from peer: ${peerIdString}, protocol: ${protocol}, awaiting message...`,
            );

            const { message, valid, busy } = await this._readMessageFromStream(
                stream,
                this.isRequestValid.bind(this),
                peerIdString,
            );

            const readDuration = Date.now() - handleStartTime;
            this.logger.debug(
                `[libp2p-debug] Message read complete from peer: ${peerIdString}, protocol: ${protocol}, operationId: ${message.header.operationId}, valid: ${valid}, busy: ${busy}, read duration: ${readDuration}ms`,
            );

            this.updateSessionStream(message.header.operationId, peerIdString, stream);

            if (!valid) {
                this.logger.warn(
                    `[libp2p-debug] Sending NACK for invalid message from peer: ${peerIdString}, protocol: ${protocol}, operationId: ${message.header.operationId}`,
                );
                await this.sendMessageResponse(
                    protocol,
                    peerIdString,
                    NETWORK_MESSAGE_TYPES.RESPONSES.NACK,
                    message.header.operationId,
                    { errorMessage: 'Invalid request message' },
                );
                this.removeCachedSession(message.header.operationId, peerIdString);
            } else if (busy) {
                this.logger.warn(
                    `[libp2p-debug] Sending BUSY response to peer: ${peerIdString}, protocol: ${protocol}, operationId: ${message.header.operationId}`,
                );
                await this.sendMessageResponse(
                    protocol,
                    peerIdString,
                    NETWORK_MESSAGE_TYPES.RESPONSES.BUSY,
                    message.header.operationId,
                    {},
                );
                this.removeCachedSession(message.header.operationId, peerIdString);
            } else {
                // Extract identifiers for logging
                const { blockchain, contract, tokenId, datasetRoot } = message.data || {};
                const ual =
                    blockchain && contract && tokenId
                        ? `did:dkg:${blockchain}/${contract}/${tokenId}`
                        : 'N/A';

                this.logger.debug(
                    `Receiving message from ${peerIdString} to ${this.config.id}: protocol: ${protocol}, messageType: ${message.header.messageType}, operationId: ${message.header.operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}`,
                );

                // Log dataset presence before passing to handler
                if (message.data?.dataset !== undefined) {
                    const datasetSize = JSON.stringify(message.data.dataset).length;
                    this.logger.debug(
                        `[libp2p-debug] Passing message with dataset to handler. Peer: ${peerIdString}, operationId: ${message.header.operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, dataset size: ${datasetSize} bytes`,
                    );
                }

                await handler(message, peerIdString);
            }
        });
    }

    updateSessionStream(operationId, peerIdString, stream) {
        this.logger.trace(
            `Storing new session stream for remotePeerId: ${peerIdString} with operation id: ${operationId}`,
        );
        if (!this.sessions[peerIdString]) {
            this.sessions[peerIdString] = {
                [operationId]: {
                    stream,
                },
            };
        } else if (!this.sessions[peerIdString][operationId]) {
            this.sessions[peerIdString][operationId] = {
                stream,
            };
        } else {
            this.sessions[peerIdString][operationId] = {
                stream,
            };
        }
    }

    getSessionStream(operationId, peerIdString) {
        if (this.sessions[peerIdString] && this.sessions[peerIdString][operationId]) {
            this.logger.trace(
                `Session found remotePeerId: ${peerIdString}, operation id: ${operationId}`,
            );
            return this.sessions[peerIdString][operationId].stream;
        }
        return null;
    }

    createStreamMessage(message, operationId, messageType) {
        return {
            header: {
                messageType,
                operationId,
            },
            data: message,
        };
    }

    async sendMessage(protocol, peerIdString, messageType, operationId, message, timeout) {
        const nackMessage = {
            header: { messageType: NETWORK_MESSAGE_TYPES.RESPONSES.NACK },
            data: {
                errorMessage: '',
            },
        };

        const peerIdObject = createFromB58String(peerIdString);

        const publicIp = (this.getAddresses(peerIdObject) ?? [])
            .map((addr) => addr.multiaddr)
            .filter((addr) => addr.isThinWaistAddress())
            .map((addr) => addr.toString().split('/'))
            .filter((splittedAddr) => !ip.isPrivate(splittedAddr[2]))[0]?.[2];

        this.logger.trace(
            `Dialing remotePeerId: ${peerIdString} with public ip: ${publicIp}: protocol: ${protocol}, messageType: ${messageType} , operationId: ${operationId}`,
        );
        let dialResult;
        let dialStart;
        let dialEnd;
        try {
            dialStart = Date.now();
            dialResult = await this.node.dialProtocol(peerIdObject, protocol);
            dialEnd = Date.now();
        } catch (error) {
            dialEnd = Date.now();
            nackMessage.data.errorMessage = `Unable to dial peer: ${peerIdString}. protocol: ${protocol}, messageType: ${messageType} , operationId: ${operationId}, dial execution time: ${
                dialEnd - dialStart
            } ms. Error: ${error.message}`;

            return nackMessage;
        }
        this.logger.trace(
            `Created stream for peer: ${peerIdString}. protocol: ${protocol}, messageType: ${messageType} , operationId: ${operationId}, dial execution time: ${
                dialEnd - dialStart
            } ms.`,
        );

        const { stream } = dialResult;

        this.updateSessionStream(operationId, peerIdString, stream);

        const streamMessage = this.createStreamMessage(message, operationId, messageType);

        this.logger.trace(
            `Sending message to ${peerIdString}. protocol: ${protocol}, messageType: ${messageType}, operationId: ${operationId}`,
        );

        let sendMessageStart;
        let sendMessageEnd;
        try {
            sendMessageStart = Date.now();
            await this._sendMessageToStream(stream, streamMessage);
            sendMessageEnd = Date.now();
        } catch (error) {
            sendMessageEnd = Date.now();
            nackMessage.data.errorMessage = `Unable to send message to peer: ${peerIdString}. protocol: ${protocol}, messageType: ${messageType}, operationId: ${operationId}, execution time: ${
                sendMessageEnd - sendMessageStart
            } ms. Error: ${error.message}`;

            return nackMessage;
        }

        let readResponseStart;
        let readResponseEnd;
        let response;
        const abortSignalEventListener = async () => {
            stream.abort();
            response = null;
        };
        const timeoutController = new TimeoutController(timeout);
        try {
            readResponseStart = Date.now();

            timeoutController.signal.addEventListener('abort', abortSignalEventListener, {
                once: true,
            });

            response = await this._readMessageFromStream(
                stream,
                this.isResponseValid.bind(this),
                peerIdString,
            );

            if (timeoutController.signal.aborted) {
                throw Error('Message timed out!');
            }

            timeoutController.signal.removeEventListener('abort', abortSignalEventListener);
            timeoutController.clear();

            readResponseEnd = Date.now();
        } catch (error) {
            timeoutController.signal.removeEventListener('abort', abortSignalEventListener);
            timeoutController.clear();

            readResponseEnd = Date.now();
            nackMessage.data.errorMessage = `Unable to read response from peer ${peerIdString}. protocol: ${protocol}, messageType: ${messageType} , operationId: ${operationId}, execution time: ${
                readResponseEnd - readResponseStart
            } ms. Error: ${error.message}`;

            return nackMessage;
        }

        this.logger.trace(
            `Receiving response from ${peerIdString}. protocol: ${protocol}, messageType: ${
                response.message?.header?.messageType
            }, operationId: ${operationId}, execution time: ${
                readResponseEnd - readResponseStart
            } ms.`,
        );

        if (!response.valid) {
            nackMessage.data.errorMessage = 'Invalid response';

            return nackMessage;
        }

        return response.message;
    }

    async sendMessageResponse(protocol, peerIdString, messageType, operationId, message) {
        this.logger.debug(
            `Sending response from ${this.config.id} to ${peerIdString}: protocol: ${protocol}, messageType: ${messageType};`,
        );
        const stream = this.getSessionStream(operationId, peerIdString);

        if (!stream) {
            throw Error(`Unable to find opened stream for remotePeerId: ${peerIdString}`);
        }

        const response = this.createStreamMessage(message, operationId, messageType);

        await this._sendMessageToStream(stream, response);
    }

    async _sendMessageToStream(stream, message) {
        const sendStartTime = Date.now();
        const stringifiedHeader = JSON.stringify(message.header);
        const stringifiedData = JSON.stringify(message.data);

        // Extract identifiers for logging
        const { blockchain, contract, tokenId, datasetRoot } = message.data || {};
        const ual =
            blockchain && contract && tokenId
                ? `did:dkg:${blockchain}/${contract}/${tokenId}`
                : 'N/A';

        this.logger.debug(
            `[libp2p-debug] Preparing to send message. OperationId: ${message.header.operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, messageType: ${message.header.messageType}, header size: ${stringifiedHeader.length} bytes, data size: ${stringifiedData.length} bytes`,
        );

        // Log data structure being sent
        if (message.data?.dataset !== undefined) {
            const datasetSize = JSON.stringify(message.data.dataset).length;
            const datasetType = typeof message.data.dataset;
            const isArray = Array.isArray(message.data.dataset);
            this.logger.debug(
                `[libp2p-debug] Sending dataset. OperationId: ${
                    message.header.operationId
                }, UAL: ${ual}, datasetRoot: ${datasetRoot}, dataset size: ${datasetSize} bytes, type: ${datasetType}, isArray: ${isArray}, length: ${
                    isArray ? message.data.dataset.length : 'N/A'
                }`,
            );
        }

        const chunks = [stringifiedHeader];
        const chunkSize = BYTES_IN_MEGABYTE; // 1 MB

        // split data into 1 MB chunks
        for (let i = 0; i < stringifiedData.length; i += chunkSize) {
            chunks.push(stringifiedData.slice(i, i + chunkSize));
        }

        this.logger.debug(
            `[libp2p-debug] Sending message in ${chunks.length} chunks (1 header + ${
                chunks.length - 1
            } data chunks). OperationId: ${
                message.header.operationId
            }, UAL: ${ual}, datasetRoot: ${datasetRoot}`,
        );

        try {
            await pipe(
                chunks,
                // turn strings into buffers
                (source) => map(source, (string) => Buffer.from(string)),
                // Encode with length prefix (so receiving side knows how much data is coming)
                encode(),
                // Write to the stream (the sink)
                stream.sink,
            );

            const sendDuration = Date.now() - sendStartTime;
            this.logger.debug(
                `[libp2p-debug] Message sent successfully. OperationId: ${
                    message.header.operationId
                }, UAL: ${ual}, datasetRoot: ${datasetRoot}, duration: ${sendDuration}ms, total bytes: ${
                    stringifiedHeader.length + stringifiedData.length
                }`,
            );
        } catch (error) {
            this.logger.error(
                `[libp2p-debug] Failed to send message to stream. OperationId: ${message.header.operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, error: ${error.message}`,
            );
            throw error;
        }
    }

    async _readMessageFromStream(stream, isMessageValid, peerIdString) {
        return pipe(
            // Read from the stream (the source)
            stream.source,
            // Decode length-prefixed data
            decode(),
            // Turn buffers into strings
            (source) => map(source, (buf) => buf.toString()),
            // Sink function
            (source) => this.readMessageSink(source, isMessageValid, peerIdString),
        );
    }

    async readMessageSink(source, isMessageValid, peerIdString) {
        const message = { header: { operationId: '' }, data: {} };
        const readStartTime = Date.now();

        // we expect first buffer to be header
        const stringifiedHeader = (await source.next()).value;

        this.logger.debug(
            `[libp2p-debug] Reading message from peer: ${peerIdString}, header raw length: ${
                stringifiedHeader?.length ?? 0
            } bytes`,
        );

        if (!stringifiedHeader?.length) {
            this.logger.warn(
                `[libp2p-debug] Empty or missing header from peer: ${peerIdString}. Raw value: ${JSON.stringify(
                    stringifiedHeader,
                )}`,
            );
            return { message, valid: false, busy: false };
        }

        try {
            message.header = JSON.parse(stringifiedHeader);
            this.logger.debug(
                `[libp2p-debug] Parsed header from peer: ${peerIdString}, operationId: ${message.header.operationId}, messageType: ${message.header.messageType}`,
            );
        } catch (error) {
            this.logger.error(
                `[libp2p-debug] Failed to parse header JSON from peer: ${peerIdString}. Error: ${
                    error.message
                }. Raw header (first 500 chars): ${stringifiedHeader?.substring(0, 500)}`,
            );
            // Return the same format as invalid request case
            return { message, valid: false, busy: false };
        }

        // validate request / response
        if (!(await isMessageValid(message.header, peerIdString))) {
            this.logger.warn(
                `[libp2p-debug] Message validation failed from peer: ${peerIdString}, operationId: ${message.header.operationId}, messageType: ${message.header.messageType}`,
            );
            return { message, valid: false };
        }

        // business check if PROTOCOL_INIT message
        if (
            message.header.messageType === NETWORK_MESSAGE_TYPES.REQUESTS.PROTOCOL_INIT &&
            this.isBusy()
        ) {
            this.logger.debug(
                `[libp2p-debug] Node is busy, returning busy response for peer: ${peerIdString}, operationId: ${message.header.operationId}`,
            );
            return { message, valid: true, busy: true };
        }

        let stringifiedData = '';
        let chunkCount = 0;
        let totalBytesReceived = 0;
        // read data the data

        try {
            for await (const chunk of source) {
                chunkCount += 1;
                const chunkLength = chunk?.length ?? 0;
                totalBytesReceived += chunkLength;
                this.logger.trace(
                    `[libp2p-debug] Received chunk ${chunkCount} from peer: ${peerIdString}, operationId: ${message.header.operationId}, chunk size: ${chunkLength} bytes, total so far: ${totalBytesReceived} bytes`,
                );
                stringifiedData += chunk;
            }

            this.logger.debug(
                `[libp2p-debug] Finished receiving data from peer: ${peerIdString}, operationId: ${
                    message.header.operationId
                }, total chunks: ${chunkCount}, total bytes: ${totalBytesReceived}, read duration: ${
                    Date.now() - readStartTime
                }ms`,
            );

            const parseStartTime = Date.now();
            message.data = JSON.parse(stringifiedData);
            const parseDuration = Date.now() - parseStartTime;

            // Extract identifiers for logging
            const { blockchain, contract, tokenId, datasetRoot } = message.data || {};
            const ual =
                blockchain && contract && tokenId
                    ? `did:dkg:${blockchain}/${contract}/${tokenId}`
                    : 'N/A';

            // Log data structure info
            const dataKeys = Object.keys(message.data);
            const datasetSize = message.data.dataset
                ? JSON.stringify(message.data.dataset).length
                : 0;
            this.logger.debug(
                `[libp2p-debug] Parsed data from peer: ${peerIdString}, operationId: ${
                    message.header.operationId
                }, UAL: ${ual}, datasetRoot: ${datasetRoot}, data keys: [${dataKeys.join(
                    ', ',
                )}], dataset size: ${datasetSize} bytes, parse duration: ${parseDuration}ms`,
            );

            // Validate dataset structure if present
            if (message.data.dataset !== undefined) {
                const datasetType = typeof message.data.dataset;
                const isArray = Array.isArray(message.data.dataset);
                const datasetLength = isArray ? message.data.dataset.length : 'N/A';
                this.logger.debug(
                    `[libp2p-debug] Dataset info from peer: ${peerIdString}, operationId: ${message.header.operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}, type: ${datasetType}, isArray: ${isArray}, length: ${datasetLength}`,
                );

                if (message.data.dataset === null) {
                    this.logger.warn(
                        `[libp2p-debug] Dataset is NULL from peer: ${peerIdString}, operationId: ${message.header.operationId}, UAL: ${ual}, datasetRoot: ${datasetRoot}`,
                    );
                }
            }
        } catch (error) {
            this.logger.error(
                `[libp2p-debug] Failed to parse data JSON from peer: ${peerIdString}, operationId: ${
                    message.header.operationId
                }. Error: ${
                    error.message
                }. Total bytes received: ${totalBytesReceived}, chunks: ${chunkCount}. Raw data (first 1000 chars): ${stringifiedData?.substring(
                    0,
                    1000,
                )}`,
            );
            // If data parsing fails, return invalid message response
            return { message, valid: false, busy: false };
        }

        return { message, valid: true, busy: false };
    }

    async isRequestValid(header, peerIdString) {
        // filter spam requests
        if (await this.limitRequest(header, peerIdString)) return false;

        // header well formed
        if (
            !header.operationId ||
            !header.messageType ||
            !Object.keys(NETWORK_MESSAGE_TYPES.REQUESTS).includes(header.messageType)
        )
            return false;
        if (header.messageType === NETWORK_MESSAGE_TYPES.REQUESTS.PROTOCOL_INIT) {
            return true;
        }

        return this.sessionExists(peerIdString, header.operationId);
    }

    sessionExists() {
        return true;
    }

    async isResponseValid() {
        return true;
    }

    healthCheck() {
        // TODO: broadcast ping or sent msg to yourself
        const connectedNodes = this.node.connectionManager.size;
        if (connectedNodes > 0) return true;
        return false;
    }

    async limitRequest(header, peerIdString) {
        // if (header.sessionId && this.sessions.receiver[header.sessionId]) return false;

        if (this.blackList[peerIdString]) {
            const remainingMinutes = Math.floor(
                NETWORK_API_BLACK_LIST_TIME_WINDOW_MINUTES -
                    (Date.now() - this.blackList[peerIdString]) / (1000 * 60),
            );

            if (remainingMinutes > 0) {
                this.logger.debug(
                    `Blocking request from ${peerIdString}. Node is blacklisted for ${remainingMinutes} minutes.`,
                );

                return true;
            }
            delete this.blackList[peerIdString];
        }

        if (await this.rateLimiter.spamDetection.limit(peerIdString)) {
            this.blackList[peerIdString] = Date.now();
            this.logger.debug(
                `Blocking request from ${peerIdString}. Spammer detected and blacklisted for ${NETWORK_API_BLACK_LIST_TIME_WINDOW_MINUTES} minutes.`,
            );

            return true;
        }
        if (await this.rateLimiter.basicRateLimiter.limit(peerIdString)) {
            this.logger.debug(
                `Blocking request from ${peerIdString}. Max number of requests exceeded.`,
            );

            return true;
        }

        return false;
    }

    isBusy() {
        const distinctOperations = new Set();
        for (const peerId in this.sessions) {
            for (const operationId in Object.keys(this.sessions[peerId])) {
                distinctOperations.add(operationId);
            }
        }
        return toobusy(); // || distinctOperations.size > constants.MAX_OPEN_SESSIONS;
    }

    getPrivateKey() {
        return this.config.privateKey;
    }

    getName() {
        return 'Libp2p';
    }

    async findPeer(peerId) {
        return this.node.peerRouting.findPeer(createFromB58String(peerId));
    }

    async dial(peerId) {
        return this.node.dial(createFromB58String(peerId));
    }

    async getPeerInfo(peerId) {
        return this.node.peerStore.get(createFromB58String(peerId));
    }

    removeCachedSession(operationId, peerIdString) {
        if (this.sessions[peerIdString]?.[operationId]?.stream) {
            this.sessions[peerIdString][operationId].stream.close();
            delete this.sessions[peerIdString][operationId];
            this.logger.trace(
                `Removed session for remotePeerId: ${peerIdString}, operationId: ${operationId}.`,
            );
        }
    }
}

export default Libp2pService;
