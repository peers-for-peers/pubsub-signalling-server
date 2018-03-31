const EventEmitter = require('events');
const WebSocket = require('ws');

/**********/
/* PUBLIC */
/**********/

class Server extends EventEmitter {
    constructor() {
        super()

        let self = this

        self._wss = new WebSocket.Server({
            clientTracking: true,
            port: 8080,
        })

        self._wss.broadcast = (data) => {
          self._wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(data);
            }
          })
        }

        self._wss.on('connection', (ws) => {
            ws.on('message', (data) => {
                data = JSON.parse(data)
                self.emit(data.type, data.id, data.payload)
            })
        })

        self.on('signal', self.signal);
    }

    signal(clientId, payload) {
        console.log('Client (' + clientId + ') sent signal for: ' + payload.peerId)
    }

    // TODO : add register identifier handler 
}

class Client {
    constructor(id) {
        let self = this

        self.id = id

        self._ws = new WebSocket('ws://localhost::8080');
    }

    _queueSend(type, payload, cb) {
        let self = this

        const data = JSON.stringify({
            'type': type,
            'id': self.id,
            'payload': payload,
        })

        // If the websocket is not open, queue the message
        if (self._ws.readyState != WebSocket.OPEN) {
            self._ws.once('open', () => {
                self._ws.send(data)
                if (cb) cb(null)
            })
        } else {
            self._ws.send(data)
            if (cb) cb(null)
        }
    }

    signal(peerId, cb) {
        this._queueSend(
            'signal',
            { 'peerId': peerId },
            cb
        )
    }
}

/***********/
/* EXPORTS */
/***********/

module.exports.Server = Server
module.exports.Client = Client
