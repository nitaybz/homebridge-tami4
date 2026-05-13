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
		// Strauss only exposes the upcoming-replacement date and an "installed" flag, not the
		// install date. To map this to HomeKit's FilterLifeLevel percent (0-100) we assume a
		// 365-day filter / UV-lamp life cycle. The percent reading is approximate; the
		// FilterChangeIndication flag flips strictly on the date and is the authoritative signal.
		// We only need either `installed === true` OR an `upcomingReplacement` date to expose the
		// service — some accounts return one but not the other (issue #17).
		const FILTER_LIFE_DAYS = 365
		const dynamic = this.mainPage && this.mainPage.dynamicData ? this.mainPage.dynamicData : {}
		const filterInfo = dynamic.filterInfo
		const uvInfo = dynamic.uvInfo

		this.log.easyDebug(`syncMaintenanceServices for ${this.name}: filterInfo=${JSON.stringify(filterInfo)} uvInfo=${JSON.stringify(uvInfo)}`)

		if (filterInfo && (filterInfo.installed || filterInfo.upcomingReplacement))
			this.addFilterMaintenanceService('Water Filter', 'filter', filterInfo.upcomingReplacement, FILTER_LIFE_DAYS)
		else
			this.removeFilterMaintenanceService('filter')

		if (uvInfo && (uvInfo.installed || uvInfo.upcomingReplacement))
			this.addFilterMaintenanceService('UV Lamp', 'uv', uvInfo.upcomingReplacement, FILTER_LIFE_DAYS)
		else
			this.removeFilterMaintenanceService('uv')
	}

	addFilterMaintenanceService(name, subtype, upcomingReplacementMs, lifeDays) {
		const subtypeKey = `maintenance:${subtype}`
		let service = this.accessory.getServiceById(Service.FilterMaintenance, subtypeKey)
		if (!service) {
			this.log(`Adding "${name}" FilterMaintenance service for ${this.name}`)
			service = this.accessory.addService(Service.FilterMaintenance, name, subtypeKey)
		} else if (service.displayName !== name) {
			service.displayName = name
		}

		// If upcomingReplacement is missing, treat the part as fresh: no change needed,
		// full life. The user can rely on the in-app indicator until Strauss returns a date.
		let needsChange = 0
		let lifePercent = 100
		if (upcomingReplacementMs) {
			const now = Date.now()
			const daysRemaining = Math.round((upcomingReplacementMs - now) / 86400000)
			lifePercent = Math.max(0, Math.min(100, Math.round((daysRemaining / lifeDays) * 100)))
			needsChange = daysRemaining <= 0 ? 1 : 0
		}

		service.getCharacteristic(Characteristic.FilterChangeIndication).updateValue(needsChange)
		service.getCharacteristic(Characteristic.FilterLifeLevel).updateValue(lifePercent)
	}

	removeFilterMaintenanceService(subtype) {
		const subtypeKey = `maintenance:${subtype}`
		const service = this.accessory.getServiceById(Service.FilterMaintenance, subtypeKey)
		if (service) {
			this.log.easyDebug(`Removing FilterMaintenance service for ${this.name} (${subtypeKey})`)
			this.accessory.removeService(service)
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
		else if (service.displayName !== safeName) {
			// drink renamed in the Tami4 app — push the new name through
			service.displayName = safeName
			const nameChar = service.getCharacteristic(Characteristic.Name)
			if (nameChar) nameChar.updateValue(safeName)
		}

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
