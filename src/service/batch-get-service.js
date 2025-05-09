import { Mutex } from 'async-mutex';
import OperationService from './operation-service.js';
import {
    OPERATION_ID_STATUS,
    NETWORK_PROTOCOLS,
    ERROR_TYPE,
    OPERATIONS,
} from '../constants/constants.js';

class BatchGetService extends OperationService {
    constructor(ctx) {
        super(ctx);

        this.operationName = OPERATIONS.BATCH_GET;
        this.networkProtocols = NETWORK_PROTOCOLS.BATCH_GET;
        this.errorType = ERROR_TYPE.BATCH_GET.BATCH_GET_ERROR;
        this.completedStatuses = [
            OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_FETCH_FROM_NODES_END,
            OPERATION_ID_STATUS.BATCH_GET.BATCH_GET_END,
            OPERATION_ID_STATUS.COMPLETED,
        ];
        this.operationMutex = new Mutex();
    }
}

export default BatchGetService;
