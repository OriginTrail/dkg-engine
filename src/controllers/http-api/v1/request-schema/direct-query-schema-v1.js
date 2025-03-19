import { QUERY_TYPES } from '../../../../constants/constants.js';

export default () => ({
    type: 'object',
    required: ['type', 'query'],
    properties: {
        type: {
            enum: [QUERY_TYPES.CONSTRUCT, QUERY_TYPES.SELECT],
        },
        query: {
            type: 'string',
        },
    },
});
