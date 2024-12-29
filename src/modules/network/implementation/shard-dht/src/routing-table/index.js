/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-bitwise */

// @ts-ignore
const { xor: uint8ArrayXor } = require('uint8arrays/xor');
const { compare: uint8ArrayCompare } = require('uint8arrays/compare');
const utils = require('../utils');

/**
 * Routing table, where each peer id is mapped to their known blockchain implementation
 */
class RoutingTable {
    /**
     * @param {import('../')} dht
     */
    constructor(dht) {
        this.peerId = dht.peerId;
        this.dht = dht;
        this.table = new Map();
    }

    async start() {
        //
    }

    async stop() {
        //
    }

    // -- Public Interface

    /**
     * Amount of currently stored peers.
     */
    get size() {
        return this.table.size;
    }

    /**
     * Find a specific peer by id.
     *
     * @param {PeerId} peerId
     */
    find(peerId) {
        return this.table.get(peerId.toB58String())?.peerId;
    }

    /**
     * Retrieve the `count`-closest peers to the given key.
     *
     * @param {PeerId} peerId
     * @param {number} count
     */
    async closestPeers(peerId, count) {
        const peerRecord = this.table.get(peerId.toB58String());
        if (peerRecord == null) return [];

        const distances = [];
        for (const [, pr] of this.table.entries()) {
            if (!pr.blockchainIds.some((b) => peerRecord.blockchainIds.includes(b))) continue;
            distances.push({
                peerId: pr.peerId,
                distance: uint8ArrayXor(pr.hash, peerRecord.hash),
            });
        }

        return distances
            .sort((a, b) => uint8ArrayCompare(a.distance, b.distance))
            .map((d) => d.peerId)
            .filter((p) => this.dht.peerStore.addressBook.getMultiaddrsForPeer(p)?.length)
            .slice(0, count);
    }

    /**
     * Add or update the routing table with the given peer.
     *
     * @param {PeerId} peerId
     * @param {String} blockchainId -
     */
    async add(peerId, blockchainId) {
        const hash = await utils.convertPeerId(peerId);
        const blockchainIds = this.table.get(peerId.toB58String())?.blockchainIds ?? [];

        if (blockchainIds.includes(blockchainId)) return true;

        blockchainIds.push(blockchainId);

        return this.table.set(peerId.toB58String(), { peerId, blockchainIds, hash });
    }

    /**
     * Remove a given peer from the table.
     *
     * @param {PeerId} peerId
     */
    remove(peerId, blockchainId) {
        const blockchainIds = this.table.get(peerId.toB58String())?.blockchainIds ?? [];

        if (blockchainIds.length <= 1) return this.table.delete(peerId.toB58String());

        return this.table.set(
            peerId.toB58String(),
            blockchainIds.filter((b) => b === blockchainId),
        );
    }

    /**
     * Checks wether the peer exists in the routing table.
     *
     * @param {PeerId} peerId
     */
    has(peerId) {
        return this.table.has(peerId.toB58String());
    }
}

module.exports = RoutingTable;
