// Load modules

var Hoek = require('hoek')
var fs = require('fs')

// Declare internals

var internals = {}


internals.defaults = {
    maxByteSize: 100 * 1024 * 1024, // 100MB
    saveDebounce: 500, // 0.5 seconds
    cacheFile: './catbox.json'
}

function noop() {}
function throwop() { if (error) throw error }
function safeTimeout(callback, timeout) {
    if (timeout > 2147483647)
        return null
    return setTimeout(callback, timeout)
}

exports = module.exports = internals.Connection = function (options) {
    Hoek.assert(this.constructor === internals.Connection, 'Client must be instantiated using new')
    Hoek.assert(!options || options.maxByteSize === undefined || options.maxByteSize >= 0, 'Invalid cache maxByteSize value')
    Hoek.assert(!options || options.saveDebounce === undefined || options.saveDebounce >= 0, 'Invalid cache saveDebounce value')
    Hoek.assert(!options || options.cacheFile === undefined || typeof options.cacheFile == 'string', 'Invalid cacheFile value')

    this.settings = Hoek.applyToDefaults(internals.defaults, options || {})
}


internals.Connection.prototype.start = function (callback) {
    var self = this
    callback = Hoek.nextTick(callback)

    if (!self.file) {
        self.cache = {}
        self.timers = {}
        self.byteSize = 0
        fs.open(self.settings.cacheFile, 'a+', function (error, result) {
            if (!error) {
                self.file = result
                self._restore(callback)
            } else {
                callback(error)
            }
        })
    } else {
        callback();
    }
};

internals.Connection.prototype._restore = function (callback) {
    var self = this

    var chunkSize = 1024, buffer = new Buffer(chunkSize), pos = 0, bytesRead
    while ((bytesRead = fs.readSync(this.file, buffer, pos, chunkSize, pos)) === chunkSize) {
        buffer = Buffer.concat([buffer, new Buffer(chunkSize)])
        pos += chunkSize
    }
    pos += bytesRead

    var data
    if (pos === 0) {
        data = {}
    } else {
        try {
            data = JSON.parse(buffer.slice(0, pos))
        } catch (error) {
            callback(error)
            return
        }
    }
    this.cache = data

    var i, j, segments = Object.keys(data), segment, keys, key, value, timeLeft, now = Date.now()
    for (i = segments.length - 1; i >= 0; i--) {
        segment = segments[i]
        keys = Object.keys(data[segment])
        for (j = keys.length - 1; j >= 0; j--) {
            key = keys[j]
            value = data[segment][key]
            timeLeft = (value.stored + value.ttl) - now;
            if (timeLeft > 0) {
                self.timers[segment+key] = safeTimeout(function(){ self.drop(key, noop) }, timeLeft)
            } else {
                self.drop(key, noop)
            }
        }
    }

    callback()
}

internals.Connection.prototype.stop = function () {
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    if (this.file != null) {
        this._saveSync()
        fs.closeSync(this.file)
    }
    for (var key in this.timers) {
        clearTimeout(this.timers[key])
    }
    this.timers = {}
    this.file = null
    this.cache = null
    this.byteSize = 0
}


internals.Connection.prototype.isReady = function () {
    return (!!this.cache && !!this.file)
};


internals.Connection.prototype.validateSegmentName = function (name) {

    if (!name) {
        return new Error('Empty string');
    }

    if (name.indexOf('\0') !== -1) {
        return new Error('Includes null character');
    }

    return null;
};


internals.Connection.prototype.get = function (key, callback) {

    callback = Hoek.nextTick(callback);

    if (!this.file || !this.cache) {
        return callback(new Error('Connection not started'));
    }

    var segment = this.cache[key.segment];
    if (!segment) {
        return callback(null, null);
    }

    var envelope = segment[key.id];
    if (!envelope) {
        return callback(null, null);
    }

    var value = null;
    try {
        value = JSON.parse(envelope.item);
    }
    catch (err) {
        return callback(new Error('Bad value content'));
    }

    var result = {
        item: value,
        stored: envelope.stored,
        ttl: envelope.ttl
    };

    return callback(null, result);
};


internals.Connection.prototype.set = function (key, value, ttl, callback) {

    var self = this;

    callback = Hoek.nextTick(callback);

    if (!this.cache) {
        return callback(new Error('Connection not started'));
    }

    var stringifiedValue = null;                                    // stringify() to prevent value from changing while in the cache
    try {
        stringifiedValue = JSON.stringify(value);
    }
    catch (err) {
        return callback(err);
    }

    var envelope = {
        item: stringifiedValue,
        stored: Date.now(),
        ttl: ttl
    }

    this.cache[key.segment] = this.cache[key.segment] || {};
    var segment = this.cache[key.segment];
    var cachedItem = segment[key.id];

    if (cachedItem) {
        if (cachedItem.byteSize) {
            self.byteSize -= cachedItem.byteSize;                   // If the item existed, decrement the byteSize as the value could be different
        }
    }

    if (this.settings.maxByteSize) {
        envelope.byteSize = 53 + Buffer.byteLength(envelope.item) + Buffer.byteLength(key.segment) + Buffer.byteLength(key.id);     // Envelope size without value: 53 bytes
        if (self.byteSize + envelope.byteSize > this.settings.maxByteSize) {
            return callback(new Error('Cache size limit reached'));
        }
    }

    segment[key.id] = envelope

    clearTimeout(this.timers[key.segment+key.id])
    this.timers[key.segment+key.id] = safeTimeout(function () { self.drop(key, noop) }, ttl)

    this._save()

    return callback(null);
}


internals.Connection.prototype.drop = function (key, callback) {
    callback = Hoek.nextTick(callback)

    if (!this.cache) {
        return callback(new Error('Connection not started'))
    }

    var segment = this.cache[key.segment]
    if (segment) {
        var item = segment[key.id]

        if (item && item.byteSize) {
            this.byteSize -= item.byteSize
        }

        delete segment[key.id]
    }

    this._save()

    callback()
}

internals.Connection.prototype._save = function () {
    var self = this
    if (self.saveTimer) return

    function save() {
        if (!self.file) return
        var data = new Buffer(JSON.stringify(self.cache))
        fs.ftruncate(self.file, 0, function(error){
            if (error) throw error
            if (!self.file) return // was stopped
            fs.write(self.file, data, 0, data.length, 0, function(error){
                if (error) throw error
                self.saveTimer = null
            })
        })
    }

    self.saveTimer = setTimeout(save, self.settings.saveDebounce)
}

internals.Connection.prototype._saveSync = function () {
    var data = new Buffer(JSON.stringify(this.cache))
    fs.ftruncateSync(this.file, 0)
    fs.writeSync(this.file, data, 0, data.length, 0)
}


