/** * YAMB Z-Way HA module *******************************************

Version: 1.04
(c) Maroš Kollár, 2015
-----------------------------------------------------------------------------
Author: Maroš Kollár <maros@k-1.com>
Description:
    This module listens to a selected event, and performs certain tasks when
    this event fires.

******************************************************************************/

/* jshint strict:true esversion:5 indent:false */

function YAMB (id, controller) {
  YAMB.super_.call(this, id, controller)

  _.extend(this, {
    topics: {}
  })
}

inherits(YAMB, AutomationModule)

_module = YAMB

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

YAMB.prototype.init = function (config) {
  YAMB.super_.prototype.init.call(this, config)

  var self = this

  // self.callbackDevice = _.bind(self.handleDevice, self)
  // self.controller.devices.on('change:metrics:level', self.callbackDevice)

  self.callbackDeviceCreated = _.bind(self.handleDeviceCreated, self)
  self.controller.devices.on('created', self.callbackDeviceCreated)

  self.callbackTagsChanged = _.bind(self.handleTags, self)
  self.controller.devices.on('change:tags', self.callbackTagsChanged)

  // API
  self.defineAPIHandlers()
  self.externalAPIAllow()
  global['YAMB'] = this.YAMBAPI
}

YAMB.prototype.stop = function () {
  var self = this

  // self.controller.devices.off('change:metrics:level', self.callbackDevice)

  self.controller.devices.off('created', self.callbackDeviceCreated)
  self.controller.devices.off('change:tags', self.callbackTagsChanged)

  self.handleCancel()

  YAMB.super_.prototype.stop.call(this)
}

// ----------------------------------------------------------------------------
// --- Event methods
// ----------------------------------------------------------------------------

YAMB.prototype.handleTags = function (device) {
  var self = this

  console.log('[YAMB] tags updated for ', device.get('metrics:title'))
}

YAMB.prototype.handleDeviceCreated = function (device) {
  var self = this

  if (_.intersection(device.get('tags'), ['mqtt']).length > 0) {
    self.addDevice(device)
    console.log(
      '[YAMB] device added',
      device.get('metrics:title'),
      'with tags ',
      device.get('tags')
    )
  }
}

YAMB.prototype.handleDevice = function (device) {
  var self = this

  console.log(
    '[YAMB] change',
    device.get('metrics:title'),
    'to',
    device.get('metrics:level')
  )
}

YAMB.prototype.handleCancel = function () {
  var self = this

  console.log('[YAMB] Got cancel event')
}

// --- Data methods

// TODO: Refactor this later
YAMB.prototype.addDevice = function (device) {
  var self = this

  var devTitle = device.get('metrics:title')
  var devID = device.get('id')
  var newTopic = {}

  newTopic[devID] = { topic: devTitle }

  _.extend(self.topics, newTopic)

  console.log(
    '[YAMB] topic added for ',
    devTitle,
    'object is',
    JSON.stringify(newTopic)
  )
}

YAMB.prototype.reCreateTopics = function () {
  var self = this

  self.topics = {}
  console.log('[YAMB] Cleared everything...')

  self.controller.devices.each(function (device) {
    if (_.intersection(device.get('tags'), ['mqtt']).length > 0) {
      self.addDevice(device)
    }
  })
}

// --- HTTP API

YAMB.prototype.externalAPIAllow = function () {
  ws.allowExternalAccess('YAMB', this.controller.auth.ROLE.USER)
  ws.allowExternalAccess('YAMB.Status', this.controller.auth.ROLE.USER)
  ws.allowExternalAccess('YAMB.Refresh', this.controller.auth.ROLE.USER)
}

YAMB.prototype.externalAPIRevoke = function () {
  ws.revokeExternalAccess('YAMB')
  ws.revokeExternalAccess('YAMB.Status')
  ws.revokeExternalAccess('YAMB.Refresh')
}

YAMB.prototype.defineAPIHandlers = function () {
  var self = this

  this.YAMBAPI = function () {
    return { status: 400, body: 'Bad request ' }
  }

  this.YAMBAPI.Status = function (url, request) {
    var body = {
      updateTime: now,
      count: 0,
      topics: {},
      code: 200
    }

    body.topics = self.topics
    body.count = _.size(body.topics)
    result = self.prepareHTTPResponse(body)
    return result
  }

  this.YAMBAPI.Refresh = function (url, request) {
    var body = {
      updateTime: now,
      oldCount: 0,
      newCount: 0,
      code: 200
    }

    body.oldCount = _.size(self.topics)

    // Recreate topics list
    self.reCreateTopics()

    body.newCount = _.size(self.topics)

    result = self.prepareHTTPResponse(body)
    return result
  }
}

// Helper methods

// YAMB.prototype.processAction = function (index, event) {
//   var self = this

//   var action = self.config.actions[index]
//   if (typeof (action) === 'undefined') {
//     return
//   }

//   if (typeof (action.delay) === 'number' &&
//         action.delay > 0) {
//     self.timeout = setTimeout(
//             _.bind(self.performAction, self, index, event),
//             (action.delay * 1000)
//         )
//   } else {
//     self.performAction(index, event)
//   }
// }

// YAMB.prototype.performAction = function (index, event) {
//   var self = this
//   console.log('[YAMB] Running action index ' + index)

//     // Always reset timeout
//   self.timeout = undefined

//   var action = self.config.actions[index]

//   _.each(action.switches, function (element) {
//     var deviceObject = self.controller.devices.get(element.device)
//     if (deviceObject !== null) {
//       if (element.status === 'toggle') {
//         var level = deviceObject.get('metrics:level')
//         level = (level === 'on') ? 'off' : 'on'
//         deviceObject.performCommand(level)
//       } else {
//         deviceObject.performCommand(element.level)
//       }
//     }
//   })

//   _.each(action.multilevels, function (element) {
//     var deviceObject = self.controller.devices.get(element.device)
//     var level = parseInt(element.level, 10)
//     if (deviceObject !== null) {
//       deviceObject.performCommand('exact', { level: level })
//     }
//   })

//   _.each(action.scenes, function (element) {
//     var deviceObject = self.controller.devices.get(element)
//     if (deviceObject !== null) {
//       deviceObject.performCommand('on')
//     }
//   })

//   if (typeof (action.code) !== 'undefined') {
//     self.evalCode(action.code, index, event)
//   }

//   _.forEach(action.notifications, function (element) {
//     var deviceObject = self.controller.devices.get(element.device)
//     if (deviceObject !== null) {
//       if ((event.message !== undefined)) {
//         message = event.message
//       } else {
//         message = element.message
//       }
//       deviceObject.set('metrics:message', message, { silent: true })
//       deviceObject.performCommand('on')
//       deviceObject.set('metrics:message', '', { silent: true })
//     }
//   })

//   self.processAction(index + 1, event)
// }

// YAMB.prototype.evalCode = function (code, index, event) {
//   try {
//     eval(code)
//   } catch (e) {
//     console.error('[YAMB] Error running custom code in index ' + index + ': ' + e)
//   }
// }
