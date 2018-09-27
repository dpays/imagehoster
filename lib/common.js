"use strict";
/** Misc shared instances. */
Object.defineProperty(exports, "__esModule", { value: true });
const config = require("config");
const dpayts_1 = require("dpayts");
const Redis = require("redis");
const logger_1 = require("./logger");
/** Steemd (jussi) RPC client. */
exports.rpcClient = new dpayts_1.Client(config.get('rpc_node'));
if (config.has('redis_url')) {
    exports.redisClient = Redis.createClient({
        url: config.get('redis_url')
    });
}
else {
    logger_1.logger.warn('redis not configured, will not rate-limit uploads');
}
/** Blob storage. */
let S3Client;
function loadStore(key) {
    const conf = config.get(key);
    if (conf.type === 'memory') {
        logger_1.logger.warn('using memory store for %s', key);
        return require('abstract-blob-store')();
    }
    else if (conf.type === 's3') {
        if (!S3Client) {
            const aws = require('aws-sdk');
            S3Client = new aws.S3();
        }
        return require('s3-blob-store')({
            client: S3Client,
            bucket: conf.get('s3_bucket'),
        });
    }
    else {
        throw new Error(`Invalid storage type: ${conf.type}`);
    }
}
exports.uploadStore = loadStore('upload_store');
exports.proxyStore = loadStore('proxy_store');
