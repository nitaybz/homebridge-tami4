let Characteristic, Service

class Tami4 {
	constructor(device, platform) {

		Service = platform.api.hap.Service
		Characteristic = platform.api.hap.Characteristic
		// this.customCharacteristic = require('./customCharacteristic')(platform.api.hap)

		this.lighting = platform.config.lighting
		this.pushAndDrink = platform.config.pushAndDrink
		this.nightMode = platform.config.nightMode
		this.energySaveMode = platform.config.energySaveMode
		this.smartHeatingMode = platform.config.smartHeatingMode
		this.buttonsSound = platform.config.buttonsSound
		// Drinks are exposed by default to match the HA integration; opt-out for users who
		// do not want them as HomeKit accessories (see issue #16).
		this.disableDrinks = !!platform.config.disableDrinks
		this.statePollingInterval = platform.config.statePollingInterval ? platform.config.statePollingInterval * 1000 : 300000
		this.name = device.name || 'Tami4'
		this.displayName = this.name
		this.id = device.id
		this.psn = device.psn
		this.tami4Api = platform.tami4Api
		// mainPage contains drinks + filter/UV info, fetched in index.js. May be null on
		// startup if the Strauss API was unreachable and there was no cached copy.
		this.mainPage = device.mainPage || null
		this.drinks = (this.mainPage && Array.isArray(this.mainPage.drinks)) ? this.mainPage.drinks : []
		this.log = platform.log
		this.api = platform.api
		this.storage = platform.storage
		this.model = 'Edge'
		this.serial = this.id
		this.manufacturer = '@nitaybz'
		this.displayName = this.name
		this.configurationDevice = false

		this.UUID = this.api.hap.uuid.generate(this.id.toString())
		this.accessory = platform.cachedAccessories.find(accessory => accessory.UUID === this.UUID)

		if (!this.accessory) {
			this.log(`Creating New ${platform.PLATFORM_NAME} Accessory (${this.name})`)
			this.accessory = new this.api.platformAccessory(this.name, this.UUID)
			this.accessory.context.deviceId = this.id
			this.accessory.context.state = {}

			platform.cachedAccessories.push(this.accessory)
			// register the accessory
			this.api.registerPlatformAccessories(platform.PLUGIN_NAME, platform.PLATFORM_NAME, [this.accessory])
		}
		this.state = this.accessory.context.state

		this.stateManager = require('./StateManager')(this, platform)

		let informationService = this.accessory.getService(Service.AccessoryInformation)

		if (!informationService)
			informationService = this.accessory.addService(Service.AccessoryInformation)

		informationService
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.model)
			.setCharacteristic(Characteristic.SerialNumber, this.serial)

		this.addBoilWaterSwitch()

		if (this.lighting)
			this.addConfigSwitch('lightning', 'Lighting')
		else
			this.removeSwitch('Lighting')

		if (this.buttonsSound)
			this.addConfigSwitch('buttonsSound', 'Buttons Sound')
		else
			this.removeSwitch('Buttons Sound')

		if (this.nightMode)
			this.addConfigSwitch('nightMode', 'Night Mode')
		else
			this.removeSwitch('Night Mode')

		if (this.energySaveMode)
			this.addConfigSwitch('energySaveMode', 'Energy Saving Mode')
		else
			this.removeSwitch('Energy Saving Mode')

		if (this.smartHeatingMode)
			this.addConfigSwitch('smartHeatingMode', 'Smart Heating Mode')
		else
			this.removeSwitch('Smart Heating Mode')

		if (this.pushAndDrink)
			this.addConfigSwitch('pushAndDrink', 'Push and Drink')
		else
			this.removeSwitch('Push and Drink')

		// Sanity log: surfaces what the device.js side received from index.js. If mainPage
		// is null here, the Strauss API call failed and there was no cached copy, which
		// explains why drinks and filter/UV services do not appear.
		if (this.mainPage) {
			const drinkCount = this.drinks.length
			const dynamic = this.mainPage.dynamicData || {}
			this.log.easyDebug(`mainPage loaded for ${this.name}: drinks=${drinkCount}, filterInfo=${JSON.stringify(dynamic.filterInfo)}, uvInfo=${JSON.stringify(dynamic.uvInfo)}`)
		} else {
			this.log(`No mainPage data for ${this.name} (drinks + filter + UV services will be skipped). Check the debug log earlier for the API error.`)
		}

		this.syncDrinkSwitches()
		this.syncMaintenanceServices()

		// Persist the modified service list to the cached-accessory file so the
		// Homebridge UI's accessory inspector renders the new services. Without
		// this call, services added to a cached accessory are visible to HomeKit
		// but not always reflected in the UI until the next bridge restart.
		this.api.updatePlatformAccessories([this.accessory])


		if (this.configurationDevice) {
			this.stateManager.get.refreshState()
			setInterval(this.stateManager.get.refreshState, this.statePollingInterval)
		}

		// Refresh mainPage (drinks + filter + UV) on the same polling cadence as configurations.
		// Sensor data changes slowly, so the default 300 s interval is more than fine.
		this.refreshMainPage = this.refreshMainPage.bind(this)
		setInterval(this.refreshMainPage, this.statePollingInterval)

	}

	async refreshMainPage() {
		if (!this.psn || !this.tami4Api) return
		try {
			const mainPage = await this.tami4Api.getMainPage(this.psn)
			if (!mainPage) return
			this.mainPage = mainPage
			this.drinks = Array.isArray(mainPage.drinks) ? mainPage.drinks : []
			this.syncDrinkSwitches()
			this.syncMaintenanceServices()
			this.api.updatePlatformAccessories([this.accessory])
		} catch (err) {
			this.log.easyDebug(`Failed to refresh mainPage for ${this.name}: ${err && err.message ? err.message : err}`)
		}
	}

	syncDrinkSwitches() {
		// Track which drink subtypes belong to the user right now so stale services from
		// previous runs (drink renamed/deleted in the Tami4 app) get cleaned up.
		const desiredSubtypes = new Set()
		if (!this.disableDrinks) {
			for (const drink of this.drinks) {
				if (!drink || drink.id == null) continue
				const subtype = `drink:${drink.id}`
				desiredSubtypes.add(subtype)
				this.addDrinkSwitch(drink, subtype)
			}
		}

		// Remove orphaned drink services. Walk a snapshot of services since we mutate as we go.
		for (const service of [...this.accessory.services]) {
			if (typeof service.subtype === 'string' && service.subtype.startsWith('drink:') && !desiredSubtypes.has(service.subtype)) {
				this.log.easyDebug(`Removing stale drink switch "${service.displayName}" (${service.subtype})`)
				this.accessory.removeService(service)
			}
		}
	}

	syncMaintenanceServices() {
		// Strauss reports the upcoming-replacement date and an "installed" flag, plus filter
		// litres-passed. We surface filter and UV state as HomeKit Battery services because
		// Battery is the only HAP primitive that pairs a 0-100% level with a binary "needs
		// attention" flag without forcing the accessory category into Air Purifier / HVAC.
		//   BatteryLevel    = clamp(daysRemaining / lifeDays * 100)
		//   StatusLowBattery = 1 if daysRemaining <= 0 else 0 (date-driven, authoritative)
		//   ChargingState   = 2 (NotChargeable) — these consumables are replaced, not charged
		//
		// Life baselines from Strauss product spec:
		//   filter = 182 days (six months)
		//   UV lamp = 365 days (one year)
		const FILTER_LIFE_DAYS = 182
		const UV_LIFE_DAYS = 365
		const dynamic = this.mainPage && this.mainPage.dynamicData ? this.mainPage.dynamicData : {}
		const filterInfo = dynamic.filterInfo
		const uvInfo = dynamic.uvInfo

		this.log.easyDebug(`syncMaintenanceServices for ${this.name}: filterInfo=${JSON.stringify(filterInfo)} uvInfo=${JSON.stringify(uvInfo)}`)

		// v1.4.0-1.4.2 used Service.FilterMaintenance which is not valid on a Switch-class
		// accessory. Clean up any leftover services from those releases on first boot.
		this._removeLegacyFilterMaintenanceServices()

		if (filterInfo && (filterInfo.installed || filterInfo.upcomingReplacement))
			this.addMaintenanceBatteryService('Water Filter', 'filter', filterInfo.upcomingReplacement, FILTER_LIFE_DAYS)
		else
			this.removeMaintenanceBatteryService('filter')

		if (uvInfo && (uvInfo.installed || uvInfo.upcomingReplacement))
			this.addMaintenanceBatteryService('UV Lamp', 'uv', uvInfo.upcomingReplacement, UV_LIFE_DAYS)
		else
			this.removeMaintenanceBatteryService('uv')
	}

	addMaintenanceBatteryService(name, subtype, upcomingReplacementMs, lifeDays) {
		const subtypeKey = `battery:${subtype}`
		let service = this.accessory.getServiceById(Service.BatteryService, subtypeKey)
		if (!service) {
			this.log(`Adding "${name}" Battery service for ${this.name}`)
			service = this.accessory.addService(Service.BatteryService, name, subtypeKey)
		}
		this._setServiceName(service, name)

		// If upcomingReplacement is missing, treat the part as fresh: full life, no warning.
		let lifePercent = 100
		let lowBattery = 0
		if (upcomingReplacementMs) {
			const now = Date.now()
			const daysRemaining = Math.round((upcomingReplacementMs - now) / 86400000)
			lifePercent = Math.max(0, Math.min(100, Math.round((daysRemaining / lifeDays) * 100)))
			lowBattery = daysRemaining <= 0 ? 1 : 0
		}

		service.getCharacteristic(Characteristic.BatteryLevel).updateValue(lifePercent)
		service.getCharacteristic(Characteristic.StatusLowBattery).updateValue(lowBattery)
		// 2 = NotChargeable. Filters and UV lamps are replaced, not charged.
		service.getCharacteristic(Characteristic.ChargingState).updateValue(2)
	}

	removeMaintenanceBatteryService(subtype) {
		const subtypeKey = `battery:${subtype}`
		const service = this.accessory.getServiceById(Service.BatteryService, subtypeKey)
		if (service) {
			this.log.easyDebug(`Removing Battery service for ${this.name} (${subtypeKey})`)
			this.accessory.removeService(service)
		}
	}

	_removeLegacyFilterMaintenanceServices() {
		for (const service of [...this.accessory.services]) {
			if (typeof service.subtype === 'string' && service.subtype.startsWith('maintenance:')) {
				this.log(`Removing legacy FilterMaintenance service "${service.displayName}" (${service.subtype}) from ${this.name}`)
				this.accessory.removeService(service)
			}
		}
	}

	// Set the service-level name explicitly. Without this, HomeKit clients and the
	// Homebridge UI tend to fall back to the accessory display name ("Tami 4") for
	// every service tile, which makes the multiple drinks + filter + UV indistinguishable.
	// Setting both Name (legacy) and ConfiguredName (HomeKit R2) covers older and newer
	// clients.
	_setServiceName(service, name) {
		service.displayName = name
		if (service.testCharacteristic && service.testCharacteristic(Characteristic.Name))
			service.getCharacteristic(Characteristic.Name).updateValue(name)
		if (Characteristic.ConfiguredName) {
			if (!service.testCharacteristic(Characteristic.ConfiguredName))
				service.addOptionalCharacteristic(Characteristic.ConfiguredName)
			service.getCharacteristic(Characteristic.ConfiguredName).updateValue(name)
		}
	}

	addDrinkSwitch(drink, subtype) {
		const rawName = drink.name || `Drink ${drink.id}`
		// HomeKit rejects names with non-alphanumeric punctuation; collapse whitespace and strip
		// anything that would otherwise cause a "characteristic was supplied illegal value" warning.
		const safeName = String(rawName).replace(/[^\p{L}\p{N}\s'-]/gu, '').replace(/\s+/g, ' ').trim() || `Drink ${drink.id}`

		this.log.easyDebug(`Adding drink switch "${safeName}" (id=${drink.id}) for ${this.name}`)

		let service = this.accessory.getServiceById(Service.Switch, subtype)
		if (!service)
			service = this.accessory.addService(Service.Switch, safeName, subtype)

		this._setServiceName(service, safeName)

		service.getCharacteristic(Characteristic.On)
			.onSet(state => {
				if (state)
					return this.stateManager.set.prepareDrink(drink.id, safeName, service)

				return Promise.resolve()
			})
			.updateValue(false)
	}

	addBoilWaterSwitch() {
		this.log.easyDebug(`Adding "Boil Water" Switch Service for ${this.name}`)
		this.boilWaterService = this.accessory.getService('Boil Water')
		if (!this.boilWaterService)
			this.boilWaterService = this.accessory.addService(Service.Switch, 'Boil Water', 'Boil Water' + this.name)

		this._setServiceName(this.boilWaterService, 'Boil Water')

		this.boilWaterService.getCharacteristic(Characteristic.On)
			.onSet(state => {
				if (state)
					return this.stateManager.set.boilWater()

				return Promise.resolve()
			})
			.updateValue(false)

	}

	addConfigSwitch(type, name) {
		this.configurationDevice = true

		const serviceName = `${type}Service`
		this.log.easyDebug(`Adding "${name}" Switch Service for ${this.name}`)
		this[serviceName] = this.accessory.getService(name)
		if (!this[serviceName])
			this[serviceName] = this.accessory.addService(Service.Switch, name, name + this.name)

		this._setServiceName(this[serviceName], name)

		this[serviceName].getCharacteristic(Characteristic.On)
			.onSet(state => {
				return this.stateManager.set.configurationState(type, state, name)
			})
			.updateValue(false)
	}


	removeSwitch(name) {
		let ShowerSwitch = this.accessory.getService(name)
		if (ShowerSwitch) {
			// remove service
			this.accessory.removeService(ShowerSwitch)
		}
	}
}


module.exports = Tami4
