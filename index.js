/* global _, inherits, AutomationModule, _module:true, ws, mqttee */
/* exported _module */

// ----------------------------------------------------------------------------
// --- Class definition, inheritance and setup
// ----------------------------------------------------------------------------

function YAMB (id, controller) {
  YAMB.super_.call(this, id, controller)
}

inherits(YAMB, AutomationModule)
_module = YAMB

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

YAMB.prototype.init = function (config) {
  YAMB.super_.prototype.init.call(this, config)

  // Options
  // TODO: Make configurable later
  this.topicPrefix = 'zwave'

  // Structure
  this.topics = {}
  this.lastStructureChangeTime = 0

  // Bind 'this' in handlers
  this.onDeviceInsert = _.bind(this.doDeviceInsert, this)
  this.controller.devices.on('created', this.onDeviceInsert)
  this.controller.devices.on('change:tags', this.onDeviceInsert)

  this.onDeviceRemove = _.bind(this.doDeviceRemove, this)
  this.controller.devices.on('removed', this.onDeviceRemove)

  // Cron poll
  this.onCheckForNewDevices = _.bind(this.doCheckForNewDevices, this)
  this.controller.on('yamb.poll', this.onCheckForNewDevices)
  this.controller.emit('cron.addTask', 'yamb.poll', {
    minute: [0, 59, 5], // Every 5 minutes
    hour: null,
    weekDay: null,
    day: null,
    month: null
  })

  // This to be called to device metrics updates
  this.onDeviceChanged = _.bind(this.doDeviceChanged, this)

  // Allow external API
  this.externalAPIAllow()
  global['yambi'] = this.yambi
  this.yambi['status'] = _.bind(this.doYambiStatus, this)
  this.yambi['refresh'] = _.bind(this.doYambiRefresh, this)
}

YAMB.prototype.stop = function () {
  YAMB.super_.prototype.stop.call(this)
  var self = this

  // Revoke external API
  self.externalAPIRevoke()
  delete global['yambapi']

  // Remove device level event listeners (devID is the key in the topics object)
  _.each(self.topics, function (topic, devID) {
    self.controller.devices.off(devID, 'change:metrics:level', self.onDeviceChanged)
  })

  // Cancel event listeners
  self.controller.devices.off('created', self.onDeviceInsert)
  self.controller.devices.off('change:tags', self.onDeviceInsert)
  self.controller.devices.off('removed', self.onDeviceRemove)

  self.controller.emit('cron.removeTask', 'yamb.poll')
  self.controller.off('yamb.poll', self.onCheckForNewDevices)
}

// ----------------------------------------------------------------------------
// --- Event handlers
// ----------------------------------------------------------------------------

YAMB.prototype.doDeviceInsert = function (device) {
  console.log('[YAMB] Checking device', device.get('metrics:title'))
  var devID = device.get('id')

  var topicMode = this.getTopicMode(device.get('tags'), device.get('deviceType'))
  if (!topicMode) {
    if (devID in this.topics) {
      delete this.topics[devID]
      console.log('[YAMB] Removed device from topics')
      this.lastStructureChangeTime = Math.floor(new Date().getTime() / 1000)
    }
  } else {
    console.log('[YAMB] Adding device', device.get('metrics:title'), 'with mode', topicMode)

    // Base properties
    var deviceName = device.get('metrics:title')
    var deviceType = device.get('deviceType')
    var deviceLastLevel = device.get('metrics:level')

    // Form mqtt topic name
    var topicBody = this.getTopicFromTitle(deviceName)

    // Topics to listen
    // eslint-disable-next-line no-undef-init
    var subscribeTopic = undefined
    if (topicMode === 'in' || topicMode === 'rw') {
      subscribeTopic = this.topicPrefix + '/' + deviceType + '/' + topicBody + '/set'
    }

    // Topics to publish
    // eslint-disable-next-line no-undef-init
    var publishTopic = undefined
    if (topicMode === 'ro' || topicMode === 'rw') {
      publishTopic = this.topicPrefix + '/' + deviceType + '/' + topicBody
    }

    var newTopic = {
      name: deviceName,
      type: deviceType,
      mode: topicMode,
      lastLevel: deviceLastLevel,
      subTopic: subscribeTopic,
      pubTopic: publishTopic
    }

    if (devID in this.topics) {
      _.extend(this.topics[devID], newTopic)
    } else {
      this.topics[devID] = newTopic
      this.topics[devID].lastStatus = 0
      this.controller.devices.on(devID, 'change:metrics:level', this.onDeviceChanged)
    }
    this.lastStructureChangeTime = Math.floor(new Date().getTime() / 1000)
  }
}

YAMB.prototype.doDeviceRemove = function (device) {
  var self = this
  if (!_.isUndefined(device) && !_.isUndefined(device.get)) {
    if (device.get('id') in self.topics) {
      delete self.topics[device.get('id')]
      this.lastStructureChangeTime = Math.floor(new Date().getTime() / 1000)
      console.log('[YAMB] Removed device', device.get('id'), 'from topics list')
    }
  }
}

YAMB.prototype.doCheckForNewDevices = function () {
  var self = this

  if (self.lastStructureChangeTime >= self.controller.lastStructureChangeTime) {
    console.log('[YAMB] Cron. Nothing to do. Skipping.')
  } else {
    console.log('[YAMB] Refreshing everything')
    self.controller.devices.each(function (device) {
      self.onDeviceInsert(device)
    })
  }
}

YAMB.prototype.doDeviceChanged = function (device) {
  var self = this

  if (!_.isUndefined(device) && !_.isUndefined(device.get)) {
    var topic = self.topics[device.get('id')]
    var newLevel = device.get('metrics:level')

    console.log('[YAMB]', topic.name, 'changed from', topic.lastLevel, 'to', newLevel)
    topic.lastLevel = newLevel

    // Sending mqtt2ee notification
    if (!_.isUndefined(mqttee) && !_.isUndefined(topic.pubTopic)) {
      mqttee.emit('mqtt.publish.topic', { topic: topic.pubTopic, value: topic.lastLevel.toString() })
      console.log('[YAMB] mqtt publish', topic.pubTopic, topic.lastLevel)
    }
  } else {
    console.log('[YAMB] Got event, but device is undefinded')
  }
}
// ----------------------------------------------------------------------------
// --- Utility methods
// --- !!! Avoid using 'this' or bind the method to it
// ----------------------------------------------------------------------------
YAMB.prototype.getTopicMode = function (deviceTags, deviceType) {
  function defaultTopicMode (deviceType) {
    var defMode = 'rw'
    switch (deviceType) {
      case 'battery':
      case 'sensorBinary':
      case 'sensorMultiline':
      case 'sensorMultilevel':
        defMode = 'ro'
        break
      case 'doorlock':
      case 'thermostat':
      case 'switchBinary':
      case 'switchMultilevel':
      case 'toggleButton':
      case 'switchControl':
      case 'switchRGB':
        defMode = 'rw'
    }
    return defMode
  }

  var myTags = ['mqtt', 'mqtt:rw', 'mqtt:ro', 'mqtt:in']
  var ourTags = _.intersection(myTags, deviceTags)

  // Return undefined if there are no mqtt tags
  if (!ourTags.length) return null

  var modePrecedence = ['in', 'ro', 'rw']
  var modeIdx = _.map(ourTags, function (value, index) {
    var result = defaultTopicMode(deviceType)
    if (value !== 'mqtt') {
      result = value.split(':')[1]
    }
    return modePrecedence.indexOf(result)
  }).sort()[0]
  return modePrecedence[modeIdx]
}

YAMB.prototype.getTopicFromTitle = function (devName) {
  return String(devName).replace(/[()]/g, '').toLowerCase().split(/[\s.]/).join('-')
}

// ----------------------------------------------------------------------------
// --- Public API
// ----------------------------------------------------------------------------

YAMB.prototype.externalAPIAllow = function () {
  ws.allowExternalAccess('yambi', this.controller.auth.ROLE.USER)
  ws.allowExternalAccess('yambi.status', this.controller.auth.ROLE.USER)
  ws.allowExternalAccess('yambi.refresh', this.controller.auth.ROLE.USER)
}

YAMB.prototype.externalAPIRevoke = function () {
  ws.revokeExternalAccess('yambi')
  ws.revokeExternalAccess('yambi.status')
  ws.revokeExternalAccess('yambi.refresh')
}

YAMB.prototype.yambi = function () {
  return { status: 200, body: 'Wrong move. Better use .status or .refresh subcommands.' }
}

YAMB.prototype.doYambiStatus = function () {
  var body = {
    updateTime: this.lastStructureChangeTime,
    controllerUpdateTime: this.controller.lastStructureChangeTime,
    count: 0,
    topics: {},
    code: 200
  }

  body.topics = this.topics
  body.count = _.size(body.topics)
  var result = this.prepareHTTPResponse(body)
  return result
}

YAMB.prototype.doYambiRefresh = function () {
  var body = {
    thisUpdateTime: this.lastStructureChangeTime,
    controllerUpdateTime: this.controller.lastStructureChangeTime,
    topics: {},
    code: 200
  }

  this.lastStructureChangeTime = 0
  this.onCheckForNewDevices()
  body.topics = this.topics

  var result = this.prepareHTTPResponse(body)
  return result
}
