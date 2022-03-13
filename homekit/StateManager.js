module.exports = (device, platform) => {
	const Characteristic = platform.api.hap.Characteristic
	const log = platform.log
	const tami4Api = platform.tami4Api

	return {

		get: {

			refreshState: () => {
				tami4Api.getConfigurations(device.id)
					.then((configurations) => {
						const conf = configurations.configurationProperties
						Object.keys(conf).forEach(key => {
							const service = device[`${key}Service`]
							if (service)
								service.getCharacteristic(Characteristic.On).updateValue(conf[key])
						})
					})
					.catch(err => {
						log.error('The plugin could not refresh the status - ERROR OCCURRED:')
						log.error(err.message || err.stack || err)
					})
			}
		},
	
		set: {

			boilWater: () => {
				log(`Boiling Water on ${device.name}`)
				return tami4Api.boilWater(device.id)
					.then(() => Promise.resolve())
					.catch(err => {
						log.error(`ERROR: Boiling Water on ${device.name} Failed!`)
						log.error(err.message || err.stack)
					})
					.finally(() => {
						setTimeout(() => {
							device.boilWaterService.getCharacteristic(Characteristic.On).updateValue(false)
						}, 2000)
					})
			},

			configurationState: (type, state, name) => {
				log(`Turning ${state ? 'ON': 'OFF'} ${name} on ${device.name}`)
				return tami4Api.setConfiguration(device.id, type, state)
					.then(() => Promise.resolve())
					.catch(err => {
						log.error(`ERROR: Turning ${state ? 'ON': 'OFF'} ${name} on ${device.name} Failed!`)
						log.error(err.message || err.stack)
					})

			}
		}
	}
}
