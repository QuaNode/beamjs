/*jslint node: true */
"use strict";

var crypto = require("crypto");

module.exports = function (_, hooks, sequelize) {

    var hash = function (password, options) {

        var {
            salt,
            saltlen,
            iterations
        } = (options || {});
        if (salt) {

            saltlen = salt.length;
        } else {

            if (!saltlen) saltlen = 64;
            salt = crypto.randomBytes(saltlen);
        }
        if (!iterations) iterations = 10000;
        var hashed = crypto.pbkdf2Sync(...[
            password,
            salt,
            iterations,
            saltlen,
            "sha256"
        ]);
        var value = "pkdf2$" + iterations + "$";
        value += salt.toString("hex") + "$";
        value += hashed.toString("hex");
        return value;
    };
    var verify = function () {

        var [
            password,
            hashed
        ] = arguments;
        var split = hashed.split("$");
        if (split.length !== 4) {

            throw new Error("Invalid password" +
                " hash provided");
        }
        var salt = new Buffer(split[2], "hex"),
            saltlen = salt.length,
            iterations = Number(split[1]);
        var options = {

            salt,
            saltlen,
            iterations
        };
        var verified = hash(...[
            password,
            options
        ]);
        /* perform the comparison in a constant time to avoid timing attacks
            - see http://carlos.bueno.org/2011/10/timing.html
        */
        if (hashed.length === verified.length) {

            var diff = 0;
            for (var i = 0; i < hashed.length; ++i) {

                var h_c_i = hashed.charCodeAt(i);
                var v_c_i = verified.charCodeAt(i);
                diff |= h_c_i ^ v_c_i;
            }
            return diff === 0;
        } else {

            return false;
        }
    };
    hooks.on("beforeDefine", function () {

        var [attributes] = arguments;
        var {
            TEXT,
            VIRTUAL
        } = sequelize.Sequelize.DataTypes;
        attributes.hashed_password = {

            type: TEXT
        };
        attributes.password = {

            type: VIRTUAL,
            set(password) {

                this.setDataValue(...[
                    "hashed_password",
                    hash(password)
                ]);
            }
        };
    });
    hooks.on("afterDefine", function () {

        var [Model] = arguments;
        var { prototype } = Model;
        prototype.verifyPassword = function () {

            var [password] = arguments;
            if (this.getDataValue(...[
                "hashed_password"
            ])) {

                return verify(...[
                    password,
                    this.getDataValue(...[
                        "hashed_password"
                    ])
                ]);
            } else return false;
        };
    });
};