/*jslint node: true */
/*jshint esversion: 6 */
'use strict';

var fs = require('fs');
var Writable = require('stream').Writable;
var resolve = require('path').resolve;

var MAX_READ_SIZE = 5 * 1024 * 1024;
var READ_SIZE = 64 * 1024;
var UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/;

var decode = function (path) {

    try {

        return decodeURIComponent(path);
    } catch (err) {

        return -1;
    }
};

var ResourceController = function () {

    var self = this;
    self.loadResource = function (resource, stream, callback) {

        var error;
        if (typeof resource !== 'object') {

            callback(null, new Error('Invalid resource object'));
            return function () { };
        }
        var path = resource.path || resource.url;
        if (typeof path !== 'string' || path.length === 0) {

            callback(null, new Error('Invalid resource url'));
            return function () { };
        }
        path = decode(path);
        if (path === -1) {

            callback(null, new Error('Invalid resource url'));
            return function () { };
        }
        if (~path.indexOf('\0')) {

            callback(null, new Error('Invalid resource url'));
            return function () { };
        }
        if (UP_PATH_REGEXP.test(path)) {

            callback(null, new Error('Invalid resource url'));
            return function () { };
        }
        path = resource.path = resolve(path);
        if (!fs.existsSync(path)) {

            error = new Error('Resource is not existed');
            error.code = 404;
            callback(null, error);
            return function () { };
        }
        var stats = resource.stats = fs.statSync(path);
        if (!stats.isFile()) {

            error = new Error('Resource is not a file');
            error.code = 400;
            callback(null, error);
            return function () { };
        }
        try {

            fs.accessSync(path, fs.constants.R_OK);
        } catch {

            callback(null, new Error('Missing read permission for the resource'));
            return function () { };
        }
        if (typeof resource.start === 'number' && (!(resource.start >= 0) ||
            !(resource.start < resource.end || resource.start < stats.size))) {

            callback(null, new Error('Invalid resource reading start'));
            return function () { };
        }
        if (typeof resource.end === 'number' && (!(stats.size > resource.end) ||
            !(resource.start < resource.end || 0 < resource.end))) {

            error = new Error('Invalid resource reading end');
            error.code = 400;
            callback(null, error);
            return function () { };
        }
        if (typeof stream === 'function' && typeof resource.buffer_size === 'number' &&
            (!(stats.size > resource.buffer_size) || !(resource.buffer_size <= MAX_READ_SIZE) ||
                !(resource.buffer_size <= (resource.end - resource.start) ||
                    0 < resource.buffer_size))) {

            error = new Error('Invalid resource buffer size');
            error.code = 400;
            callback(null, error);
            return function () { };
        }
        var reader = fs.createReadStream(path, {

            start: typeof resource.start === 'number' ? resource.start : undefined,
            end: typeof resource.end === 'number' ? resource.end : undefined,
            highWaterMark:
                typeof resource.buffer_size === 'number' ? resource.buffer_size : READ_SIZE
        });
        if (stream instanceof Writable || typeof stream === 'function') {

            if (stream instanceof Writable) reader.pipe(stream);
            else if (typeof stream === 'function') stream(reader);
            resource.stream = reader;
            callback(resource);
        } else {

            var data = [];
            reader.on('data', function (chunk) {

                data.push(chunk);
            }).on('end', function () {

                resource.data = data;
                callback(resource);
            }).on('error', function (err) {

                callback(null, err);
            });
        }
        return function () {

            if (!reader.readableEnded) reader.end();
        };
    };
};

ResourceController.prototype.constructor = ResourceController;

module.exports.getResourceControllerObject = function (options, cb) {

    return new ResourceController();
};