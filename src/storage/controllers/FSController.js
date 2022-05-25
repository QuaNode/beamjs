/*jslint node: true */
/*jshint esversion: 6 */
'use strict';

var fs = require('fs');
var { Writable } = require('stream');
var { resolve } = require('path');
var parseRange = require('range-parser');

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
    self.loadResource = function () {

        var [
            resource,
            stream,
            callback
        ] = arguments;
        var error;
        if (typeof resource !== 'object') {

            callback(...[
                null,
                new Error('Invalid resource object')
            ]);
            return function () { };
        }
        var path = resource.path;
        if (!path) path = resource.url;
        var invalid = typeof path !== 'string';
        if (!invalid) invalid |= path.length === 0;
        if (invalid) {

            callback(...[
                null,
                new Error('Invalid resource url')
            ]);
            return function () { };
        }
        path = decode(path);
        if (path === -1) {

            callback(...[
                null,
                new Error('Invalid resource url')
            ]);
            return function () { };
        }
        if (~path.indexOf('\0')) {

            callback(...[
                null,
                new Error('Invalid resource url')
            ]);
            return function () { };
        }
        if (UP_PATH_REGEXP.test(path)) {

            callback(...[
                null,
                new Error('Invalid resource url')
            ]);
            return function () { };
        }
        path = resource.path = resolve(path);
        if (!fs.existsSync(path)) {

            error = new Error('Resource is not' +
                ' existed');
            error.code = 404;
            callback(null, error);
            return function () { };
        }
        var stats = fs.statSync(path);
        resource.stats = stats;
        if (!stats.isFile()) {

            error = new Error('Resource is not' +
                ' a file');
            error.code = 400;
            callback(null, error);
            return function () { };
        }
        try {

            fs.accessSync(...[
                path,
                fs.constants.R_OK
            ]);
        } catch {

            callback(...[
                null,
                new Error('Missing read permission' +
                    ' for the resource')
            ]);
            return function () { };
        }
        var {
            ranges,
            start,
            end,
            buffer_size
        } = resource;
        var ranging = typeof ranges === 'string';
        if (ranging) {

            ranging &= ranges.length > 0;
        }
        if (ranging) {

            var ranges = parseRange(...[
                stats.size,
                ranges,
                {
                    combine: true
                }
            ]);
            ranging = Array.isArray(ranges);
            if (ranging) {

                ranging &= ranges.length === 1;
                ranging &= ranges.type === 'bytes';
            }
            if (ranging) Object.assign(...[
                resource,
                ranges[0]
            ]);
        }
        var starting = typeof start === 'number';
        invalid = starting;
        if (invalid) {

            invalid = !(start >= 0);
            var { size } = stats;
            invalid |= !(start < end || start < size);
        }
        if (invalid) {

            callback(...[
                null,
                new Error('Invalid resource reading' +
                    ' start')
            ]);
            return function () { };
        }
        var ending = typeof end === 'number';
        invalid = ending;
        if (invalid) {

            invalid = !(stats.size > end);
            invalid |= !(start < end || 0 < end);
        }
        if (invalid) {

            error = new Error('Invalid resource reading' +
                ' end');
            error.code = 400;
            callback(null, error);
            return function () { };
        }
        var streaming = typeof stream === 'function';
        var buffering = typeof buffer_size === 'number';
        invalid = streaming;
        invalid &= buffering;
        if (invalid) {

            var size = buffer_size;
            invalid = !(stats.size > size);
            invalid |= !(size <= MAX_READ_SIZE);
            var diff = end - start;
            invalid |= !(size <= diff || 0 < size);
        }
        if (invalid) {

            error = new Error('Invalid resource buffer' +
                ' size');
            error.code = 400;
            callback(null, error);
            return function () { };
        }
        var reader = fs.createReadStream(...[
            path,
            {
                start: starting ? start : undefined,
                end: ending ? end : undefined,
                highWaterMark: buffering ? buffer_size : READ_SIZE
            }
        ]);
        var writing = stream instanceof Writable;
        if (writing || streaming) {

            if (writing) reader.pipe(stream);
            else if (streaming) stream(reader);
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

            if (!reader.readableEnded) {

                reader.destroy();
            }
        };
    };
};

ResourceController.prototype.constructor = ResourceController;

module.exports.getResourceControllerObject = function () {

    return new ResourceController();
};