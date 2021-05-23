/*jslint node: true */
'use strict';

var querystring = require('querystring');

module.exports = function (key) {

    return function (out, req, res, next) {

        if (typeof out !== 'object') out = {};
        if (typeof key !== 'string' || Object.keys(out).indexOf(key) === -1) return false;
        var url = out[key];
        out[key] = undefined;
        delete out[key];
        var query = querystring.stringify(out);
        var delimiter = '&';
        if (url.indexOf('?') === -1) url += '?';
        if (url.endsWith('?')) delimiter = '';
        url += delimiter + query;
        res.redirect(url);
        return true;
    };
};