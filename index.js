const tami4Api = require('./tami4/api')
const syncHomeKitCache = require('./tami4/syncHomeKitCache')
const path = require('path')
const storage = require('node-persist')
const PLUGIN_NAME = 'homebridge-tami4'
const PLATFORM_NAME = 'Tami4'

module.exports = (api) => {
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, tami4Platform)
}

class tami4Platform {
	constructor(log, config, api) {

		this.cachedAccessories = []
		this.activeAccessories = []
		this.config = config
		this.log = log
		this.api = api
		this.storage = storage
		this.syncHomeKitCache = syncHomeKitCache(this)
		this.name = PLATFORM_NAME
		this.debug = config['debug'] || false
		this.PLUGIN_NAME = PLUGIN_NAME
		this.PLATFORM_NAME = PLATFORM_NAME

		
		this.refreshToken = config['refreshToken']
		
		if (!this.refreshToken) {
			this.log('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX  --  ERROR  --  XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n')
			this.log('Can\'t start homebridge-tami4 plugin without token !!\n')
			this.log('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n')
			return
		}

		this.persistPath = path.join(this.api.user.persistPath(), '/../tami4-persist')
		this.emptyState = {devices:{}}
		
		// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //
		// define debug method to output debug logs when enabled in the config
		this.log.easyDebug = (...content) => {
			if (this.debug) {
				this.log(content.reduce((previous, current) => {
					return previous + ' ' + current
				}))
			} else
				this.log.debug(content.reduce((previous, current) => {
					return previous + ' ' + current
				}))
		}
		
		this.api.on('didFinishLaunching', async () => {

			await this.storage.init({
				dir: this.persistPath,
				forgiveParseErrors: true
			})

			this.tami4Api = await tami4Api(this)

			this.cachedState = await this.storage.getItem('tami4-state') || this.emptyState
			if (!this.cachedState.devices)
				this.cachedState = this.emptyState

			try {
				this.devices = await this.tami4Api.getDevices()
				await this.storage.setItem('tami4-devices', this.devices)
			} catch(err) {
				this.log('ERR:', err)
				this.devices = await this.storage.getItem('tami4-devices') || []
			}

			// Fetch the mainPage payload (drinks + filter + UV) for each device once up front.
			// Falls back to cached payload if the Strauss API is unreachable so users do not
			// lose drink switches after a transient network hiccup.
			await Promise.all(this.devices.map(async device => {
				if (!device.psn) {
					this.log(`Cannot fetch mainPage for ${device.name || device.id || 'device'}: missing psn in /v1/device response. Drinks + filter + UV sensors will be skipped.`)
					device.mainPage = null
					return
				}
				try {
					device.mainPage = await this.tami4Api.getMainPage(device.psn)
					await this.storage.setItem(`tami4-mainPage-${device.psn}`, device.mainPage)
					this.log.easyDebug(`mainPage fetched for ${device.name || device.psn}: ${JSON.stringify(device.mainPage)}`)
				} catch(err) {
					const msg = err && err.message ? err.message : err
					this.log(`Could not fetch mainPage for ${device.name || device.psn}: ${msg}. Drinks + filter + UV sensors will be skipped (will retry on next poll).`)
					device.mainPage = (await this.storage.getItem(`tami4-mainPage-${device.psn}`)) || null
				}
			}))

			this.syncHomeKitCache()

		})

	}

	configureAccessory(accessory) {
		this.cachedAccessories.push(accessory)
	}

}
