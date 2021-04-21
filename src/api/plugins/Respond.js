/*jslint node: true */
'use strict';

var Readable = require('stream').Readable;
var ms = require('ms');
var etag = require('etag');
var FileType = require('file-type');
var parseUrl = require('parseurl');
var mime = require('mime');
var fresh = require('fresh');
var parseRange = require('range-parser');
var gzipMaybe = require('http-gzip-maybe');
var pump = require('pump');

var READ_SIZE = 64 * 1024;
var MAX_MAXAGE = 60 * 60 * 24 * 365 * 1000;
var BYTES_RANGE_REGEXP = /^ *bytes=/;

var headersSent = function (res) {

    return typeof res.headersSent !== 'boolean' ? Boolean(res._header) : res.headersSent;
};

var decode = function (path) {

    try {

        return decodeURIComponent(path);
    } catch (err) {

        return '';
    }
};

var getHeaderNames = function (res) {

    return typeof res.getHeaderNames !== 'function' ? Object.keys(res._headers || {}) :
        res.getHeaderNames();
};

var removeContentHeaderFields = function (res) {

    var headers = getHeaderNames(res);
    for (var i = 0; i < headers.length; i++) {

        var header = headers[i];
        if (header.substr(0, 8) === 'content-' && header !== 'content-location') {

            res.removeHeader(header);
        }
    }
};

var isConditionalGET = function (req) {

    return req.headers['if-match'] || req.headers['if-unmodified-since'] ||
        req.headers['if-none-match'] || req.headers['if-modified-since'];
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
    return typeof timestamp === 'number' ? timestamp : NaN;
};

var isPreconditionFailure = function (req, res) {

    var match = req.headers['if-match'];
    if (match) {

        var etag = res.getHeader('ETag');
        return !etag || (match !== '*' && parseTokenList(match).every(function (match) {

            return match !== etag && match !== 'W/' + etag && 'W/' + match !== etag;
        }));
    }
    var unmodifiedSince = parseHttpDate(req.headers['if-unmodified-since']);
    if (!isNaN(unmodifiedSince)) {

        var lastModified = parseHttpDate(res.getHeader('Last-Modified'));
        return isNaN(lastModified) || lastModified > unmodifiedSince;
    }
    return false;
};

var isCachable = function (res) {

    var statusCode = res.statusCode;
    return (statusCode >= 200 && statusCode < 300) || statusCode === 304;
};

var isFresh = function (req, res) {

    return fresh(req.headers, {

        'etag': res.getHeader('ETag'),
        'last-modified': res.getHeader('Last-Modified')
    });
};


var notModified = function (res) {

    removeContentHeaderFields(res);
    res.statusCode = 304;
    res.end();
};


var isRangeFresh = function (req, res) {

    var ifRange = req.headers['if-range'];
    if (!ifRange) {

        return true;
    }
    if (ifRange.indexOf('"') !== -1) {

        var etag = res.getHeader('ETag');
        return Boolean(etag && ifRange.indexOf(etag) !== -1);
    }
    var lastModified = res.getHeader('Last-Modified');
    return parseHttpDate(lastModified) <= parseHttpDate(ifRange);
};

var contentRange = function (type, size, range) {

    return type + ' ' + (range ? range.start + '-' + range.end : '*') + '/' + size;
};

module.exports = function (key, options) {

    if (typeof options != 'object') options = {};
    return function (out, req, res, next) {

        if (typeof out !== 'object') out = {};
        var data = out[typeof key === 'string' ? key : 'data'] || '';
        var error;
        var stream = data instanceof Readable ? data : new Readable({

            highWaterMark: function () {

                var chunk = (Array.isArray(data) && data[0]) || data;
                var buffer_size =
                    chunk ? chunk.length || chunk.size || chunk.byteLength || READ_SIZE : READ_SIZE;
                return buffer_size * 2;
            }(),
            encoding: typeof data === 'string' ? out.encoding || 'utf8' : null,
            read() {

                if (Array.isArray(data) && data[0]) this.push(data.splice(0, 1)[0]);
                else if (!Array.isArray(data) && data) this.push(data);
                else this.push(null);
            }
        }).on('error', function (err) {

            next(err);
        });
        if (headersSent(res)) {

            error = new Error('Can\'t set headers after they are sent');
            error.code = 500;
            next(error);
            return;
        }
        if (options.acceptRanges && !res.getHeader('Accept-Ranges')) {

            res.setHeader('Accept-Ranges', 'bytes');
        }
        if (options.cacheControl && !res.getHeader('Cache-Control')) {

            var maxage = options.maxAge || options.maxage;
            maxage = typeof maxage === 'string' ? ms(maxage) : Number(maxage);
            maxage = !isNaN(maxage) ? Math.min(Math.max(0, maxage), MAX_MAXAGE) : 0;
            var cacheControl = 'public, max-age=' + Math.floor(maxage / 1000);
            var immutable = options.immutable !== undefined ? Boolean(opts.immutable) : false;
            if (immutable) cacheControl += ', immutable';
            res.setHeader('Cache-Control', cacheControl);
        }
        var stat = out.stat || out.stats;
        if (typeof stat === 'object' && stat.mtime instanceof Date) {

            if (options.lastModified && !res.getHeader('Last-Modified')) {

                var modified = stat.mtime.toUTCString();
                res.setHeader('Last-Modified', modified);
            }
            if (options.etag && !res.getHeader('ETag')) {

                var val = etag(stat);
                res.setHeader('ETag', val);
            }
        }
        FileType.fromStream(stream).then(function (fileType) {

            var type = fileType && fileType.mime;
            var path = (out.path && decode(out.path)) || (out.filename && decode(out.filename));
            if (!path) {

                var originalUrl = parseUrl.original(req);
                path = parseUrl(req).pathname;
                if (path === '/' && originalUrl.pathname.substr(-1) !== '/') path = '';
            }
            if (!type && path) type = mime.lookup(path);
            if (options.attachment && !res.getHeader('Content-Disposition')) {

                res.attachment(path || undefined);
            }
            if (type && !res.getHeader('Content-Type')) {

                var charset = mime.charsets.lookup(type);
                res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
            }
            if (typeof options.modified !== 'boolean') {

                if (isConditionalGET(req)) {

                    if (isPreconditionFailure(req, res)) {

                        error = new Error();
                        error.code = 412;
                        next(error);
                        return;
                    }
                    if (isCachable(res) && isFresh(req, res)) {

                        notModified();
                        return;
                    }
                }
            } else if (options.modified === false) {

                notModified();
                return;
            }
            if (typeof stat === 'object' && stat.size > 0) {

                var len = stat.size;
                var offset = out.start >= 0 ? out.start : 0;
                len = Math.max(0, len - offset);
                if (out.end > 0) {

                    var bytes = out.end - offset + 1;
                    if (len > bytes) len = bytes;
                }
                var ranges = out.ranges;
                if (options.acceptRanges) {

                    if (!ranges) {

                        var ranges = req.headers.range;
                        if (BYTES_RANGE_REGEXP.test(ranges)) {

                            ranges = parseRange(len, ranges, {

                                combine: true
                            });
                        }
                    }
                    if (ranges) {

                        if (!isRangeFresh(req, res)) {

                            ranges = -2;
                        }
                        if (ranges === -1) {

                            res.setHeader('Content-Range', contentRange('bytes', len));
                            error = new Error();
                            error.code = 416;
                            next(error);
                            return;
                        }
                        if (ranges !== -2 && ranges.length === 1) {

                            res.statusCode = 206;
                            res.setHeader('Content-Range', contentRange('bytes', len, ranges[0]));
                            offset += ranges[0].start;
                            len = ranges[0].end - ranges[0].start + 1;
                        }
                    }
                }
                res.setHeader('Content-Length', len);
            }
            if (req.method === 'HEAD') {

                res.end()
                return;
            }
            var gzip = gzipMaybe(req, res).on('error', function (err) {

                next(err);
            });
            pump(stream, gzip, res);
        }).catch(function (err) {

            next(err);
        });
    };
};