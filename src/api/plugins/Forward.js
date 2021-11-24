/*jslint node: true */
'use strict';

var { URL } = require('url');
var debug = require('debug')('beam:Forward');
var httpNative = require('http');
var httpsNative = require('https');
var followRedirects = require('follow-redirects');

var upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i;
var isSSL = /^https|wss/;
var redirectRegex = /^201|30(1|2|7|8)$/;

var nativeAgents = { http: httpNative, https: httpsNative };

var hasEncryptedConnection = function (req) {

    return Boolean(req.connection.encrypted || req.connection.pair);
};

var getPort = function (req, target) {

    var ports = target ? target.match(/:(\d+)/) : '';
    if (ports) return ports[1];
    ports = req.headers.host ? req.headers.host.match(/:(\d+)/) : '';
    return ports ? ports[1] : hasEncryptedConnection(req) ? '443' : '80';
};

var setupOutgoing = function (req, options) {

    var outgoing = {};
    outgoing.port = parseInt(getPort(req, options.target));
    if (!outgoing.port) outgoing.port = (isSSL.test(options.target) ? 443 : 80);
    outgoing.method = req.method;
    outgoing.headers = Object.assign({}, req.headers || {});
    outgoing.agent = false;
    if (typeof outgoing.headers.connection !== 'string' ||
        !upgradeHeader.test(outgoing.headers.connection)) {

        outgoing.headers.connection = 'close';
    }
    return outgoing;
};

var responseAdaper = {

    removeChunked: function (req, _, proxyRes) {

        if (req.httpVersion === '1.0') {

            delete proxyRes.headers['transfer-encoding'];
        }
    },
    setConnection: function (req, _, proxyRes) {

        if (req.httpVersion === '1.0') {

            proxyRes.headers.connection = req.headers.connection || 'close';
        } else if (req.httpVersion !== '2.0' && !proxyRes.headers.connection) {

            proxyRes.headers.connection = req.headers.connection || 'keep-alive';
        }
    },
    setRedirectHostRewrite: function (req, _, proxyRes, options) {

        if (!options.reverse && proxyRes.headers['location'] && redirectRegex.test(proxyRes.statusCode)) {

            var target = new URL(options.target);
            var u = new URL(proxyRes.headers['location']);
            if (target.host == u.host) return;
            u.host = req.headers['host'];
            proxyRes.headers['location'] = u.href;
        }
    },
    writeHeaders: function (_, res, proxyRes) {

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
    writeStatusCode: function (_, res, proxyRes) {

        res.statusCode = proxyRes.statusCode;
        if (proxyRes.statusMessage) res.statusMessage = proxyRes.statusMessage;
    }
};

var webAdapter = {

    deleteLength: function (req) {

        if ((req.method === 'DELETE' || req.method === 'OPTIONS') && !req.headers['content-length']) {

            req.headers['content-length'] = '0';
            delete req.headers['transfer-encoding'];
        }
    },
    timeout: function timeout(req, _, __, options) {

        if (!isNaN(parseInt(options.timeout))) {

            req.socket.setTimeout(options.timeout);
        }
    },
    XHeaders: function (req, _, __, options) {

        if (!options.reverse) return;
        var encrypted = req.isSpdy || hasEncryptedConnection(req);
        var values = {

            for: req.connection.remoteAddress || req.socket.remoteAddress,
            port: getPort(req, options.target),
            proto: encrypted ? 'https' : 'http'
        };
        ['for', 'port', 'proto'].forEach(function (header) {

            req.headers['x-forwarded-' + header] = (req.headers['x-forwarded-' + header] || '') +
                (req.headers['x-forwarded-' + header] ? ',' : '') + values[header];
        });
        req.headers['x-forwarded-host'] = req.headers['x-forwarded-host'] || req.headers['host'] || '';
    },
    stream: function (req, res, next, options) {

        var agents = options.followRedirects ? followRedirects : nativeAgents;
        var http = agents.http;
        var https = agents.https;
        var proxyReq =
            (isSSL.test(options.target) ? https : http).request(options.target, setupOutgoing(req, options));
        req.on('aborted', function () {

            proxyReq.abort();
        });
        var proxyError = function (err) {

            if (req.socket.destroyed && err.code === 'ECONNRESET') {

                proxyReq.abort();
                next(err);
                return;
            }
        };
        req.on('error', proxyError);
        proxyReq.on('error', proxyError);
        proxyReq.on('response', function (proxyRes) {

            if (!res.headersSent) {

                var functions = Object.keys(responseAdaper).map(function (key) {

                    return responseAdaper[key];
                });
                for (var i = 0; i < functions.length; i++) {

                    if (functions[i](req, res, proxyRes, options)) break;
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

    checkMethodAndHeader: function (req, socket) {

        if (req.method !== 'GET' || !req.headers.upgrade) {

            socket.destroy();
            return true;
        }
        if (req.headers.upgrade.toLowerCase() !== 'websocket') {

            socket.destroy();
            return true;
        }
    },
    XHeaders: function (req, _, __, options) {

        if (!options.reverse) return;
        var values = {

            for: req.connection.remoteAddress || req.socket.remoteAddress,
            port: getPort(req, options.target),
            proto: hasEncryptedConnection(req) ? 'wss' : 'ws'
        };
        ['for', 'port', 'proto'].forEach(function (header) {

            req.headers['x-forwarded-' + header] = (req.headers['x-forwarded-' + header] || '') +
                (req.headers['x-forwarded-' + header] ? ',' : '') + values[header];
        });
    },
    stream: function (req, socket, next, options, head) {

        var createHttpHeader = function (line, headers) {

            return Object.keys(headers).reduce(function (head, key) {

                var value = headers[key];
                if (!Array.isArray(value)) {

                    head.push(key + ': ' + value);
                    return head;
                }
                for (var i = 0; i < value.length; i++) {

                    head.push(key + ': ' + value[i]);
                }
                return head;
            }, [line]).join('\r\n') + '\r\n\r\n';
        };
        var onOutgoingError = function (err) {

            if (next) next(err);
            else socket.end();
        };
        setupSocket(socket);
        if (head && head.length) socket.unshift(head);
        var agents = options.followRedirects ? followRedirects : nativeAgents;
        var http = agents.http;
        var https = agents.https;
        var proxyReq =
            (isSSL.test(options.target) ? https : http).request(options.target, setupOutgoing(req, options));
        proxyReq.on('error', onOutgoingError);
        proxyReq.on('response', function (res) {

            if (!res.upgrade) {

                socket.write(createHttpHeader('HTTP/' + res.httpVersion + ' ' + res.statusCode + ' ' +
                    res.statusMessage, res.headers));
                res.pipe(socket);
            }
        });
        proxyReq.on('upgrade', function (proxyRes, proxySocket, proxyHead) {

            proxySocket.on('error', onOutgoingError);
            socket.on('error', function (err) {

                proxySocket.end();
                if (next) next(err);
            });
            setupSocket(proxySocket);
            if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
            socket.write(createHttpHeader('HTTP/1.1 101 Switching Protocols', proxyRes.headers));
            proxySocket.pipe(socket).pipe(proxySocket);
        });
        proxyReq.end();
    }
};

var createProxy = function (adapter, options) {

    return function (req, res, next, head) {

        var functions = Object.keys(adapter).map(function (key) {

            return adapter[key];
        });
        for (var i = 0; i < functions.length; i++) {

            if (functions[i](req, res, next, options, head)) break;
        }
    };
};

module.exports = function (host, options) {

    var hosts = [];
    if (Array.isArray(host)) host.forEach(function (entry) {

        if (!entry || typeof entry !== 'object') return;
        if (typeof entry.host !== 'string' || entry.host.length === 0) return;
        if (typeof entry.path !== 'string' || entry.path.length === 0) return;
        entry.health = true;
        hosts.push(entry);
        setInterval(function () {

            var http = nativeAgents.http;
            var https = nativeAgents.https;
            var health_url = new URL(entry.path, entry.host).href;
            (isSSL.test(health_url) ? https : http).get(health_url).on('error', function () {

                entry.health = false;
            }).on('response', function (res) {

                entry.health = res.statusCode == 200;
            });
        }, 5000);
    });
    if (hosts.length > 0) host = hosts[0].host;
    if (typeof options != 'object') options = {};
    return function (req, res, next, head) {

        hosts.some(function (entry) {

            if (entry.health) {

                host = entry.host;
                return true;
            }
            return false;
        });
        if (typeof host !== 'string' || host.length === 0) return false;
        var target;
        var path = '';
        if (typeof options.target === 'string' && options.target.length > 0) {

            if (options.target.startsWith('/')) path = options.target;
            else host = options.target;
        } else path = req.originalUrl || req.url;
        try {

            target = typeof options.target === 'function' ? options.target(path, host) :
                new URL(path, host).href;
            if (typeof target !== 'string' || target.length === 0)
                throw new Error('Invalid request target');
        } catch (err) {

            debug(err);
            return false;
        }
        var öptions = Object.assign({}, options, {

            target: target
        });
        var webProxy = createProxy(webAdapter, öptions);
        var wsProxy = createProxy(wsAdapter, öptions);
        if (head instanceof Buffer) wsProxy(req, res, next, head);
        else webProxy(req, res, next);
        return true;
    };
};