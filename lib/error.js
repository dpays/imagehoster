"use strict";
/** API Errors. */
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
var ErrorCode;
(function (ErrorCode) {
    ErrorCode[ErrorCode["BadRequest"] = 0] = "BadRequest";
    ErrorCode[ErrorCode["Blacklisted"] = 1] = "Blacklisted";
    ErrorCode[ErrorCode["Deplorable"] = 2] = "Deplorable";
    ErrorCode[ErrorCode["FileMissing"] = 3] = "FileMissing";
    ErrorCode[ErrorCode["InternalError"] = 4] = "InternalError";
    ErrorCode[ErrorCode["InvalidImage"] = 5] = "InvalidImage";
    ErrorCode[ErrorCode["InvalidMethod"] = 6] = "InvalidMethod";
    ErrorCode[ErrorCode["InvalidProxyUrl"] = 7] = "InvalidProxyUrl";
    ErrorCode[ErrorCode["InvalidSignature"] = 8] = "InvalidSignature";
    ErrorCode[ErrorCode["LengthRequired"] = 9] = "LengthRequired";
    ErrorCode[ErrorCode["MissingParam"] = 10] = "MissingParam";
    ErrorCode[ErrorCode["NoSuchAccount"] = 11] = "NoSuchAccount";
    ErrorCode[ErrorCode["NotFound"] = 12] = "NotFound";
    ErrorCode[ErrorCode["PayloadTooLarge"] = 13] = "PayloadTooLarge";
    ErrorCode[ErrorCode["QoutaExceeded"] = 14] = "QoutaExceeded";
    ErrorCode[ErrorCode["UpstreamError"] = 15] = "UpstreamError";
})(ErrorCode || (ErrorCode = {}));
const HttpCodes = new Map([
    [ErrorCode.BadRequest, 400],
    [ErrorCode.Blacklisted, 451],
    [ErrorCode.Deplorable, 403],
    [ErrorCode.FileMissing, 400],
    [ErrorCode.InternalError, 500],
    [ErrorCode.InvalidImage, 400],
    [ErrorCode.InvalidMethod, 405],
    [ErrorCode.InvalidProxyUrl, 400],
    [ErrorCode.InvalidSignature, 400],
    [ErrorCode.LengthRequired, 411],
    [ErrorCode.MissingParam, 400],
    [ErrorCode.NoSuchAccount, 404],
    [ErrorCode.NotFound, 404],
    [ErrorCode.PayloadTooLarge, 413],
    [ErrorCode.QoutaExceeded, 429],
    [ErrorCode.UpstreamError, 400],
]);
class APIError extends Error {
    constructor(options) {
        const code = options.code || ErrorCode.InternalError;
        super(options.message || ErrorCode[code]);
        this.cause = options.cause;
        this.code = code;
        this.info = options.info;
        this.name = 'APIError';
    }
    static assert(condition, arg) {
        if (!condition) {
            let opts = {};
            switch (typeof arg) {
                case 'string':
                    opts.info = { msg: arg };
                    break;
                case 'object':
                    opts = arg;
                    break;
                default:
                    opts = { code: arg };
            }
            if (opts.code === undefined) {
                opts.code = ErrorCode.BadRequest;
            }
            throw new APIError(opts);
        }
    }
    static assertParams(object, keys) {
        for (const key of keys) {
            if (!object[key]) {
                throw new APIError({ code: APIError.Code.MissingParam, info: { param: key } });
            }
        }
    }
    get statusCode() {
        return HttpCodes.get(this.code) || 500;
    }
    toJSON() {
        return {
            info: this.info,
            name: utils_1.camelToSnake(ErrorCode[this.code]),
        };
    }
}
APIError.Code = ErrorCode;
exports.APIError = APIError;
async function errorMiddleware(ctx, next) {
    try {
        await next();
    }
    catch (error) {
        if (!(error instanceof APIError)) {
            error = new APIError({ cause: error });
        }
        ctx.status = error.statusCode;
        ctx['api_error'] = error;
        ctx.body = { error };
        ctx.app.emit('error', error, ctx.app);
    }
}
exports.errorMiddleware = errorMiddleware;
