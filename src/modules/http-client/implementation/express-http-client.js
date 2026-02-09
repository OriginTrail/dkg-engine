import express from 'express';
import https from 'https';
import fs from 'fs-extra';
import fileUpload from 'express-fileupload';
import cors from 'cors';
import requestValidationMiddleware from './middleware/request-validation-middleware.js';
import rateLimiterMiddleware from './middleware/rate-limiter-middleware.js';
import authenticationMiddleware from './middleware/authentication-middleware.js';
import authorizationMiddleware from './middleware/authorization-middleware.js';
import blockchainIdMiddleware from './middleware/blockchain-id-midleware.js';
import { BYTES_IN_MEGABYTE, MAX_FILE_SIZE } from '../../../constants/constants.js';

class ExpressHttpClient {
    async initialize(config, logger) {
        this.config = config;
        this.logger = logger;
        this.app = express();
    }

    get(route, callback, options) {
        this.app.get(route, ...this.selectMiddlewares(options), callback);
    }

    post(route, callback, options) {
        this.app.post(route, ...this.selectMiddlewares(options), callback);
    }

    use(route, callback, options) {
        this.app.use(route, ...this.selectMiddlewares(options), callback);
    }

    createRouterInstance() {
        return express.Router();
    }

    sendResponse(res, status, returnObject) {
        res.status(status);
        res.send(returnObject);
    }

    async listen() {
        if (this.config.useSsl) {
            const [key, cert] = await Promise.all([
                fs.promises.readFile(this.config.sslKeyPath),
                fs.promises.readFile(this.config.sslCertificatePath),
            ]);
            this.httpsServer = https.createServer(
                {
                    key,
                    cert,
                },
                this.app,
            );
            this.httpsServer.listen(this.config.port);
        } else {
            this.server = this.app.listen(this.config.port);
        }
        this.logger.info(`Node listening on port: ${this.config.port}`);
    }

    async close() {
        return new Promise((resolve, reject) => {
            const serverToClose = this.httpsServer || this.server;
            if (serverToClose) {
                serverToClose.close((err) => {
                    if (err) {
                        this.logger.error(`Error closing HTTP server: ${err.message}`);
                        reject(err);
                    } else {
                        this.logger.info('HTTP server closed successfully');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }

    selectMiddlewares(options) {
        const middlewares = [];
        if (options.rateLimit) middlewares.push(rateLimiterMiddleware(this.config.rateLimiter));
        if (options.requestSchema)
            middlewares.push(requestValidationMiddleware(options.requestSchema));

        return middlewares;
    }

    initializeBeforeMiddlewares(authService, blockchainImplementations) {
        this._initializeCorsMiddleware();
        this.app.use(authenticationMiddleware(authService));
        this.app.use(authorizationMiddleware(authService));
        this._initializeBaseMiddlewares();
        this.app.use(blockchainIdMiddleware(blockchainImplementations));
    }

    initializeAfterMiddlewares() {
        // placeholder method for after middlewares
    }

    _initializeCorsMiddleware() {
        const corsOptions = {};

        if (this.config.auth?.cors?.allowedOrigin) {
            corsOptions.origin = this.config.auth.cors.allowedOrigin;
        }

        this.app.use(cors(corsOptions));
    }

    _initializeBaseMiddlewares() {
        this.app.use(
            fileUpload({
                createParentPath: true,
            }),
        );

        this.app.use(express.json({ limit: `${MAX_FILE_SIZE / BYTES_IN_MEGABYTE}mb` }));
        this.app.use((req, res, next) => {
            this.logger.api(`${req.method}: ${req.url} request received`);
            return next();
        });
    }
}

export default ExpressHttpClient;
