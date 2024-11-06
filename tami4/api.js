const axiosLib = require('axios');
let axios = axiosLib.create();

let log, token, storage 

module.exports = async function (platform) {
	let tokenPromise, statePromise, getConfigurationPromise, getDrinksPromise, getWaterQualityPromise
	const initialToken = platform.refreshToken
	log = platform.log
	storage = platform.storage
	token = await storage.getItem('tami4-token')

	const getToken = () => {
		// log.easyDebug(`getToken; ${token} ${token && token.expirationDate} [currentDate = ${new Date().getTime()}`)
		if (token && new Date().getTime() < token.expirationDate) {
			log.easyDebug('Found valid token in cache', token.accessToken)
			return Promise.resolve(token.accessToken)
		}

		if (!tokenPromise) {
			tokenPromise = new Promise((resolve, reject) => {
				let data = {}
				if (token && token.refreshToken && token.newToken)
					data.refreshToken = token.refreshToken
				else
					data.refreshToken = initialToken

				const config = {
					method: 'post',
					url: 'https://authentication-prod.strauss-group.com/api/v1/auth/token/refresh',
					headers: {
						// 'content-type': 'application/json', 
						"X-Api-Key": "96787682-rrzh-0995-v9sz-cfdad9ac7072"
					},
					data : data
				}

				axiosRequest(config)
					.then(response => {
						if (response.accessToken) {
							token = {
								accessToken: response.accessToken,
								refreshToken: response.refreshToken,
								newToken: true,
								expirationDate: new Date().getTime() + (1000 * response.expires_in)
							}
							storage.setItem('tami4-token', token)
							resolve(token.accessToken)
						} else reject(response)
					})
					.catch(error => {
						reject(error)
					})
					.finally(() => {
						tokenPromise = null
					})
			})
		}
		return tokenPromise
	}

	
	return {
	
		getDevices: async () => {
			let accessToken
			try {
				accessToken = await getToken()
			} catch (err) {
				log.easyDebug(`Can't Get Token: ${err}`)
				throw err
			}
			
			if (!statePromise) {
				statePromise = new Promise((resolve, reject) => {
					
					const config = {
						method: 'get',
						url: `https://swelcustomers.strauss-water.com/api/v1/device`,
						headers: { 
							'Authorization': 'Bearer ' + accessToken
						}
					};

					axiosRequest(config)
						.then(response => {
							resolve(response)
						})
						.catch(error => {
							reject(error)
						})
						.finally(() => {
							statePromise = null
						})

				})
			}
			return statePromise

		},
	
		getDrinks: async () => {
			let accessToken
			try {
				accessToken = await getToken()
			} catch (err) {
				log.easyDebug(`Can't Get Token : ${err}`)
				throw err
			}
			
			if (!getDrinksPromise) {
				getDrinksPromise = new Promise((resolve, reject) => {
					
					const config = {
						method: 'get',
						url: `https://swelcustomers.strauss-water.com/api/v1/customer/drink`,
						headers: { 
							'Authorization': 'Bearer ' + accessToken
						}
					};

					axiosRequest(config)
						.then(response => {
							resolve(response)
						})
						.catch(error => {
							reject(error)
						})
						.finally(() => {
							getDrinksPromise = null
						})

				})
			}
			return getDrinksPromise

		},
	
		getWaterQuality: async () => {
			let accessToken
			try {
				accessToken = await getToken()
			} catch (err) {
				log.easyDebug(`Can't Get Token: ${err}`)
				throw err
			}
			
			if (!getWaterQualityPromise) {
				getWaterQualityPromise = new Promise((resolve, reject) => {
					
					const config = {
						method: 'get',
						url: `https://swelcustomers.strauss-water.com/api/v2/customer/waterQuality`,
						headers: { 
							'Authorization': 'Bearer ' + accessToken
						}
					};

					axiosRequest(config)
						.then(response => {
							resolve(response)
						})
						.catch(error => {
							reject(error)
						})
						.finally(() => {
							getDrinksPromise = null
						})

				})
			}
			return getWaterQualityPromise

		},
	
	
		getConfigurations: async (deviceId) => {
			let accessToken
			try {
				accessToken = await getToken()
			} catch (err) {
				log.easyDebug(`Can't Get Token: ${err}`)
				throw err
			}
			
			if (!getConfigurationPromise) {
				getConfigurationPromise = new Promise((resolve, reject) => {
					
					const config = {
						method: 'get',
						url: `https://swelcustomers.strauss-water.com/api/v3/device/${deviceId}/configuration`,
						headers: { 
							'Authorization': 'Bearer ' + accessToken
						}
					};

					axiosRequest(config)
						.then(response => {
							resolve(response)
						})
						.catch(error => {
							reject(error)
						})
						.finally(() => {
							getConfigurationPromise = null
						})

				})
			}
			return getConfigurationPromise

		},
	
		boilWater: async (deviceId) => {
			let accessToken
			try {
				accessToken = await getToken()
			} catch (err) {
				log.easyDebug(`Can't Get Token: ${err}`)
				throw err
			}

			const config = {
				method: 'post',
				url: `https://swelcustomers.strauss-water.com/api/v1/device/${deviceId}/startBoiling`,
				headers: { 
					'Authorization': 'Bearer ' + accessToken
				},
				validateStatus: function (status) {
					if (status === 502)
						log('Water is already hot!')
					return (status >= 200 && status < 300) || status === 502
				},
			
			};
			
			return axiosRequest(config)
		},
	
		setConfiguration: async (deviceId, type, value) => {
			let accessToken
			try {
				accessToken = await getToken()
			} catch (err) {
				log.easyDebug(`Can't Get Token: ${err}`)
				throw err
			}

			const data = {
				id: deviceId,
				configurationProperties: {
					[type]: value
				}
			}

			const config = {
				method: 'post',
				url: `https://swelcustomers.strauss-water.com/api/v3/device/${deviceId}/configuration`,
				headers: { 
					'Authorization': 'Bearer ' + accessToken,
					'content-type': 'application/json'
				},
				data : data
			};
			
			return axiosRequest(config)
		},
	
		prepareDrink: async (deviceId, drinkId) => {
			let accessToken
			try {
				accessToken = await getToken()
			} catch (err) {
				log.easyDebug(`Can't Get Token: ${err}`)
				throw err
			}

			const config = {
				method: 'post',
				url: `https://swelcustomers.strauss-water.com/api/v1/device/${deviceId}/prepareDrink/${drinkId}`,
				headers: { 
					'Authorization': 'Bearer ' + accessToken
				}
			};
			
			return axiosRequest(config)
		},
	
	
	}

}


const axiosRequest = (config) => {
	return new Promise((resolve, reject) => {
		// config.timeout = REQUEST_TIMEOUT
		log.easyDebug(`Sending Request: ${JSON.stringify(config)}`)
		axios(config)
			.then(function (response) {
				const res = response
				if (res.error) {
					log(res.error)
					reject(res.error)
					return
				}
				const data = res.data || {'success': true}
				log.easyDebug('Response:', JSON.stringify(data))
				resolve(data)
			})
			.catch(function (error) {
				try {
					const errMessage = error.toJSON().message
					log(errMessage)
					reject(errMessage)
				} catch(err) {
					log(error)
					reject(error)
				}
			})
	})
}
