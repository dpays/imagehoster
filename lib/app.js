"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cors = require("@koa/cors");
const cluster = require("cluster");
const config = require("config");
const http = require("http");
const Koa = require("koa");
const os = require("os");
const util = require("util");
const error_1 = require("./error");
const logger_1 = require("./logger");
const routes_1 = require("./routes");
const utils_1 = require("./utils");
exports.app = new Koa();
exports.version = require('./version');
exports.app.proxy = utils_1.parseBool(config.get('proxy'));
exports.app.on('error', (error, ctx) => {
    const log = ctx['log'] || logger_1.logger;
    if (error instanceof error_1.APIError) {
        if (error.statusCode >= 500) {
            log.error(error.cause || error, 'unexpected api error: %s', error.message);
        }
        else {
            log.debug(error.cause || error, 'api error: %s', error.message);
        }
    }
    else {
        log.error(error, 'application error');
    }
});
exports.app.use(logger_1.loggerMiddleware);
exports.app.use(error_1.errorMiddleware);
exports.app.use(cors());
exports.app.use(routes_1.routes);
exports.app.use((ctx) => {
    throw new error_1.APIError({ code: error_1.APIError.Code.NotFound });
});
async function main() {
    if (cluster.isMaster) {
        logger_1.logger.info({ version: exports.version }, 'starting service');
    }
    const server = http.createServer(exports.app.callback());
    const listen = util.promisify(server.listen).bind(server);
    const close = util.promisify(server.close).bind(server);
    let numWorkers = Number.parseInt(config.get('num_workers'));
    if (numWorkers === 0) {
        numWorkers = os.cpus().length;
    }
    const isMaster = cluster.isMaster && numWorkers > 1;
    if (isMaster) {
        logger_1.logger.info('spawning %d workers', numWorkers);
        for (let i = 0; i < numWorkers; i++) {
            cluster.fork();
        }
    }
    else {
        const port = config.get('port');
        await listen(port);
        logger_1.logger.info('listening on port %d', port);
    }
    const exit = async () => {
        if (!isMaster) {
            await close();
        }
        return 0;
    };
    process.on('SIGTERM', () => {
        logger_1.logger.info('got SIGTERM, exiting...');
        exit().then((code) => {
            process.exit(code);
        }).catch((error) => {
            logger_1.logger.fatal(error, 'unable to exit gracefully');
            setTimeout(() => process.exit(1), 1000);
        });
    });
}
if (module === require.main) {
    main().catch((error) => {
        logger_1.logger.fatal(error, 'unable to start');
        setTimeout(() => process.exit(1), 1000);
    });
}
