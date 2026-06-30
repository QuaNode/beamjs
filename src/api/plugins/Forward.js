/*jslint node: true */
"use strict";

var { URL } = require("url");
var debug = require("debug")("beam:Forward");
var inform = require("debug")("beam:Forward:info");
var netNative = require("net");
var httpNative = require("http");
var httpsNative = require("https");
var followRedirects = require("follow-redirects");

inform.log = console.log.bind(console);

var HTTPS = 443;
var HTTP = 80;
var TIMEOUT = 60000;

var upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i;
var isSSL = /^(https|wss|tls)/i;
var redirectRegex = /^201|30(1|2|7|8)$/;
var forwardRegex = /(?:^|;|,)\s*host=(?:"?\[?([^\]";:,]+|\[[^\]]+\])\]?:(\d+))/i;
var urlRegex = /^[a-z][a-z0-9+.-]*:\/\//i;
var ipv6Regex = /^\[|\]$/g;

var nativeAgents = { http: httpNative, https: httpsNative };

var hasEncryptedConnection = function (req) {

    var { connection } = req;
    return Boolean(connection.encrypted || connection.pair);
};

var getPort = function (req, target) {

    if (target) {

        let url = target;
        if (!url.includes("://")) {

            url = "http://" + url;
        }
        try {

            url = new URL(url);
            if (url.port) return url.port;
            if (isSSL.test(url.protocol)) {

                return "" + HTTPS;
            }
            return "" + HTTP;
        } catch { }
    }
    let headers = req.headers || {};
    if (headers[":authority"]) {

        try {

            let url = "http://";
            url += headers[":authority"];
            url = new URL(url);
            if (url.port) return url.port;
        } catch { }
    }
    if (headers.host) {

        try {

            let url = "http://";
            url += headers.host;
            url = new URL(url);
            if (url.port) return url.port;
        } catch { }
    }
    if (headers["x-forwarded-port"]) {

        let url = headers[
            "x-forwarded-port"
        ];
        let port = String(...[
            url
        ]).split(",")[0].trim();
        if (/^\d+$/.test(port)) {

            return port;
        }
    }
    if (headers.forwarded) {

        let match = String(...[
            headers.forwarded
        ]).match(forwardRegex);
        if (match) {

            return match[2];
        }
    }
    if (headers["x-forwarded-host"]) {

        try {

            let host = headers[
                "x-forwarded-host"
            ];
            host = String(...[
                host
            ]).split(",")[0].trim();
            let url = "http://" + host;
            url = new URL(url);
            if (url.port) return url.port;
        } catch { }
    }
    if (req.url && urlRegex.test(req.url)) {

        try {

            let url = new URL(req.url);
            if (url.port) return url.port;
            if (isSSL.test(url.protocol)) {

                return "" + HTTPS;
            }
        } catch { }
    }
    if (req.method === "CONNECT") {

        try {

            let url = "http://" + req.url;
            url = new URL(url);
            if (url.port) return url.port;
        } catch { }
    }
    if (hasEncryptedConnection(req)) {

        return "" + HTTPS;
    }
    return "" + HTTP;
};

var setupOutgoing = function (req, options) {

    var { target, setHost, trustHost } = options;
    var outgoing = {};
    outgoing.port = parseInt(getPort(req, target));
    if (!outgoing.port) {

        outgoing.port = (isSSL.test(target) ? HTTPS : HTTP);
    }
    outgoing.method = req.method;
    outgoing.headers = Object.assign({}, req.headers || {});
    if (setHost) {

        let { host, hostname } = new URL(target);
        if (typeof setHost === "string") {

            if (!setHost.includes("://")) {

                setHost = "http://" + setHost;
            }
            ({ host, hostname } = new URL(setHost));
        }
        hostname = hostname.replace(ipv6Regex, "");
        outgoing.servername = hostname;
        outgoing.headers["host"] = host;
    }
    if (trustHost) {

        outgoing.rejectUnauthorized = false;
        outgoing.checkServerIdentity = () => undefined;
    }
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

var setupSocket = function (socket) {

    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, TIMEOUT);
    return socket;
};

var handleNext = function (next, err) {

    if (err && next && !next.__called) {

        next(err);
        next.__called = true;
        return true;
    }
    return false;
};

var getOutgoingError = function () {

    var [
        incomingReq,
        incomingRes,
        outgoingReq,
        next,
        isProgressing
    ] = arguments;
    return function (err) {

        var aborting = incomingReq.socket.destroyed;
        aborting &= err.code === "ECONNRESET";
        aborting &= !outgoingReq.socket.destroyed;
        if (aborting) outgoingReq.destroy(); else {

            if (!incomingReq.socket.destroyed) {

                if (isProgressing()) {

                    let errMessage = "Outgoing error";
                    errMessage += " (" + err.code + "): ";
                    errMessage += err.message + " for (";
                    errMessage += incomingReq.method + " ";
                    var { originalUrl, url } = incomingReq;
                    errMessage += originalUrl || url;
                    errMessage += ")";
                    debug(errMessage);
                } else if (handleNext(next, err)) {

                    return true;
                }
                var responding = !!incomingRes;
                responding &= !incomingRes.writableEnded;
                if (responding) return false;
            }
        }
        return true;
    }
};

var getIncomingError = function () {

    var [
        outgoingReq,
        outgoingSocket,
        next,
        isProgressing
    ] = arguments;
    return function (err) {

        if (!outgoingReq.socket.destroyed) {

            if (!isProgressing()) {

                outgoingReq.destroy();
            } else {

                var sending = !!outgoingSocket;
                sending &= !outgoingSocket.writableEnded;
                if (sending) {

                    outgoingSocket.end();
                }
            }
        }
        handleNext(next, err);
    }
};

var responseAdaper = {

    removeChunked(req, _, proxyRes) {

        var chunked = proxyRes.headers[
            "transfer-encoding"
        ];
        if (req.httpVersion === "1.0") {

            delete proxyRes.headers["transfer-encoding"];
            delete proxyRes.headers["trailer"];
        } else if (chunked !== "chunked") {

            delete proxyRes.headers["trailer"];
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

        res.status(proxyRes.statusCode);
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
        var proxyResHeadersSent = false;
        var proxyClose = function () {

            if (!res.writableEnded) proxyReq.destroy();
        };
        var proxyCleanup = function () {

            req.socket.removeListener("close", proxyClose);
        };
        req.socket.on("close", proxyClose);
        res.on("finish", proxyCleanup);
        res.on("close", proxyCleanup);
        var proxyError = getOutgoingError(...[
            req, res, proxyReq, next,
            () => proxyResHeadersSent
        ]);
        req.on("error", getIncomingError(...[
            proxyReq,
            proxyReq.socket,
            next,
            () => proxyResHeadersSent
        ]));
        proxyReq.on("error", function (err) {

            if (!proxyError(err)) {

                res.writeHead(502);
                res.end();
            }
        });
        proxyReq.on("response", function (proxyRes) {

            if (!(proxyResHeadersSent = res.headersSent)) {

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
            if (!res.writableEnded) proxyRes.pipe(res);
        });
        req.pipe(proxyReq);
    }
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
        var proxyError = getOutgoingError(...[
            req, socket, proxyReq, next,
            () => proxyResUpgraded
        ]);
        socket.on("error", getIncomingError(...[
            proxyReq,
            null,
            next,
            () => proxyResUpgraded
        ]));
        proxyReq.on("error", function (err) {

            if (!proxyError(err)) {

                socket.end();
            }
        });
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
            proxySocket.on("error", proxyError);
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

var connectAdapter = {

    stream(req, socket, next, options, head) {

        let { target } = options;
        let { hostname } = new URL(target);
        hostname = hostname.replace(ipv6Regex, "");
        let port = parseInt(getPort(req, target));
        if (!port) {

            port = isSSL.test(target) ? HTTPS : HTTP;
        }
        socket.pause();
        var res = new httpNative.ServerResponse(req);
        res.assignSocket(socket);
        var proxySocket = netNative.connect(...[
            port, hostname
        ]);
        proxySocket.setTimeout(TIMEOUT);
        proxySocket.on("timeout", function () {

            let err = new Error(...[
                "Connection timed out"
            ]);
            err.code = 'ETIMEDOUT';
            if (!proxySocket.destroyed) {

                proxySocket.destroy(err);
            }
        });
        var proxySocketConnected = false;
        var socketClose = function () {

            if (!proxySocket) return;
            if (!proxySocket.destroyed) {

                proxySocket.destroy();
            }
        };
        var socketCleanup = function () {

            if (res) res.detachSocket(socket);
            socket.end();
        };
        res.once("finish", socketCleanup);
        socket.on("close", socketClose);
        var proxyReq = {

            socket: proxySocket,
            destroy: function () {

                var { destroy } = proxySocket;
                return destroy.bind(proxySocket);
            }()
        };
        var proxyError = getOutgoingError(...[
            req, res, proxyReq, next,
            () => proxySocketConnected
        ]);
        socket.on("error", getIncomingError(...[
            proxyReq,
            proxySocket,
            next,
            () => proxySocketConnected
        ]));
        proxySocket.on("error", function (err) {

            if (!proxyError(err)) {

                if (res) {

                    if (err.code === "ENOTFOUND") {

                        res.writeHead(404);
                    } else res.writeHead(502);
                    res.end();
                } else socket.end();
            }
        });
        proxySocket.on("connect", function () {

            proxySocketConnected = true;
            if (res) {

                res.removeListener(...[
                    "finish", socketCleanup
                ]);
                res.writeHead(...[
                    200, "Connection Established"
                ]);
                res.flushHeaders();
                res.detachSocket(socket);
                res = null;
            }
            if (head && head.length) {

                proxySocket.write(head);
            }
            socket.pipe(proxySocket);
            proxySocket.pipe(socket);
        });
        proxySocket.on("close", function () {

            socket.destroy();
        });
        proxySocket.on("timeout", function () {

            proxySocket.destroy(...[
                new Error("Upstream timeout")
            ]);
        });
        setupSocket(proxySocket);
        setupSocket(socket);
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
        let sourceMessage = req.method + " ";
        sourceMessage += req.originalUrl || req.url;
        if (typeof host !== "string" || host.length === 0) {

            let errMessage = "Invalid request host of ";
            errMessage += "(" + sourceMessage + ")";
            debug(errMessage);
            handleNext(next, new Error(errMessage));
            return false;
        }
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

                target = options.target(path, host, req);
            } else target = new URL(path, host).href;
            var untargeting = typeof target !== "string";
            if (!untargeting) untargeting |= target.length === 0;
            if (untargeting) {

                let errMessage = "Invalid request target of ";
                errMessage += "(" + sourceMessage + ")";
                debug(errMessage);
                class URIBlocked extends URIError {

                    forbidden() { }
                }
                handleNext(next, new URIBlocked(errMessage));
                return false;
            } else {

                var targetMessage = sourceMessage;
                targetMessage += " -> " + target;
                inform(targetMessage);
            }
        } catch (err) {

            debug(err);
            handleNext(next, err);
            return false;
        }
        var öptions = Object.assign({}, options, {

            target
        });
        var webProxy = createProxy(webAdapter, öptions);
        var wsProxy = createProxy(wsAdapter, öptions);
        var connectProxy = createProxy(connectAdapter, öptions);
        if (req.method === "CONNECT") connectProxy(...[
            req,
            res,
            next,
            head
        ]); else if (head instanceof Buffer) wsProxy(...[
            req,
            res,
            next,
            head
        ]); else webProxy(req, res, next);
        return true;
    };
};