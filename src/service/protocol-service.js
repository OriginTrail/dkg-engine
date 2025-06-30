import { NETWORK_PROTOCOLS } from '../constants/constants.js';

class ProtocolService {
    constructor(ctx) {
        this.logger = ctx.logger;
    }

    toAwilixVersion(protocol) {
        const { version } = this.resolveProtocol(protocol);
        return `v${version.split('.').join('_')}`;
    }

    resolveProtocol(protocol) {
        const [, name, version] = protocol.split('/');
        return { name, version };
    }

    getProtocols() {
        return Object.values(NETWORK_PROTOCOLS);
    }

    toOperation(protocol) {
        const { name } = this.resolveProtocol(protocol);
        switch (name) {
            case 'store':
                return 'publish';
            case 'batch-get':
                return 'batchGet';
            default:
                return name;
        }
    }

    getReceiverCommandSequence(protocol) {
        const version = this.toAwilixVersion(protocol);
        const { name } = this.resolveProtocol(protocol);
        const capitalizedOperation = name.charAt(0).toUpperCase() + name.slice(1);

        const prefix = `${version}Handle${capitalizedOperation}`;

        return [`${prefix}RequestCommand`];
    }

    getSenderCommandSequence(protocol) {
        const version = this.toAwilixVersion(protocol);
        const operation = this.toOperation(protocol);
        const capitalizedOperation = operation.charAt(0).toUpperCase() + operation.slice(1);

        const prefix = `${version}${capitalizedOperation}`;

        return [`${prefix}RequestCommand`];
    }
}

export default ProtocolService;
