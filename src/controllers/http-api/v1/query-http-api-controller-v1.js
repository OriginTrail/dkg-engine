import BaseController from '../base-http-api-controller.js';

import { OPERATION_ID_STATUS, TRIPLE_STORE_REPOSITORIES } from '../../../constants/constants.js';

class QueryController extends BaseController {
    constructor(ctx) {
        super(ctx);
        this.commandExecutor = ctx.commandExecutor;
        this.operationIdService = ctx.operationIdService;
        this.fileService = ctx.fileService;
    }

    async handleRequest(req, res) {
        const { query, type: queryType, repository, paranetUAL } = req.body;

        const operationId = await this.operationIdService.generateOperationId(
            OPERATION_ID_STATUS.QUERY.QUERY_INIT_START,
        );

        this.returnResponse(res, 202, {
            operationId,
        });

        let tripleStoreMigrationAlreadyExecuted = false;
        try {
            tripleStoreMigrationAlreadyExecuted =
                (await this.fileService.readFile(
                    '/root/ot-node/data/migrations/v8DataMigration',
                )) === 'MIGRATED';
        } catch (e) {
            this.logger.warn(`No triple store migration file error: ${e}`);
        }
        await this.operationIdService.updateOperationIdStatus(
            operationId,
            null,
            OPERATION_ID_STATUS.QUERY.QUERY_INIT_END,
        );

        await this.commandExecutor.add({
            name: 'queryCommand',
            sequence: [],
            delay: 0,
            data: {
                query,
                queryType,
                repository:
                    !tripleStoreMigrationAlreadyExecuted && repository
                        ? [repository, TRIPLE_STORE_REPOSITORIES.DKG]
                        : TRIPLE_STORE_REPOSITORIES.DKG,
                operationId,
                paranetUAL,
            },
            transactional: false,
        });
    }
}

export default QueryController;
