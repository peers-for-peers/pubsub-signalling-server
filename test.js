const SimplePeer = require('simple-peer')
const wrtc = require('wrtc')

const Client = require('./index').Client
const ClientEvents = require('./index').ClientEvents
const Server = require('./index').Server

const assert = require('assert')

class Peer {
    constructor(id) {
        let self = this

        this.client = new Client(id)
        this.idToPeers = {}

        this.client.on(ClientEvents.SIGNAL, (id, signal) => {
            if (!(id in self.idToPeers)) self.connect(id, false)
            
            self.idToPeers[id].signal(signal)
        })

        this.client.on(ClientEvents.ONLINE, (id) => {
            self.connect(id, true)
        })

        this.client.signIn((err) => { assert.ok(!err) })
    }

    connectWhenOnline(id) {
        this.client.registerForUpdates(id)
    }

    connect(id, initiator) {
        let self = this

        let peer = this.idToPeers[id] = new SimplePeer({ wrtc: wrtc, initiator: initiator })

        peer.on('signal', (signal) => {
            self.client.signal(id, signal, (err) => { assert.ok(!err) })
        })

        peer.on('error', (err) => {
            console.log(self.client.id + " encountered an error")
        })

        peer.on('connect', () => {
            peer.send("Hello from " + self.client.id)
        })

        peer.on('data', (data) => {
            console.log(data.toString('utf8'))
        })
    }
}

/**************/
/* TEST LOGIC */
/**************/

let s = new Server()

let p1 = new Peer(1)
let p2 = new Peer(2)

p1.connectWhenOnline(2)
