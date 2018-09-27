"use strict";
/** Serve files from upload store. */
Object.defineProperty(exports, "__esModule", { value: true });
const dist_es6_1 = require("stream-head/dist-es6");
const common_1 = require("./common");
const error_1 = require("./error");
const utils_1 = require("./utils");
async function serveHandler(ctx) {
    ctx.tag({ handler: 'serve' });
    error_1.APIError.assert(ctx.method === 'GET', error_1.APIError.Code.InvalidMethod);
    error_1.APIError.assertParams(ctx.params, ['hash']);
    const file = common_1.uploadStore.createReadStream(ctx.params['hash']);
    file.on('error', (error) => {
        if (error.notFound || error.code === 'NoSuchKey') {
            ctx.res.writeHead(404, 'Not Found');
        }
        else {
            ctx.log.error(error, 'unable to read %s', ctx.params['hash']);
            ctx.res.writeHead(500, 'Internal Error');
        }
        ctx.res.end();
        file.destroy();
    });
    const { head, stream } = await dist_es6_1.default(file, { bytes: 16384 });
    const mimeType = await utils_1.mimeMagic(head);
    ctx.response.set('Content-Type', mimeType);
    ctx.response.set('Cache-Control', 'public,max-age=29030400,immutable');
    ctx.body = stream;
}
exports.serveHandler = serveHandler;
