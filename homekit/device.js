let Characteristic, Service

class Thermostat {
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
		this.statePollingInterval = platform.config.statePollingInterval ? platform.config.statePollingInterval * 1000 : 300000
		this.name = device.name
		this.id = device.id
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


		if (this.configurationDevice) {
			this.stateManager.get.refreshState()
			setInterval(this.stateManager.get.refreshState, this.statePollingInterval)
		}

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


module.exports = Thermostat
