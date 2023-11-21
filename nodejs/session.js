import cryptojs from 'crypto-js';

var secretKey = 'test';

function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
    }));
}

function b64DecodeUnicode(str) {
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

export const createToken = function(session) {
    let sessionb64 = b64EncodeUnicode(JSON.stringify(session));
    return sessionb64+'.'+signSession(sessionb64);
}

export const parseToken = function(token) {
    if(token === undefined) {
        return {};
    }

    // format of the session token is in the form of:
    // <base64 encoded session data>.<signature>
    // the session data is in the form of JSON
    // the signature is a hex-encoded SHA256 hash
    // the base64 string concatenated with the secret key should hash to the signature

    let fmt = token.split('.');

    if(verifySession(fmt[0],fmt[1])) {
        return JSON.parse(b64DecodeUnicode(fmt[0]));
    } else {
        console.log("Invalid session");
        return {};
    }
}

function signSession(sessionb64) {
    return cryptojs.SHA256(sessionb64+secretKey).toString();
}

function verifySession(sessionb64, signature) {
    return signSession(sessionb64) === signature;
}