export default (argumentsObject) => ({
    type: 'object',
    required: ['datasetRoot', 'dataset', 'blockchain'],
    properties: {
        datasetRoot: {
            type: 'string',
            minLength: 66,
            maxLength: 66,
        },
        dataset: {
            type: 'object',
            properties: {
                public: {
                    type: 'array',
                    items: {
                        type: 'string',
                    },
                    minItems: 1,
                },
                private: {
                    type: 'array',
                    items: {
                        type: 'string',
                    },
                },
            },
            required: ['public'],
            additionalProperties: false,
        },
        blockchain: {
            enum: argumentsObject.blockchainImplementationNames,
        },
        UAL: {
            type: 'string',
        },
    },
});
