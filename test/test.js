/* eslint-env mocha, browser */

const Client = require('../src/client.js').Client
const ClientEvents = require('../src/client.js').ClientEvents

const assert = require('assert')

describe('basic', function () {
  this.timeout(3000)

  let clients = []
  const clientFactory = (...args) => {
    let c = new Client(...args)
    clients.push(c)
    return c
  }

  afterEach(function () {
    clients.forEach((c) => {
      c.close()
    })

    clients = []
  })

  /*********/
  /* TESTS */
  /*********/

  it('topic-info.simple', function (done) {
    const TOPIC = 'foo'
    const CLIENT_ID = 1

    let client = clientFactory(CLIENT_ID)

    client.on(ClientEvents.TOPIC_INFO, (topic, peers) => {
      assert.deepEqual(topic, TOPIC)
      assert.deepEqual(peers, [client.id])

      done()
    })

    client.signIn()
    client.subscribe(TOPIC)
    client.getTopicInfo(TOPIC, null)
  })
})
