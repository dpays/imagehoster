"use strict";
/** Logging things */
Object.defineProperty(exports, "__esModule", { value: true });
const Bunyan = require("bunyan");
const config = require("config");
const level = config.get('log_level');
const output = config.get('log_output');
let stream;
if (output === 'stdout') {
    stream = { level, stream: process.stdout };
}
else if (output === 'stderr') {
    stream = { level, stream: process.stderr };
}
else {
    stream = { level, path: output };
}
exports.logger = Bunyan.createLogger({
    name: config.get('name'),
    serializers: Bunyan.stdSerializers,
    streams: [stream],
});
function loggerMiddleware(ctx, next) {
    ctx['start_time'] = process.hrtime();
    const uuid = ctx.request.get('X-Amzn-Trace-Id') ||
        ctx.request.get('X-Request-Id') ||
        `dev-${Math.round(Math.random() * Number.MAX_SAFE_INTEGER)}`;
    ctx['req_id'] = uuid;
    ctx.response.set('X-Request-Id', uuid);
    ctx['log'] = exports.logger.child({
        req_id: uuid,
        req_ip: ctx.request.ip
    });
    ctx['tag'] = (obj) => {
        ctx['log'] = ctx['log'].child(obj);
    };
    ctx['log'].debug({ req: ctx.req }, 'request');
    const done = () => {
        const delta = process.hrtime(ctx['start_time']);
        const info = {
            method: ctx.method,
            ms: delta[0] * 1e3 + delta[1] / 1e6,
            path: ctx.path,
            size: ctx.response.length,
            status: ctx.status,
        };
        if (ctx['api_error']) {
            info.err_code = ctx['api_error'].toJSON().name;
        }
        ctx['log'].info(info, 'response');
    };
    ctx.res.once('close', done);
    ctx.res.once('finish', done);
    return next();
}
exports.loggerMiddleware = loggerMiddleware;
