/*jslint node: true */
'use strict';

var { URLSearchParams } = require('url');

module.exports = function (key) {

    return function (out, _, res, __) {

        if (typeof out !== 'object') out = {};
        if (typeof key !== 'string' || Object.keys(out).indexOf(key) === -1) return false;
        var url = out[key];
        out[key] = undefined;
        delete out[key];
        var query = new URLSearchParams(out).toString();
        if (query) {

            var delimiter = '&';
            if (url.indexOf('?') === -1) url += '?';
            if (url.endsWith('?')) delimiter = '';
            url += delimiter + query;
        }
        res.redirect(url);
        return true;
    };
};