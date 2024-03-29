/*jslint node: true */
"use strict";

var { URL } = require("url");
var debug = require("debug")("beam:Forward");
var inform = require("debug")("beam:Forward:info");
var httpNative = require("http");
var httpsNative = require("https");
var followRedirects = require("follow-redirects");

inform.log = console.log.bind(console);

var upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i;
var isSSL = /^https|wss/;
var redirectRegex = /^201|30(1|2|7|8)$/;

var nativeAgents = { http: httpNative, https: httpsNative };

var hasEncryptedConnection = function (req) {

    var { connection } = req;
    return Boolean(connection.encrypted || connection.pair);
};

var getPort = function (req, target) {

    var ports = target ? target.match(/:(\d+)/) : "";
    if (ports) return ports[1];
    var { host } = req.headers;
    ports = host ? host.match(/:(\d+)/) : "";
    if (ports) return ports[1];
    if (hasEncryptedConnection(req)) return "443";
    return "80";
};

var setupOutgoing = function (req, options) {

    var { target, setHost, reverse } = options;
    var outgoing = {};
    outgoing.port = parseInt(getPort(req, target));
    if (!outgoing.port) {

        outgoing.port = (isSSL.test(target) ? 443 : 80);
    }
    outgoing.method = req.method;
    outgoing.headers = Object.assign({}, req.headers || {});
    if (setHost) {

        outgoing.headers["host"] = new URL(target).host;
    } else if (reverse) outgoing.rejectUnauthorized = false;
    outgoing.agent = false;
    var { headers } = outgoing;
    var { connection } = headers;
    var closing = typeof connection !== "string";
    if (!closing) {

        closing |= !upgradeHeader.test(connection);
    }
    if (closing) headers.connection = "close";
    return outgoing;
};

var responseAdaper = {

    removeChunked(req, _, proxyRes) {

        if (req.httpVersion === "1.0") {

            delete proxyRes.headers["transfer-encoding"];
        }
    },
    setConnection(req, _, proxyRes) {

        var headers = proxyRes.headers;
        var { connection } = req.headers;
        var setting = !headers.connection;
        if (req.httpVersion === "1.0") {

            headers.connection = connection || "close";
        } else if (req.httpVersion !== "2.0" && setting) {

            headers.connection = connection || "keep-alive";
        }
    },
    setRedirectHostRewrite(req, _, proxyRes, options) {

        var redirecting = !options.reverse;
        redirecting &= !!proxyRes.headers["location"];
        redirecting &= redirectRegex.test(proxyRes.statusCode);
        if (redirecting) {

            var target = new URL(options.target);
            var location = new URL(proxyRes.headers["location"]);
            if (target.host == location.host) return;
            location.host = req.headers["host"];
            proxyRes.headers["location"] = location.href;
        }
    },
    writeHeaders(_, res, proxyRes) {

        var rawHeaderKeyMap;
        var setHeader = function (key, header) {

            if (header == undefined) return;
            res.setHeader(String(key).trim(), header);
        };
        if (proxyRes.rawHeaders != undefined) {

            rawHeaderKeyMap = {};
            for (var i = 0; i < proxyRes.rawHeaders.length; i += 2) {

                var key = proxyRes.rawHeaders[i];
                rawHeaderKeyMap[key.toLowerCase()] = key;
            }
        }
        Object.keys(proxyRes.headers).forEach(function (key) {

            var header = proxyRes.headers[key];
            if (rawHeaderKeyMap) key = rawHeaderKeyMap[key] || key;
            setHeader(key, header);
        });
    },
    writeStatusCode(_, res, proxyRes) {

        res.statusCode = proxyRes.statusCode;
        if (proxyRes.statusMessage) {

            res.statusMessage = proxyRes.statusMessage;
        }
    }
};

var webAdapter = {

    deleteLength(req) {

        var deleting = req.method === "DELETE";
        deleting |= req.method === "OPTIONS";
        if (deleting && !req.headers["content-length"]) {

            req.headers["content-length"] = "0";
            delete req.headers["transfer-encoding"];
        }
    },
    timeout(req, _, __, options) {

        if (!isNaN(parseInt(options.timeout))) {

            req.socket.setTimeout(options.timeout);
        }
    },
    XHeaders(req, _, __, options) {

        if (!options.reverse) return;
        var encrypted = req.isSpdy || hasEncryptedConnection(req);
        var { remoteAddress } = req.connection;
        if (!remoteAddress) {

            remoteAddress = req.socket.remoteAddress;
        }
        var values = {

            for: remoteAddress,
            port: getPort(req, options.target),
            proto: encrypted ? "https" : "http"
        };
        ["for", "port", "proto"].forEach(function (header) {

            var x_forwarded = req.headers["x-forwarded-" + header];
            if (!x_forwarded) x_forwarded = "";
            x_forwarded += x_forwarded ? "," : "";
            x_forwarded += values[header];
            req.headers["x-forwarded-" + header] = x_forwarded;
        });
        var x_forwarded_host = req.headers["x-forwarded-host"];
        if (!x_forwarded_host) {

            x_forwarded_host = req.headers["host"];
        }
        if (!x_forwarded_host) x_forwarded_host = "";
        req.headers["x-forwarded-host"] = x_forwarded_host;
    },
    stream(req, res, next, options) {

        var agents = nativeAgents;
        if (options.followRedirects) agents = followRedirects;
        var http = agents.http;
        var https = agents.https;
        var proxyReq = (isSSL.test(...[
            options.target
        ]) ? https : http).request(...[
            options.target,
            setupOutgoing(req, options)
        ]);
        req.on("aborted", function () {

            proxyReq.destroy();
        });
        var proxyError = function (err) {

            var aborting = req.socket.destroyed;
            aborting &= err.code === "ECONNRESET";
            aborting &= !proxyReq.socket.destroyed;
            if (aborting) proxyReq.destroy(); else {

                if (!req.socket.destroyed) next(err);
            }
        };
        req.on("error", proxyError);
        proxyReq.on("error", proxyError);
        proxyReq.on("response", function (proxyRes) {

            if (!res.headersSent) {

                var functions = Object.keys(...[
                    responseAdaper
                ]).map(function (key) {

                    return responseAdaper[key];
                });
                for (var i = 0; i < functions.length; i++) {

                    if (functions[i](...[
                        req,
                        res,
                        proxyRes,
                        options
                    ])) break;
                }
            }
            if (!res.finished) proxyRes.pipe(res);
        });
        req.pipe(proxyReq);
    }
};

var setupSocket = function (socket) {

    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 0);
    return socket;
};

var wsAdapter = {

    checkMethodAndHeader(req, socket) {

        var { upgrade } = req.headers;
        var destroying = req.method !== "GET";
        if (!destroying) destroying &= !upgrade;
        if (!destroying) {

            destroying &= upgrade.toLowerCase() !== "websocket";
        }
        if (destroying) {

            socket.destroy();
            return true;
        }
    },
    XHeaders(req, _, __, options) {

        if (!options.reverse) return;
        var { remoteAddress } = req.connection;
        if (!remoteAddress) {

            remoteAddress = req.socket.remoteAddress;
        }
        var values = {

            for: remoteAddress,
            port: getPort(req, options.target),
            proto: hasEncryptedConnection(req) ? "wss" : "ws"
        };
        ["for", "port", "proto"].forEach(function (header) {

            var x_forwarded = req.headers["x-forwarded-" + header];
            if (!x_forwarded) x_forwarded = "";
            x_forwarded += x_forwarded ? "," : "";
            x_forwarded += values[header];
            req.headers["x-forwarded-" + header] = x_forwarded;
        });
    },
    stream(req, socket, next, options, head) {

        var createHttpHeader = function (line, headers) {

            return Object.keys(headers).reduce(function () {

                var [head, key] = arguments;
                var value = headers[key];
                if (!Array.isArray(value)) {

                    head.push(key + ": " + value);
                    return head;
                }
                for (var i = 0; i < value.length; i++) {

                    head.push(key + ": " + value[i]);
                }
                return head;
            }, [line]).join("\r\n") + "\r\n\r\n";
        };
        var onOutgoingError = function (err) {

            if (next) next(err); else socket.end();
        };
        setupSocket(socket);
        if (head && head.length) socket.unshift(head);
        var agents = nativeAgents;
        if (options.followRedirects) agents = followRedirects;
        var http = agents.http;
        var https = agents.https;
        var proxyReq = (isSSL.test(...[
            options.target
        ]) ? https : http).request(...[
            options.target,
            setupOutgoing(req, options)
        ]);
        var proxyResUpgraded = false;
        socket.on("error", function (err) {

            if (!proxyResUpgraded) proxyReq.destroy();
        });
        proxyReq.on("error", onOutgoingError);
        proxyReq.on("response", function (res) {

            if (!(proxyResUpgraded = res.upgrade)) {

                var httpHeader = "HTTP/" + res.httpVersion;
                httpHeader += " " + res.statusCode;
                httpHeader += " " + res.statusMessage;
                socket.write(createHttpHeader(...[
                    httpHeader,
                    res.headers
                ]));
                res.pipe(socket);
            }
        });
        proxyReq.on("upgrade", function () {

            var [
                proxyRes,
                proxySocket,
                proxyHead
            ] = arguments;
            proxySocket.on("error", onOutgoingError);
            socket.on("error", function () {

                proxySocket.end();
            });
            setupSocket(proxySocket);
            var unshifting = !!proxyHead;
            if (unshifting) unshifting &= !!proxyHead.length;
            if (unshifting) proxySocket.unshift(proxyHead);
            socket.write(createHttpHeader(...[
                "HTTP/1.1 101 Switching Protocols",
                proxyRes.headers
            ]));
            proxySocket.pipe(socket).pipe(proxySocket);
        });
        proxyReq.end();
    }
};

var createProxy = function (adapter, options) {

    return function (req, res, next, head) {

        var functions = Object.keys(...[
            adapter
        ]).map(function (key) {

            return adapter[key];
        });
        for (var i = 0; i < functions.length; i++) {

            if (functions[i](...[
                req,
                res,
                next,
                options,
                head
            ])) break;
        }
    };
};

module.exports = function (host, options) {

    var hosts = [];
    var many = Array.isArray(host);
    if (many) host.forEach(function (entry) {

        if (!entry) return;
        if (typeof entry !== "object") return;
        if (typeof entry.host !== "string") return;
        if (entry.host.length === 0) return;
        if (typeof entry.path !== "string") return;
        if (entry.path.length === 0) return;
        entry.health = true;
        hosts.push(entry);
        var probing = false;
        setInterval(function () {

            var {
                http,
                https
            } = nativeAgents;
            var health_url = new URL(...[
                entry.path,
                entry.host
            ]).href;
            if (probing) return;
            probing = true;
            var health_req = (isSSL.test(...[
                health_url
            ]) ? https : http).get(...[
                health_url
            ]).on("timeout", function () {

                health_req.destroy(new Error("Timeout"));
            }).on("error", function () {

                probing = false;
                entry.health = false;
                debug(entry.host + " is down");
            }).on("response", function (res) {

                probing = false;
                entry.health = res.statusCode == 200;
                var health = entry.health ? "up" : "down";
                inform(entry.host + " is " + health);
            });
            health_req.setTimeout(4000);
        }, 5000);
    });
    if (hosts.length > 0) host = hosts[0].host;
    if (typeof options != "object") options = {};
    return function (req, res, next, head) {

        hosts.some(function (entry) {

            if (entry.health) {

                host = entry.host;
                return true;
            }
            return false;
        });
        if (typeof host !== "string") return false;
        if (host.length === 0) return false;
        inform(host);
        var target;
        var path = "";
        var targeting = typeof options.target === "string";
        if (targeting) targeting &= options.target.length > 0;
        if (targeting) {

            if (options.target.startsWith("/")) {

                path = options.target;
            } else host = options.target;
        } else path = req.originalUrl || req.url;
        try {

            if (typeof options.target === "function") {

                target = options.target(path, host);
            } else target = new URL(path, host).href;
            var untargeting = typeof target !== "string";
            if (!untargeting) untargeting |= target.length === 0;
            if (untargeting) {

                throw new Error("Invalid request target");
            }
        } catch (err) {

            debug(err);
            return false;
        }
        var öptions = Object.assign({}, options, {

            target
        });
        var webProxy = createProxy(webAdapter, öptions);
        var wsProxy = createProxy(wsAdapter, öptions);
        if (head instanceof Buffer) wsProxy(...[
            req,
            res,
            next,
            head
        ]); else webProxy(req, res, next);
        return true;
    };
};