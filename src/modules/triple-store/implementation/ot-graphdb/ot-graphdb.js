import graphdb from 'graphdb';
import axios from 'axios';
import OtTripleStore from '../ot-triple-store.js';

const { server, repository: repo, http } = graphdb;

class OtGraphdb extends OtTripleStore {
    async initialize(config, logger) {
        await super.initialize(config, logger);

        await Promise.all(
            Object.keys(this.repositories).map(async (repository) => {
                await this.createRepository(repository);
            }),
        );
    }

    async createRepository(repository) {
        const { url, name } = this.repositories[repository];
        const serverConfig = new server.ServerClientConfig(url)
            .setTimeout(40000)
            .setHeaders({
                Accept: http.RDFMimeType.N_QUADS,
            })
            .setKeepAlive(true);
        const s = new server.GraphDBServerClient(serverConfig);
        // eslint-disable-next-line no-await-in-loop
        const exists = await s.hasRepository(name);
        if (!exists) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await s.createRepository(
                    new repo.RepositoryConfig(
                        name,
                        '',
                        new Map(),
                        '',
                        'Repo title',
                        repo.RepositoryType.FREE,
                    ),
                );
            } catch (e) {
                // eslint-disable-next-line no-await-in-loop
                await s.createRepository(
                    new repo.RepositoryConfig(
                        name,
                        '',
                        {},
                        'graphdb:SailRepository',
                        'Repo title',
                        'graphdb',
                    ),
                );
            }
        }
    }

    initializeSparqlEndpoints(repository) {
        const { url, name } = this.repositories[repository];
        this.repositories[repository].sparqlEndpoint = `${url}/repositories/${name}`;
        this.repositories[
            repository
        ].sparqlEndpointUpdate = `${url}/repositories/${name}/statements`;
    }

    async healthCheck(repository) {
        const { url, username, password } = this.repositories[repository];
        try {
            const response = await axios.get(
                `${url}/repositories/${repository}/health`,
                {},
                {
                    auth: {
                        username,
                        password,
                    },
                },
            );
            if (response.data.status === 'green') {
                return true;
            }
            return false;
        } catch (e) {
            if (e.response && e.response.status === 404) {
                // Expected error: GraphDB is up but has not created node0 repository
                // Ot-node will create repo in initialization
                return true;
            }
            return false;
        }
    }

    async deleteRepository(repository) {
        const { url, name } = this.repositories[repository];
        this.logger.info(
            `Deleting ${this.getName()} triple store repository: ${repository} with name: ${name}`,
        );

        const serverConfig = new server.ServerClientConfig(url)
            .setTimeout(40000)
            .setHeaders({
                Accept: http.RDFMimeType.N_QUADS,
            })
            .setKeepAlive(true);
        const s = new server.GraphDBServerClient(serverConfig);
        s.deleteRepository(name).catch((e) =>
            this.logger.warn(
                `Error while deleting ${this.getName()} triple store repository: ${repository} with name: ${name}. Error: ${
                    e.message
                }`,
            ),
        );
    }

    async repositoryExists(repository) {
        const { url, name } = this.repositories[repository];

        const serverConfig = new server.ServerClientConfig(url)
            .setTimeout(40000)
            .setHeaders({
                Accept: http.RDFMimeType.N_QUADS,
            })
            .setKeepAlive(true);
        const s = new server.GraphDBServerClient(serverConfig);

        return s.hasRepository(name);
    }

    getName() {
        return 'GraphDB';
    }

    async queryVoid(repository, query) {
        const endpoint = `${this.repositories[repository].url}/repositories/${repository}/statements`;

        try {
            await axios.post(endpoint, query, {
                headers: {
                    'Content-Type': 'application/sparql-update',
                },
            });

            return true;
        } catch (error) {
            console.error(`SPARQL update failed: ${error.message}`);
            throw error;
        }
    }

    async ask(repository, query) {
        const endpoint = `${this.repositories[repository].url}/repositories/${repository}`;

        try {
            const response = await axios.post(endpoint, query, {
                headers: {
                    'Content-Type': 'application/sparql-query',
                    Accept: 'application/json',
                },
            });

            return response.data.boolean; // true or false
        } catch (error) {
            console.error(`ASK query failed: ${error.message}`);
            throw error;
        }
    }

    async construct(repository, query, accept = 'application/n-triples') {
        const endpoint = `${this.repositories[repository].url}/repositories/${repository}`;
        try {
            const response = await axios.post(endpoint, query, {
                headers: {
                    'Content-Type': 'application/sparql-query',
                    Accept: accept,
                },
            });
            return response.data;
        } catch (error) {
            console.error(`SPARQL query failed: ${error.message}`);
            throw error;
        }
    }

    async select(repository, query) {
        // todo: add media type once bug is fixed
        // no media type is passed because of comunica bug
        // https://github.com/comunica/comunica/issues/1034
        const result = await this._executeQuery(repository, query);
        return result ?? [];
    }

    async _executeQuery(repository, query, mediaType, accept = 'application/sparql-results+json') {
        const endpoint = `${this.repositories[repository].url}/repositories/${repository}`;
        try {
            const response = await axios.post(endpoint, query, {
                headers: {
                    'Content-Type': 'application/sparql-query',
                    Accept: accept,
                },
            });
            const result = [];
            for (const elem of response.data.results.bindings) {
                const obj = {};
                Object.keys(elem).forEach((key) => {
                    obj[key] = elem[key].value;
                });
                result.push(obj);
            }
            return result;
        } catch (error) {
            console.error(`SPARQL query failed: ${error.message}`);
            throw error;
        }
    }
}

export default OtGraphdb;
