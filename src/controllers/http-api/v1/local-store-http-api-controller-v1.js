import { kcTools } from 'assertion-tools';
import BaseController from '../base-http-api-controller.js';
import {
    PRIVATE_HASH_SUBJECT_PREFIX,
    TRIPLE_STORE_REPOSITORIES,
} from '../../../constants/constants.js';

class LocalStoreController extends BaseController {
    constructor(ctx) {
        super(ctx);
        this.validationService = ctx.validationService;
        this.ualService = ctx.ualService;
        this.tripleStoreService = ctx.tripleStoreService;
        this.cryptoService = ctx.cryptoService;
    }

    async handleRequest(req, res) {
        const { dataset, blockchain, datasetRoot, UAL } = req.body;
        let contract;
        let knowledgeCollectionId;
        try {
            ({ contract, knowledgeCollectionId } = this.ualService.resolveUAL(UAL));
            const { publicKnowledgeAssetsUALs, privateKnowledgeAssetsUALs } = this.getKAUALs(
                dataset,
                UAL,
            );

            const alreadyInserted = await this.tripleStoreService.ask(`
                ASK {
                    FILTER (
                        ${[...publicKnowledgeAssetsUALs, ...privateKnowledgeAssetsUALs]
                            .map((ual) => `EXISTS { GRAPH <${ual}> { ?s ?p ?o } }`)
                            .join(' && ')}
                            )
                            }
                            `);

            if (alreadyInserted) {
                return this.returnResponse(res, 200, {
                    status: true,
                });
            }
        } catch (error) {
            return this.returnResponse(res, 500, {
                status: false,
                error,
            });
        }

        try {
            const validations = [
                this.validationService.validateDatasetRoot(dataset.public, datasetRoot),
                this.validationService.validateDatasetRootOnBlockchain(
                    datasetRoot,
                    blockchain,
                    contract,
                    knowledgeCollectionId,
                ),
            ];

            if (dataset?.private?.length) {
                validations.push(
                    this.validationService.validatePrivateMerkleRoot(
                        dataset.public,
                        dataset.private,
                    ),
                );
            }

            await Promise.all(validations);
        } catch (error) {
            return this.returnResponse(res, 400, {
                status: false,
                error,
            });
        }
        try {
            await this.tripleStoreService.insertKnowledgeCollection(
                TRIPLE_STORE_REPOSITORIES.DKG,
                UAL,
                dataset,
            );

            return this.returnResponse(res, 200, {
                status: true,
            });
        } catch (error) {
            return this.returnResponse(res, 500, {
                status: false,
                error,
            });
        }
    }

    getKAUALs(dataset, UAL) {
        const privateHashTriples = [];
        const filteredPublic = [];
        let privateKnowledgeAssetsUALs = [];
        // Check if already inserted
        dataset.public.forEach((triple) => {
            if (triple.startsWith(`<${PRIVATE_HASH_SUBJECT_PREFIX}`)) {
                privateHashTriples.push(triple);
            } else {
                filteredPublic.push(triple);
            }
        });

        const publicKnowledgeAssetsTriplesGrouped = kcTools.groupNquadsBySubject(
            filteredPublic,
            true,
        );
        publicKnowledgeAssetsTriplesGrouped.push(
            ...kcTools.groupNquadsBySubject(privateHashTriples, true),
        );

        let publicKnowledgeAssetsUALs = publicKnowledgeAssetsTriplesGrouped.map(
            (_, index) => `${UAL}/${index + 1}`,
        );

        if (dataset.private?.length) {
            const privateKnowledgeAssetsTriplesGrouped = kcTools.groupNquadsBySubject(
                dataset.private,
                true,
            );

            const publicSubjectMap = publicKnowledgeAssetsTriplesGrouped.reduce(
                (map, group, index) => {
                    const [publicSubject] = group[0].split(' ');
                    map.set(publicSubject, index);
                    return map;
                },
                new Map(),
            );

            for (const privateTriple of privateKnowledgeAssetsTriplesGrouped) {
                const [privateSubject] = privateTriple[0].split(' ');
                if (publicSubjectMap.has(privateSubject)) {
                    const ualIndex = publicSubjectMap.get(privateSubject);
                    privateKnowledgeAssetsUALs.push(publicKnowledgeAssetsUALs[ualIndex]);
                } else {
                    const privateSubjectHashed = `<${PRIVATE_HASH_SUBJECT_PREFIX}${this.cryptoService.sha256(
                        privateSubject.slice(1, -1),
                    )}>`;
                    if (publicSubjectMap.has(privateSubjectHashed)) {
                        const ualIndex = publicSubjectMap.get(privateSubjectHashed);
                        privateKnowledgeAssetsUALs.push(publicKnowledgeAssetsUALs[ualIndex]);
                    }
                }
            }
        }
        publicKnowledgeAssetsUALs = publicKnowledgeAssetsUALs.map((ual) => `${ual}/public`);
        privateKnowledgeAssetsUALs = privateKnowledgeAssetsUALs.map((ual) => `${ual}/private`);
        return { publicKnowledgeAssetsUALs, privateKnowledgeAssetsUALs };
    }
}

export default LocalStoreController;
