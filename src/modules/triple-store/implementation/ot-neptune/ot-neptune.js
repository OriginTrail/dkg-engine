import axios from 'axios';
import OtTripleStore from '../ot-triple-store.js';

class OtNeptune extends OtTripleStore {
    async initialize(config, logger) {
        await super.initialize(config, logger);
    }

    /* eslint-disable-next-line no-unused-vars */
    async createRepository(repository) {
        /* eslint-disable-next-line no-empty-function */
    }

    initializeSparqlEndpoints(repository) {
        /* eslint-disable-next-line no-unused-vars */
        const { url, name } = this.repositories[repository];
        this.repositories[repository].sparqlEndpoint = `${url}/sparql`;
        this.repositories[repository].sparqlEndpointUpdate = `${url}/sparql`;
    }

    /* eslint-disable-next-line no-unused-vars */
    async deleteRepository(repository) {
        /* eslint-disable-next-line no-empty-function */
    }

    async healthCheck(repository) {
        try {
            const response = await axios.get(`${this.repositories[repository].url}/status`);
            if (response.data && response.data.status === 'healthy') {
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    getName() {
        return 'OtNeptune';
    }
}
export default OtNeptune;
