const Tami4Device = require('../homekit/device')

module.exports = (platform) => {
	return () => {
		platform.devices.forEach(device => {
			new Tami4Device(device, platform)
		})

		// find devices to remove
		const accessoriesToRemove = []
		platform.cachedAccessories.forEach(accessory => {
			let deviceExists = platform.devices.find(device => device.id === accessory.context.deviceId)
			if (!deviceExists) {
				accessoriesToRemove.push(accessory)
				platform.log.easyDebug('Unregistering Unnecessary Cached Device:' + accessory.displayName)
			}
		})

		if (accessoriesToRemove.length) {
			// unregistering accessories
			platform.api.unregisterPlatformAccessories(platform.PLUGIN_NAME, platform.PLATFORM_NAME, accessoriesToRemove)

			// remove from cachedAccessories
			platform.cachedAccessories = platform.cachedAccessories.filter( cachedAccessory => !accessoriesToRemove.find(accessory => accessory.UUID === cachedAccessory.UUID) )

		}
	}
}