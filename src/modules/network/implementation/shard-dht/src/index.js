/* eslint-disable import/no-extraneous-dependencies */
const { EventEmitter } = require('events');

const { equals: uint8ArrayEquals } = require('uint8arrays/equals');
const PeerId = require('peer-id');

const RoutingTable = require('./routing-table');
const utils = require('./utils');
const c = require('./constants');
const Network = require('./network');
const peerRouting = require('./peer-routing');
const QueryManager = require('./query-manager');

/**
 * @typedef {*} Libp2p
 * @typedef {*} PeerStore
 * @typedef {import('peer-id')} PeerId
 * @typedef {*} Dialer
 * @typedef {*} Registrar
 * @typedef {import('multiformats/cid').CID} CID
 * @typedef {import('multiaddr').Multiaddr} Multiaddr
 * @typedef {object} PeerData
 * @property {PeerId} id
 * @property {Multiaddr[]} multiaddrs
 */

class ShardDHT extends EventEmitter {
    /**
     * Create a new ShardDHT.
     *
     * @param {Object} props
     * @param {Array} props.bootstrap - bootstrap nodes
     * @param {Libp2p} props.libp2p - the libp2p instance
     * @param {Dialer} props.dialer - libp2p dialer instance
     * @param {PeerId} props.peerId - peer's peerId
     * @param {PeerStore} props.peerStore - libp2p peerStore
     * @param {Registrar} props.registrar - libp2p registrar instance
     * @param {string} [props.protocolPrefix = '/ipfs'] - libp2p registrar handle protocol
     * @param {boolean} [props.forceProtocolLegacy = false] - WARNING: this is not recommended and should only be used for legacy purposes
     * @param {number} props.kBucketSize - k-bucket size (default 20)
     * @param {boolean} props.clientMode - If true, the DHT will not respond to queries. This should be true if your node will not be dialable. (default: false)
     * @param {number} props.concurrency - alpha concurrency of queries (default 3)
     */
    constructor({
        bootstrap,
        libp2p,
        dialer,
        peerId,
        peerStore,
        registrar,
        protocolPrefix = '/ipfs',
        forceProtocolLegacy = false,
        kBucketSize = c.K,
        clientMode = false,
        concurrency = c.ALPHA,
    }) {
        super();

        if (!dialer) {
            throw new Error('libp2p-kad-dht requires an instance of Dialer');
        }

        this.bootstrap = new Set(bootstrap);

        /**
         * Local reference to the libp2p instance. May be undefined.
         *
         * @type {Libp2p}
         */
        this.libp2p = libp2p;

        /**
         * Local reference to the libp2p dialer instance
         *
         * @type {Dialer}
         */
        this.dialer = dialer;

        /**
         * Local peer-id
         *
         * @type {PeerId}
         */
        this.peerId = peerId;

        /**
         * Local PeerStore
         *
         * @type {PeerStore}
         */
        this.peerStore = peerStore;

        /**
         * Local peer info
         *
         * @type {Registrar}
         */
        this.registrar = registrar;

        /**
         * Registrar protocol
         *
         * @type {string}
         */
        this.protocol = protocolPrefix + (forceProtocolLegacy ? '' : c.PROTOCOL_DHT);

        /**
         * k-bucket size
         *
         * @type {number}
         */
        this.kBucketSize = kBucketSize;

        this._clientMode = clientMode;

        /**
         * ALPHA concurrency at which each query path with run, defaults to 3
         *
         * @type {number}
         */
        this.concurrency = concurrency;

        /**
         * Number of disjoint query paths to use
         * This is set to `kBucketSize`/2 per the S/Kademlia paper
         *
         * @type {number}
         */
        this.disjointPaths = Math.ceil(this.kBucketSize / 2);

        /**
         * The routing table.
         *
         * @type {RoutingTable}
         */
        this.routingTable = new RoutingTable(this, { kBucketSize: this.kBucketSize });

        this.network = new Network(this);

        this._log = utils.logger(this.peerId);

        /**
         * Keeps track of running queries
         *
         * @type {QueryManager}
         */
        this._queryManager = new QueryManager();

        this._running = false;

        this.peerRouting = peerRouting(this);
    }

    /**
     * Is this DHT running.
     */
    get isStarted() {
        return this._running;
    }

    /**
     * Start listening to incoming connections.
     */
    start() {
        this._running = true;

        return Promise.all([
            this._queryManager.start(),
            this.network.start(),
            this.routingTable.start(),
        ]);
    }

    /**
     * Stop accepting incoming connections and sending outgoing
     * messages.
     */
    stop() {
        this._running = false;

        return Promise.all([
            this._queryManager.stop(),
            this.network.stop(),
            this.routingTable.stop(),
        ]);
    }

    // ----------- Peer Routing -----------

    /**
     * Search for a peer with the given ID.
     *
     * @param {PeerId} id
     * @param {Object} [options] - findPeer options
     * @param {number} [options.timeout=60000] - how long the query should maximally run, in milliseconds (default: 60000)
     * @returns {Promise<{ id: PeerId, multiaddrs: Multiaddr[] }>}
     */
    async findPeer(id, options = { timeout: 60000 }) {
        // eslint-disable-line require-await
        return this.peerRouting.findPeer(id, options);
    }

    /**
     * Kademlia 'node lookup' operation.
     *
     * @param {Uint8Array} key
     * @param {Object} [options]
     * @param {boolean} [options.shallow = false] - shallow query
     */
    async *getClosestPeers(key, options = { shallow: false }) {
        yield* this.peerRouting.getClosestPeers(key, options);
    }

    /**
     * Get the public key for the given peer id.
     *
     * @param {PeerId} peer
     */
    getPublicKey(peer) {
        return this.peerRouting.getPublicKey(peer);
    }

    /**
     * Add the peer to the routing table and update it in the peerStore.
     *
     * @param {PeerId} peerId
     * @param {String} BlockchainId
     */
    async add(peerId, blockchainId) {
        return this.routingTable.add(peerId, blockchainId);
    }

    /**
     * Remove the peer from the routing table.
     *
     * @param {PeerId} peerId
     * @param {String} BlockchainId
     */
    remove(peerId, blockchainId) {
        return this.routingTable.remove(peerId, blockchainId);
    }

    /**
     * Checks wether the peer exists in the routing table.
     *
     * @param {PeerId} peerId
     */
    has(peerId) {
        return this.bootstrap.has(peerId.toB58String()) || this.routingTable.has(peerId);
    }

    // ----------- Discovery -----------

    /**
     * @param {PeerId} peerId
     * @param {Multiaddr[]} multiaddrs
     */
    _peerDiscovered(peerId, multiaddrs) {
        if (!this.has(peerId)) return;

        this.emit('peer', {
            id: peerId,
            multiaddrs,
        });
    }

    // ----------- Internals -----------

    /**
     * Returns the routing tables closest peers, for the key of
     * the message.
     *
     * @param {Message} msg
     */
    async _nearestPeersToQuery(msg) {
        const ids = await this.routingTable.closestPeers(
            PeerId.createFromBytes(msg.key),
            this.kBucketSize,
        );

        return ids.map((p) => {
            /** @type {{ id: PeerId, addresses: { multiaddr: Multiaddr }[] }} */
            const peer = this.peerStore.get(p);

            return {
                id: p,
                multiaddrs: peer ? peer.addresses.map((address) => address.multiaddr) : [],
            };
        });
    }

    /**
     * Get the nearest peers to the given query, but iff closer
     * than self.
     *
     * @param {Message} msg
     * @param {PeerId} peerId
     */
    async _betterPeersToQuery(msg, peerId) {
        this._log('betterPeersToQuery');

        return (await this._nearestPeersToQuery(msg)).filter((closer) => {
            if (this._isSelf(closer.id)) {
                // Should bail, not sure
                this._log.error('trying to return self as closer');
                return false;
            }

            return !closer.id.equals(peerId);
        });
    }

    /**
     * Is the given peer id our PeerId?
     *
     * @param {PeerId} other
     */
    _isSelf(other) {
        return other && uint8ArrayEquals(this.peerId.id, other.id);
    }
}

module.exports = ShardDHT;
module.exports.multicodec = `/ipfs + ${c.PROTOCOL_DHT}`;
