import axios from 'axios';
import OtTripleStore from '../ot-triple-store.js';
import { MEDIA_TYPES } from '../../../../constants/constants.js';

class OtBlazegraph extends OtTripleStore {
    async initialize(config, logger) {
        await super.initialize(config, logger);
        // this regex will match \Uxxxxxxxx but will exclude cases where there is a double slash before U (\\U)
        this.unicodeRegex = /(?<!\\)\\U([a-fA-F0-9]{8})/g;

        await Promise.all(
            Object.keys(this.repositories).map(async (repository) => {
                await this.createRepository(repository);
            }),
        );
    }

    async createRepository(repository) {
        const { url, name } = this.repositories[repository];
        if (!(await this.repositoryExists(repository))) {
            await axios.post(
                `${url}/blazegraph/namespace`,
                `com.bigdata.rdf.sail.truthMaintenance=false\n` +
                    `com.bigdata.namespace.${name}.spo.com.bigdata.btree.BTree.branchingFactor=1024\n` +
                    `com.bigdata.rdf.store.AbstractTripleStore.textIndex=false\n` +
                    `com.bigdata.rdf.store.AbstractTripleStore.justify=false\n` +
                    `com.bigdata.rdf.store.AbstractTripleStore.statementIdentifiers=false\n` +
                    `com.bigdata.rdf.store.AbstractTripleStore.axiomsClass=com.bigdata.rdf.axioms.NoAxioms\n` +
                    `com.bigdata.rdf.sail.namespace=${name}\n` +
                    `com.bigdata.rdf.store.AbstractTripleStore.quads=true\n` +
                    `com.bigdata.namespace.${name}.lex.com.bigdata.btree.BTree.branchingFactor=400\n` +
                    `com.bigdata.rdf.store.AbstractTripleStore.geoSpatial=false\n` +
                    `com.bigdata.journal.Journal.groupCommit=false\n` +
                    `com.bigdata.rdf.sail.isolatableIndices=false\n` +
                    `com.bigdata.rdf.store.AbstractTripleStore.enableRawRecordsSupport=false\n` +
                    `com.bigdata.rdf.store.AbstractTripleStore.Options.inlineTextLiterals=true\n` +
                    `com.bigdata.rdf.store.AbstractTripleStore.Options.maxInlineTextLength=128\n` +
                    `com.bigdata.rdf.store.AbstractTripleStore.Options.blobsThreshold=256\n`,
                {
                    headers: {
                        'Content-Type': 'text/plain',
                    },
                },
            );
        }
    }

    initializeSparqlEndpoints(repository) {
        const { url, name } = this.repositories[repository];
        this.repositories[repository].sparqlEndpoint = `${url}/blazegraph/namespace/${name}/sparql`;
        this.repositories[
            repository
        ].sparqlEndpointUpdate = `${url}/blazegraph/namespace/${name}/sparql`;
    }

    getRepositoryUrl(repository) {
        return this.repositories[repository].url;
    }

    hasUnicodeCodePoints(input) {
        return this.unicodeRegex.test(input);
    }

    decodeUnicodeCodePoints(input) {
        const decodedString = input.replace(this.unicodeRegex, (match, hex) => {
            const codePoint = parseInt(hex, 16);
            return String.fromCodePoint(codePoint);
        });

        return decodedString;
    }

    utfConverter(input) {
        return Buffer.from(input, 'utf8').toString();
    }

    async construct(repository, query, timeout) {
        return this._executeQuery(repository, query, MEDIA_TYPES.N_QUADS, timeout);
    }

    async select(repository, query, timeout) {
        const result = await this._executeQuery(repository, query, MEDIA_TYPES.JSON, timeout);
        return result ? JSON.parse(result) : [];
    }

    async ask(repository, query, timeout = 10000) {
        const result = await this._executeQuery(repository, query, MEDIA_TYPES.JSON, timeout);
        return result ? JSON.parse(result).boolean : false;
    }

    async _executeQuery(repository, query, mediaType, timeout) {
        const result = await axios.post(this.repositories[repository].sparqlEndpoint, query, {
            headers: {
                'Content-Type': 'application/sparql-query',
                'X-BIGDATA-MAX-QUERY-MILLIS': timeout,
                Accept: mediaType,
            },
        });
        let response;
        if (mediaType === MEDIA_TYPES.JSON) {
            // Check if this is an ASK query by looking for the boolean property
            if (result.data.boolean !== undefined) {
                // This is an ASK query response
                response = JSON.stringify(result.data);
            } else {
                // This is a SELECT query response
                const { bindings } = result.data.results;

                let output = '[\n';

                bindings.forEach((binding, bindingIndex) => {
                    let string = '  {\n';

                    const keys = Object.keys(binding);

                    keys.forEach((key, index) => {
                        let value = '';
                        const entry = binding[key];

                        if (entry.datatype) {
                            // e.g., "\"6900000\"^^http://www.w3.org/2001/XMLSchema#integer"
                            const literal = `"${entry.value}"^^${entry.datatype}`;
                            value = JSON.stringify(literal);
                        } else if (entry['xml:lang']) {
                            // e.g., "\"text here\"@en"
                            const literal = `"${entry.value}"@${entry['xml:lang']}`;
                            value = JSON.stringify(literal);
                        } else if (entry.type === 'uri') {
                            // URIs should be escaped and quoted directly
                            value = JSON.stringify(entry.value);
                        } else {
                            // For plain literals, wrap in quotes and stringify
                            const literal = `"${entry.value}"`;
                            value = JSON.stringify(literal);
                        }

                        const isLast = index === keys.length - 1;
                        string += `    "${key}": ${value}${isLast ? '' : ','}\n`;
                    });

                    const isLastBinding = bindingIndex === bindings.length - 1;
                    string += `  }${isLastBinding ? '\n' : ',\n'}`;

                    output += string;
                });

                output += ']';
                response = output;
            }
        } else {
            response = result.data;
        }

        // Handle Blazegraph special characters corruption
        if (this.hasUnicodeCodePoints(response)) {
            response = this.decodeUnicodeCodePoints(response);
        }

        response = this.utfConverter(response);

        return response;
    }

    async healthCheck(repository) {
        try {
            const response = await axios.get(
                `${this.repositories[repository].url}/blazegraph/status`,
                {},
            );
            if (response.data !== null) {
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    async queryVoid(repository, query, timeout) {
        const snippet = query?.slice(0, 80)?.replace(/\s+/g, ' ') || '';
        const label = `[OtBlazegraph.queryVoid] ${repository} ${snippet}`;
        if (this.logger?.startTimer) this.logger.startTimer(label);
        try {
            return await axios.post(this.repositories[repository].sparqlEndpoint, query, {
                headers: {
                    'Content-Type': 'application/sparql-update; charset=UTF-8',
                    'X-BIGDATA-MAX-QUERY-MILLIS': timeout,
                },
            });
        } finally {
            if (this.logger?.endTimer) this.logger.endTimer(label);
        }
    }

    async deleteRepository(repository) {
        const { url, name } = this.repositories[repository];
        this.logger.info(
            `Deleting ${this.getName()} triple store repository: ${repository} with name: ${name}`,
        );

        if (await this.repositoryExists(repository)) {
            await axios
                .delete(`${url}/blazegraph/namespace/${name}`, {})
                .catch((e) =>
                    this.logger.error(
                        `Error while deleting ${this.getName()} triple store repository: ${repository} with name: ${name}. Error: ${
                            e.message
                        }`,
                    ),
                );
        }
    }

    async repositoryExists(repository) {
        const { url, name } = this.repositories[repository];

        try {
            await axios.get(`${url}/blazegraph/namespace/${name}/properties`, {
                params: {
                    'describe-each-named-graph': 'false',
                },
                headers: {
                    Accept: 'application/ld+json',
                },
            });
            return true;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                // Expected error: GraphDB is up but has not created node0 repository
                // dkg-engine will create repo in initialization
                return false;
            }
            this.logger.error(
                `Error while getting ${this.getName()} repositories. Error: ${error.message}`,
            );

            return false;
        }
    }

    getName() {
        return 'OtBlazegraph';
    }
}

export default OtBlazegraph;
