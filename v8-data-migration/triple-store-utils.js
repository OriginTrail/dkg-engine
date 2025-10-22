import { setTimeout } from 'timers/promises';
import axios from 'axios';
import {
    OT_BLAZEGRAPH,
    OT_FUSEKI,
    OT_GRAPHDB,
    N_QUADS,
    SCHEMA_CONTEXT,
    PRIVATE_ASSERTION_ONTOLOGY,
    PUBLIC_CURRENT,
    PRIVATE_CURRENT,
    DKG_REPOSITORY,
    VISIBILITY,
    METADATA_NAMED_GRAPH,
    TRIPLE_STORE_CONNECT_MAX_RETRIES,
    TRIPLE_STORE_CONNECT_RETRY_FREQUENCY,
} from './constants.js';
import {
    validateTripleStoreConfig,
    validateTripleStoreRepositories,
    validateTripleStoreImplementation,
    validateRepository,
    validateQuery,
    validateAssertionId,
    validateTokenId,
    validateAssertion,
    validateUal,
} from './validation.js';
import logger from './logger.js';

export function getTripleStoreData(tripleStoreConfig) {
    // Validation
    validateTripleStoreConfig(tripleStoreConfig);

    let tripleStoreImplementation;
    const tripleStoreRepositories = {};

    for (const [implementationName, implementationDetails] of Object.entries(
        tripleStoreConfig.implementation,
    )) {
        if (implementationDetails.enabled) {
            tripleStoreImplementation = implementationName;
            for (const [repository, repositoryDetails] of Object.entries(
                implementationDetails.config.repositories,
            )) {
                if (
                    repository === PRIVATE_CURRENT ||
                    repository === PUBLIC_CURRENT ||
                    repository === DKG_REPOSITORY
                ) {
                    tripleStoreRepositories[repository] = repositoryDetails;
                }
            }
            break;
        }
    }

    return { tripleStoreImplementation, tripleStoreRepositories };
}

// Initialize sparql endpoints
function initializeSparqlEndpoints(tripleStoreRepositories, repository, tripleStoreImplementation) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateRepository(repository);
    validateTripleStoreImplementation(tripleStoreImplementation);

    const { url, name } = tripleStoreRepositories[repository];
    const updatedTripleStoreRepositories = tripleStoreRepositories;

    switch (tripleStoreImplementation) {
        case OT_BLAZEGRAPH:
            updatedTripleStoreRepositories[
                repository
            ].sparqlEndpoint = `${url}/blazegraph/namespace/${name}/sparql`;
            updatedTripleStoreRepositories[
                repository
            ].sparqlEndpointUpdate = `${url}/blazegraph/namespace/${name}/sparql`;
            break;
        case OT_FUSEKI:
            updatedTripleStoreRepositories[repository].sparqlEndpoint = `${url}/${name}/sparql`;
            updatedTripleStoreRepositories[
                repository
            ].sparqlEndpointUpdate = `${url}/${name}/update`;
            break;
        case OT_GRAPHDB:
            updatedTripleStoreRepositories[
                repository
            ].sparqlEndpoint = `${url}/repositories/${name}`;
            updatedTripleStoreRepositories[
                repository
            ].sparqlEndpointUpdate = `${url}/repositories/${name}/statements`;
            break;
        default:
            throw new Error('Invalid triple store name in initializeSparqlEndpoints');
    }

    return updatedTripleStoreRepositories;
}

export function initializeRepositories(tripleStoreRepositories, tripleStoreImplementation) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateTripleStoreImplementation(tripleStoreImplementation);

    let updatedTripleStoreRepositories = tripleStoreRepositories;
    for (const repository in tripleStoreRepositories) {
        logger.info(`Initializing a triple store repository: ${repository}`);
        updatedTripleStoreRepositories = initializeSparqlEndpoints(
            updatedTripleStoreRepositories,
            repository,
            tripleStoreImplementation,
        );
    }

    return updatedTripleStoreRepositories;
}

export function initializeContexts(tripleStoreRepositories) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);

    const updatedTripleStoreRepositories = tripleStoreRepositories;

    for (const repository in updatedTripleStoreRepositories) {
        const sources = [
            {
                type: 'sparql',
                value: updatedTripleStoreRepositories[repository].sparqlEndpoint,
            },
        ];

        updatedTripleStoreRepositories[repository].updateContext = {
            sources,
            destination: {
                type: 'sparql',
                value: updatedTripleStoreRepositories[repository].sparqlEndpointUpdate,
            },
        };
        updatedTripleStoreRepositories[repository].queryContext = {
            sources,
        };
    }

    return updatedTripleStoreRepositories;
}

export async function healthCheck(tripleStoreRepositories, repository, tripleStoreImplementation) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateRepository(repository);
    validateTripleStoreImplementation(tripleStoreImplementation);

    switch (tripleStoreImplementation) {
        case OT_BLAZEGRAPH: {
            try {
                const response = await axios.get(
                    `${tripleStoreRepositories[repository].url}/blazegraph/status`,
                    {},
                );
                if (response.data !== null) {
                    return true;
                }
                return false;
            } catch (e) {
                logger.error(`Health check failed for repository ${repository}:`, e);
                return false;
            }
        }
        case OT_FUSEKI: {
            try {
                const response = await axios.get(
                    `${tripleStoreRepositories[repository].url}/$/ping`,
                    {},
                );
                if (response.data !== null) {
                    return true;
                }
                return false;
            } catch (e) {
                logger.error(`Health check failed for repository ${repository}:`, e);
                return false;
            }
        }
        case OT_GRAPHDB: {
            const { url, username, password } = tripleStoreRepositories[repository];
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
                    // dkg-engine will create repo in initialization
                    return true;
                }
                logger.error(`Health check failed for repository ${repository}:`, e);
                return false;
            }
        }
        default:
            throw new Error('Invalid triple store name in healthCheck');
    }
}

export async function ensureConnections(tripleStoreRepositories, tripleStoreImplementation) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateTripleStoreImplementation(tripleStoreImplementation);

    const ensureConnectionPromises = Object.keys(tripleStoreRepositories).map(
        async (repository) => {
            let ready = await healthCheck(
                tripleStoreRepositories,
                repository,
                tripleStoreImplementation,
            );
            let retries = 0;
            while (!ready && retries < TRIPLE_STORE_CONNECT_MAX_RETRIES) {
                retries += 1;
                logger.warn(
                    `Cannot connect to Triple store repository: ${repository}, located at: ${tripleStoreRepositories[repository].url}  retry number: ${retries}/${TRIPLE_STORE_CONNECT_MAX_RETRIES}. Retrying in ${TRIPLE_STORE_CONNECT_RETRY_FREQUENCY} seconds.`,
                );
                /* eslint-disable no-await-in-loop */
                await setTimeout(TRIPLE_STORE_CONNECT_RETRY_FREQUENCY * 1000);
                ready = await healthCheck(
                    tripleStoreRepositories,
                    repository,
                    tripleStoreImplementation,
                );
            }
            if (retries === TRIPLE_STORE_CONNECT_MAX_RETRIES) {
                logger.error(
                    `Triple Store repository: ${repository} not available, max retries reached.`,
                );
                process.exit(1);
            }
        },
    );

    await Promise.all(ensureConnectionPromises);
}

// blazegraph only
function hasUnicodeCodePoints(input) {
    const unicodeRegex = /(?<!\\)\\U([a-fA-F0-9]{8})/g;
    return unicodeRegex.test(input);
}

// blazegraph only
function decodeUnicodeCodePoints(input) {
    const unicodeRegex = /(?<!\\)\\U([a-fA-F0-9]{8})/g;
    const decodedString = input.replace(unicodeRegex, (match, hex) => {
        const codePoint = parseInt(hex, 16);
        return String.fromCodePoint(codePoint);
    });

    return decodedString;
}

export async function _executeQuery(
    tripleStoreRepositories,
    repository,
    tripleStoreImplementation,
    query,
    mediaType,
) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateRepository(repository);
    validateTripleStoreImplementation(tripleStoreImplementation);
    validateQuery(query);

    if (!mediaType) {
        logger.error(`[VALIDATION ERROR] Media type is not defined. Media type: ${mediaType}`);
        process.exit(1);
    }

    const response = await axios.post(
        tripleStoreRepositories[repository].sparqlEndpoint,
        new URLSearchParams({
            query,
        }),
        {
            headers: {
                Accept: mediaType,
            },
        },
    );

    let { data } = response;

    if (tripleStoreImplementation === OT_BLAZEGRAPH) {
        // Handle Blazegraph special characters corruption
        if (hasUnicodeCodePoints(data)) {
            data = decodeUnicodeCodePoints(data);
        }
    }

    return data;
}

export async function construct(
    tripleStoreRepositories,
    repository,
    tripleStoreImplementation,
    query,
) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateRepository(repository);
    validateTripleStoreImplementation(tripleStoreImplementation);
    validateQuery(query);

    return _executeQuery(
        tripleStoreRepositories,
        repository,
        tripleStoreImplementation,
        query,
        N_QUADS,
    );
}

function cleanEscapeCharacter(query) {
    return query.replace(/['|[\]\\]/g, '\\$&');
}

export async function getAssertion(
    tripleStoreRepositories,
    repository,
    tripleStoreImplementation,
    assertionId,
) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateRepository(repository);
    validateTripleStoreImplementation(tripleStoreImplementation);
    validateAssertionId(assertionId);

    const escapedGraphName = cleanEscapeCharacter(assertionId);
    const query = `PREFIX schema: <${SCHEMA_CONTEXT}>
                CONSTRUCT { ?s ?p ?o }
                WHERE {
                    {
                        GRAPH <assertion:${escapedGraphName}>
                        {
                            ?s ?p ?o .
                        }
                    }
                }`;
    return construct(tripleStoreRepositories, repository, tripleStoreImplementation, query);
}

export function extractPrivateAssertionId(publicAssertion) {
    // Validation
    validateAssertion(publicAssertion);

    const split = publicAssertion.split(PRIVATE_ASSERTION_ONTOLOGY);
    if (split.length <= 1 || !split[1].includes('"') || !split[1].includes('0x')) {
        return null;
    }
    const input = split[1];
    const openingQuoteIndex = input.indexOf('"') + 1;
    const closingQuoteIndex = input.indexOf('"', openingQuoteIndex);
    const privateAssertionId = input.substring(openingQuoteIndex, closingQuoteIndex).trim();
    if (!privateAssertionId || !privateAssertionId.includes('0x')) {
        return null;
    }
    return privateAssertionId;
}

export async function getAssertionFromV6TripleStore(
    tripleStoreRepositories,
    tripleStoreImplementation,
    tokenId,
    ualAssertionIdData,
) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateTripleStoreImplementation(tripleStoreImplementation);
    validateTokenId(tokenId);

    if (
        !ualAssertionIdData ||
        typeof ualAssertionIdData !== 'object' ||
        !ualAssertionIdData.assertionId ||
        !ualAssertionIdData.ual
    ) {
        logger.error(
            `[VALIDATION ERROR] Ual assertion ID data is not properly defined or it is not an object. Ual assertion ID data: ${ualAssertionIdData}`,
        );
        process.exit(1);
    }

    const { assertionId, ual } = ualAssertionIdData;
    let success = false;
    let publicAssertion = null;
    let privateAssertion = null;

    try {
        // First try to fetch public data from private current repository
        publicAssertion = await getAssertion(
            tripleStoreRepositories,
            PRIVATE_CURRENT,
            tripleStoreImplementation,
            assertionId,
        );

        // Check if public assertion is found in private current repository
        if (publicAssertion) {
            success = true;
            // Check if assertion contains a private assertion
            if (publicAssertion.includes(PRIVATE_ASSERTION_ONTOLOGY)) {
                // Extract the private assertionId from the publicAssertion if it exists
                const privateAssertionId = extractPrivateAssertionId(publicAssertion);
                if (!privateAssertionId) {
                    logger.warn(
                        `There was a problem while extracting the private assertionId from public assertion: ${publicAssertion}. Extracted privateAssertionId: ${privateAssertionId}`,
                    );
                    success = false;
                    return { tokenId, ual, publicAssertion, privateAssertion, success };
                }

                privateAssertion = await getAssertion(
                    tripleStoreRepositories,
                    PRIVATE_CURRENT,
                    tripleStoreImplementation,
                    privateAssertionId,
                );

                // If private assertionId exists but assertion could not be fetched
                if (!privateAssertion) {
                    logger.warn(
                        `Private assertion with id ${privateAssertionId} could not be fetched from ${PRIVATE_CURRENT} repository even though it should exist`,
                    );
                }
            }
        } else {
            publicAssertion = await getAssertion(
                tripleStoreRepositories,
                PUBLIC_CURRENT,
                tripleStoreImplementation,
                assertionId,
            );
            success = true;
        }
    } catch (e) {
        logger.error(
            `Error fetching assertion from triple store for tokenId: ${tokenId}, assertionId: ${assertionId}, error: ${e}`,
        );
        success = false;
    }

    return {
        tokenId,
        ual,
        publicAssertion,
        privateAssertion,
        success,
        assertionId,
    };
}

export function processContent(str) {
    return str
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
}

async function ask(tripleStoreRepositories, repository, query) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateRepository(repository);
    validateQuery(query);
    try {
        const response = await axios.post(
            tripleStoreRepositories[repository].sparqlEndpoint,
            new URLSearchParams({
                query,
            }),
            {
                headers: {
                    Accept: 'application/json',
                },
            },
        );

        return response.data.boolean;
    } catch (e) {
        logger.error(
            `Error while doing ASK query: ${query} in repository: ${repository}. Error: ${e.message}`,
        );
        return false;
    }
}

export async function getKnowledgeCollectionNamedGraphsExist(
    tokenId,
    tripleStoreRepositories,
    knowledgeAssetUal,
    privateAssertion,
) {
    const askQueries = [];
    askQueries.push(`
        FILTER EXISTS {
            GRAPH <${knowledgeAssetUal}/${VISIBILITY.PUBLIC}> {
                ?s ?p ?o
            }
        }
    `);
    if (privateAssertion) {
        askQueries.push(`
            FILTER EXISTS {
                GRAPH <${knowledgeAssetUal}/${VISIBILITY.PRIVATE}> {
                    ?s ?p ?o
                }
            }
        `);
    }
    askQueries.push(`
        FILTER EXISTS {
            GRAPH <${METADATA_NAMED_GRAPH}> {
                <${knowledgeAssetUal}> ?p ?o .
            }
        }
    `);

    const combinedQuery = `
        ASK {
            ${askQueries.join('\n')}
        }
    `;

    const exists = await ask(tripleStoreRepositories, DKG_REPOSITORY, combinedQuery);

    return { tokenId, exists };
}

export async function queryVoid(tripleStoreRepositories, repository, query) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateRepository(repository);
    validateQuery(query);

    await axios.post(tripleStoreRepositories[repository].sparqlEndpointUpdate, query, {
        headers: {
            'Content-Type': 'application/sparql-update',
        },
    });
}

function hasSpecialCharactersInIRI(assertion) {
    const lines = assertion.split('\n');
    // {, }, |, ^, `, and \ without u or U
    // eslint-disable-next-line no-useless-escape
    const iriPattern = /<[^>]*(?:[\s{}\|^`]|\\(?![uU]))[^>]*>/;

    return lines.some((line) => {
        // Split quad into subject, predicate, object (ignore graph if present)
        const parts = line.trim().split(' ');

        // Check each part only if it starts with < and ends with >
        return parts.some((part) => {
            if (part.startsWith('<') && part.endsWith('>')) {
                return iriPattern.test(part);
            }
            return false;
        });
    });
}

export async function insertAssertionsIntoV8UnifiedRepository(
    v6Assertions,
    tripleStoreRepositories,
) {
    // Insert into new repository
    const successfullyProcessed = [];
    const assertionsToCheck = [];
    const insertQueries = [];
    for (const assertion of v6Assertions) {
        const { tokenId, ual, publicAssertion, privateAssertion } = assertion;

        // Assertion with assertionId does not exist in triple store. Continue
        if (!publicAssertion) {
            successfullyProcessed.push(tokenId);
            continue;
        }

        if (hasSpecialCharactersInIRI(publicAssertion)) {
            logger.warn(
                `Public assertion with tokenId: ${tokenId} contains illegal characters in IRI. Skipping...
                Public assertion: ${publicAssertion}`,
            );
            successfullyProcessed.push(tokenId);
            continue;
        }

        const knowledgeAssetUal = `${ual.toLowerCase()}/1`;

        const publicNQuads = processContent(publicAssertion);
        insertQueries.push(`
            GRAPH <${knowledgeAssetUal}/${VISIBILITY.PUBLIC}> {
                ${publicNQuads.join('\n')}
            }
        `);

        if (privateAssertion) {
            const privateNQuads = processContent(privateAssertion);
            insertQueries.push(`
                GRAPH <${knowledgeAssetUal}/${VISIBILITY.PRIVATE}> {
                    ${privateNQuads.join('\n')}
                }
            `);
        }

        const metadataNQuads = `<${knowledgeAssetUal}> <http://schema.org/states> "${knowledgeAssetUal}:0" .`;
        insertQueries.push(`
                GRAPH <${METADATA_NAMED_GRAPH}> {
                ${metadataNQuads}
            }
        `);

        assertionsToCheck.push(assertion);
    }

    if (insertQueries.length > 0) {
        const combinedQuery = `
                PREFIX schema: <${SCHEMA_CONTEXT}>
                INSERT DATA {
                    ${insertQueries.join('\n')}
                }
            `;

        logger.time(`INSERTING ${assertionsToCheck.length} ASSERTIONS INTO V8 TRIPLE STORE`);
        await queryVoid(tripleStoreRepositories, DKG_REPOSITORY, combinedQuery);
        logger.timeEnd(`INSERTING ${assertionsToCheck.length} ASSERTIONS INTO V8 TRIPLE STORE`);
    }

    return { successfullyProcessed, assertionsToCheck };
}

export async function knowledgeCollectionNamedGraphExists(
    tripleStoreRepositories,
    repository,
    ual,
    visibility,
) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateRepository(repository);
    validateUal(ual);
    if (!visibility || !Object.values(VISIBILITY).includes(visibility)) {
        throw new Error(
            `Visibility is not defined or it is not a valid visibility. Visibility: ${visibility}`,
        );
    }

    const query = `
        ASK {
            GRAPH ?g {
                ?s ?p ?o
            }
            FILTER(STRSTARTS(STR(?g), "${ual}/${visibility}"))
        }
    `;

    return ask(tripleStoreRepositories, repository, query);
}

export async function knowledgeAssetMetadataExists(tripleStoreRepositories, repository, ual) {
    // Validation
    validateTripleStoreRepositories(tripleStoreRepositories);
    validateRepository(repository);
    validateUal(ual);

    const query = `
        ASK {
            GRAPH <${METADATA_NAMED_GRAPH}> {
                <${ual}> ?p ?o .
            }
        }
    `;

    return ask(tripleStoreRepositories, repository, query);
}
