/*jslint node: true */
"use strict";

var {
    Readable,
    pipeline
} = require("stream");
var pump = require("pump");
var ms = require("ms");
var etag = require("etag");
var parseUrl = require("parseurl");
var mime = require("mime");
var fresh = require("fresh");
var parseRange = require("range-parser");
var gzipMaybe = require("http-gzip-maybe");

var READ_SIZE = 64 * 1024;
var MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000;
var BYTES_RANGE_REGEXP = /^ *bytes=/;

var headersSent = function (res) {

    if (typeof res.headersSent !== "boolean") {

        return Boolean(res._header);
    }
    return res.headersSent;
};

var decode = function (path) {

    try {

        return decodeURIComponent(path);
    } catch (err) {

        return "";
    }
};

var getHeaderNames = function (res) {

    if (typeof res.getHeaderNames !== "function") {

        return Object.keys(res._headers || {});
    }
    return res.getHeaderNames();
};

var removeContentHeaderFields = function (res) {

    var headers = getHeaderNames(res);
    for (var i = 0; i < headers.length; i++) {

        var header = headers[i];
        var removing = header.substr(0, 8) === "content-";
        removing &= header !== "content-location";
        if (removing) res.removeHeader(header);
    }
};

var isConditionalGET = function (req) {

    var conditional = !!req.headers["if-match"];
    conditional |= !!req.headers["if-unmodified-since"];
    conditional |= !!req.headers["if-none-match"];
    conditional |= !!req.headers["if-modified-since"];
    return conditional;
};

var parseTokenList = function (str) {

    var end = 0;
    var list = [];
    var start = 0;
    for (var i = 0, len = str.length; i < len; i++) {

        switch (str.charCodeAt(i)) {

            case 0x20: /*   */
                if (start === end) {

                    start = end = i + 1;
                }
                break;
            case 0x2c: /* , */
                list.push(str.substring(start, end));
                start = end = i + 1;
                break
            default:
                end = i + 1;
                break;
        }
    }
    list.push(str.substring(start, end));
    return list;
};

var parseHttpDate = function (date) {

    var timestamp = date && Date.parse(date);
    if (typeof timestamp === "number") {

        return timestamp;
    }
    return NaN;
};

var isPreconditionFailure = function (req, res) {

    var match = req.headers["if-match"];
    if (match) {

        var eTag = res.getHeader("ETag");
        if (!eTag) return true;
        return match !== "*" && parseTokenList(...[
            match
        ]).every(function (match) {

            var matching = match !== eTag;
            matching &= match !== ("W/" + eTag);
            matching &= ("W/" + match) !== eTag;
            return matching;
        });
    }
    var unmodifiedSince = parseHttpDate(...[
        req.headers["if-unmodified-since"]
    ]);
    if (!isNaN(unmodifiedSince)) {

        var lastModified = parseHttpDate(...[
            res.getHeader("Last-Modified")
        ]);
        var failing = isNaN(lastModified);
        if (failing) {

            failing |= lastModified > unmodifiedSince;
        }
        return failing;
    }
    return false;
};

var isCachable = function (res) {

    var statusCode = res.statusCode;
    var cachable = statusCode >= 200;
    cachable &= statusCode < 300;
    if (!cachable) cachable |= statusCode === 304;
    return cachable;
};

var isFresh = function (req, res) {

    return fresh(req.headers, {

        etag: res.getHeader("ETag"),
        "last-modified": res.getHeader("Last-Modified")
    });
};

var notModified = function (res) {

    removeContentHeaderFields(res);
    res.statusCode = 304;
    res.end();
};

var isRangeFresh = function (req, res) {

    var ifRange = req.headers["if-range"];
    if (!ifRange) {

        return true;
    }
    if (ifRange.indexOf('"') !== -1) {

        var eTag = res.getHeader("ETag");
        var fresh = ifRange.indexOf(eTag) !== -1;
        return Boolean(eTag && fresh);
    }
    var lastModified = res.getHeader("Last-Modified");
    lastModified = parseHttpDate(lastModified);
    ifRange = parseHttpDate(ifRange);
    return lastModified <= ifRange;
};

var contentRange = function (type, size, range) {

    var content = type + " ";
    if (range) {

        content += range.start + "-" + range.end;
    } else content += "*";
    content += "/" + size;
    return content;
};

module.exports = function (key, options) {

    if (typeof options != "object") options = {};
    return function (out, req, res, next) {

        if (typeof out !== "object") out = {};
        if (typeof key !== "string") return false;
        if (Object.keys(out).indexOf(key) === -1) return false;
        var data = out[key];
        var data_size;
        var error;
        var stream;
        var many = Array.isArray(data);
        if (data instanceof Readable) stream = data;
        else stream = new Readable({

            highWaterMark: function () {

                var chunk = many ? data[0] : data;
                var chunk_size;
                if (chunk) {

                    chunk_size = chunk.length;
                    if (!chunk_size) chunk_size = chunk.size;
                    if (!chunk_size) {

                        chunk_size = chunk.byteLength;
                    }
                }
                if (chunk_size && !many) data_size = chunk_size;
                if (!chunk_size) chunk_size = READ_SIZE;
                return chunk_size * 2;
            }(),
            encoding: function () {

                var encoding = out.encoding;
                if (!encoding) {

                    var chunk = many ? data[0] : data;
                    if (typeof chunk === "string") {

                        encoding = "utf8";
                    } else encoding = null;
                }
                return encoding;
            }(),
            read() {

                var chunk = data;
                if (many) {

                    if (data.length > 0) {

                        chunk = data.splice(0, 1)[0];
                    } else chunk = null;
                } else data = null;
                this.push(chunk);
            }
        });
        if (headersSent(res)) {

            error = new Error("Can\"t set headers after they are sent");
            error.code = 500;
            next(error);
            return true;
        }
        var path;
        if (out.path) path = decode(out.path);
        if (!path && out.filename) {

            path = decode(out.filename);
        }
        if (!path) {

            var originalUrl = parseUrl.original(req);
            path = parseUrl(req).pathname;
            var resetting = path === "/";
            var { pathname } = originalUrl;
            resetting &= pathname.substr(-1) !== "/";
            if (resetting) path = "";
        }
        var type = out.mime || out.type;
        if (!type && path) type = mime.getType(path);
        if (type && !res.getHeader("Content-Type")) {

            res.setHeader("Content-Type", type);
        }
        var accepting = !!options.acceptRanges;
        accepting &= !res.getHeader("Accept-Ranges");
        if (accepting) {

            res.setHeader("Accept-Ranges", "bytes");
        }
        var caching = !!options.cacheControl;
        caching &= !res.getHeader("Cache-Control");
        var no_caching = out.cache === false;
        if (caching && !no_caching) {

            var maxage = options.maxAge;
            if (!maxage) maxage = options.maxage;
            if (typeof maxage === "string") {

                maxage = ms(maxage);
            } else maxage = Number(maxage);
            if (!isNaN(maxage)) {

                maxage = Math.min(...[
                    Math.max(0, maxage),
                    MAX_MAXAGE
                ]);
            } else maxage = 0;
            var cacheControl = "public, max-age=";
            cacheControl += Math.floor(maxage / 1000);
            var immutable = false;
            if (options.immutable !== undefined) {

                immutable = Boolean(options.immutable);
            }
            if (immutable) cacheControl += ", immutable";
            res.setHeader("Cache-Control", cacheControl);
        } else if (caching && no_caching) {

            res.setHeader("Cache-Control", "no-cache");
        }
        var stat = out.stat || out.stats;
        var mtime = out.mtime || out.lastModified;
        var timing = !(mtime instanceof Date);
        timing &= typeof stat === "object";
        if (timing) timing &= stat.mtime instanceof Date;
        if (timing) mtime = stat.mtime;
        var modifying = mtime instanceof Date;
        modifying &= !!options.lastModified;
        modifying &= !res.getHeader("Last-Modified");
        if (modifying) {

            var modified = mtime.toUTCString();
            res.setHeader("Last-Modified", modified);
        }
        var etaging = typeof stat === "object";
        etaging &= !!options.etag;
        etaging &= !res.getHeader("ETag");
        if (etaging) {

            var val = etag(stat);
            res.setHeader("ETag", val);
        }
        var attaching = !!options.attachment;
        attaching &= !res.getHeader("Content-Disposition");
        if (attaching) {

            res.attachment(path || undefined);
            res.setHeader(...[
                "Content-Transfer-Encoding",
                "binary"
            ]);
        }
        if (typeof out.modified !== "boolean") {

            if (isConditionalGET(req)) {

                if (isPreconditionFailure(req, res)) {

                    error = new Error();
                    error.code = 412;
                    next(error);
                    return true;
                }
                if (isCachable(res) && isFresh(req, res)) {

                    notModified(res);
                    return true;
                }
            }
        } else if (out.modified === false) {

            notModified(res);
            return true;
        }
        var len = out.size || out.length;
        var sizing = !len;
        sizing &= typeof stat === "object";
        if (sizing) sizing &= stat.size > 0;
        if (sizing) len = stat.size;
        if (!len && data_size) len = data_size;
        var offset = out.start >= 0 ? out.start : 0;
        if (len) len = Math.max(0, len - offset);
        if (out.end > 0) {

            var bytes = out.end - offset + 1;
            if (len > bytes) len = bytes;
        }
        var ranges = out.ranges;
        if (options.acceptRanges && len) {

            if (!ranges) {

                ranges = req.headers.range;
                if (BYTES_RANGE_REGEXP.test(ranges)) {

                    ranges = parseRange(len, ranges, {

                        combine: true
                    });
                }
            }
            if (ranges) {

                if (!isRangeFresh(req, res)) ranges = -2;
                if (ranges === -1) {

                    res.setHeader(...[
                        "Content-Range",
                        contentRange("bytes", len)
                    ]);
                    error = new Error();
                    error.code = 416;
                    next(error);
                    return true;
                }
                if (ranges !== -2 && ranges.length === 1) {

                    res.statusCode = 206;
                    res.setHeader(...[
                        "Content-Range",
                        contentRange("bytes", len, ranges[0])
                    ]);
                    offset += ranges[0].start;
                    len = ranges[0].end - ranges[0].start + 1;
                }
            }
        }
        if (len && path && path.endsWith("zip")) {

            res.setHeader("Content-Length", len);
        }
        if (req.method === "HEAD") {

            res.end();
            return true;
        }
        var streams = [stream];
        if (!path || !path.endsWith("zip")) {

            var gzip = gzipMaybe(req, res);
            streams.push(gzip);
        }
        streams.push(res);
        (pipeline || pump)(streams, function (err) {

            if (err) next(err);
        });
        return true;
    };
};