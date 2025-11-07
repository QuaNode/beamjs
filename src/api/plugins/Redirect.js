/*jslint node: true */
"use strict";

var { URLSearchParams } = require("url");

module.exports = function (key, permanent) {

    return function (out, req, res, __) {

        if (typeof out !== "object") out = {};
        if (typeof key !== "string") return false;
        if (Object.keys(out).indexOf(key) === -1) return false;
        var url = out[key];
        out[key] = undefined;
        delete out[key];
        var query = new URLSearchParams(out).toString();
        if (query) {

            var delimiter = "&";
            if (url.indexOf("?") === -1) url += "?";
            if (url.endsWith("?")) delimiter = "";
            url += delimiter + query;
        }
        var method = req.method.toUpperCase();
        if (method != "GET") {
            res.redirect(permanent ? 308 : 307, url);
        } else if (method == "GET" && permanent) {
            res.redirect(301, url);
        } else res.redirect(url);
        return true;
    };
};