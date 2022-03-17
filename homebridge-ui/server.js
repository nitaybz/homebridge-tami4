/* eslint-disable no-undef */
const axios = require('axios')
const puppeteer = require('puppeteer-core');
const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');
const isPi = require('detect-rpi');
const exec = require('child-process-promise').exec;
const edgePaths = require("edge-paths");

class UiServer extends HomebridgePluginUiServer {
	constructor() {
		super();

		this.endpointUrl = 'https://swelcustomers.strauss-water.com';
		// this.imei;

		// create request handlers
		this.onRequest('/request-otp', this.requestOtp.bind(this));
		this.onRequest('/check-otp', this.checkOtp.bind(this));

		// must be called when the script is ready to accept connections
		this.ready();
	}


	/**
   * Handle requests sent to /request-otp
   */

	async requestOtp(body) {
		let captcha
		try {
			captcha = await this.getCaptcha();
			if (typeof captcha !== 'string')
				throw captcha
		} catch (err) {
			console.log(err)
			throw err
		}

		try {
			body.phone = body.phone.replace('+9720', '+972').replace(/^0/, '+972').replace(/^972/, '+972')
		} catch (err) {
			console.log(err)
			throw err
		}

		const data = {
			'reCaptchaToken': captcha,
			'phoneNumber': body.phone
		}

		try {
			const response = await axios.post(`${this.endpointUrl}/public/phone/generateOTP`, data);
			return response.data;
		} catch (e) {
			console.log(e.response ? e.response.data : e.message)
			throw new RequestError(e.response ? e.response.data : e.message);
		}
	}

	/**
   * Handle requests sent to /check-otp
   */
	async checkOtp(body) {
		let captcha
		try {
			captcha = await this.getCaptcha();
			if (typeof captcha !== 'string')
				throw captcha
		} catch (err) {
			console.log(err)
			throw err
		}


		try {
			body.phone = body.phone.replace('+9720', '+972').replace(/^0/, '+972').replace(/^972/, '+972')
		} catch (err) {
			console.log(err)
			throw err
		}

		const data = {
			'reCaptchaToken': captcha,
			'phoneNumber': body.phone,
			'code': body.code
		}

		let response;

		try {
			response = await axios.post(`${this.endpointUrl}/public/phone/submitOTP`, data);
		} catch (e) {
			console.log(e.response ? e.response.data : e.message)
			throw new RequestError(e.response ? e.response.data : e.message);
		}
    
		if (response.data.access_token && response.data.refresh_token) {
			return {
				accessToken: response.data.access_token,
				refreshToken: response.data.refresh_token
			}
		} else {
			throw new RequestError(`Could NOT get the token: ${response.data}`);
		}
	}

	async getCaptcha() {
		let config = {executablePath: await this.getBrowserPath()}

		var browser = await puppeteer.launch(config);
		const context = await browser.createIncognitoBrowserContext();
		const page = await context.newPage();
		// page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
		await page.setViewport({ width: 800, height: 600 })
		await page.goto('https://www.tami4.co.il/area/lobby');
		const tami4token = await page.evaluate(async () => {
			return grecaptcha.enterprise.execute('6Lf-jYgUAAAAAEQiRRXezC9dfIQoxofIhqBnGisq', {
			}).then(token => token)
		})
		await browser.close();
		return tami4token
	}


	async getBrowserPath() {
		console.log('\nThis script is using the browser to bypass captcha, it will now search for an installed browser')


		if (isPi()) {
			console.log('Running on a RPi, searching for Chromium path...')
			try {
				const results = await exec('which chromium-browser')
				if (results.stdout) {
					const path = results.stdout.replace(/^\s+|\s+$/g, '')
					console.log(`found path: ${path}`)
					return path
				} else
					throw results.stderr
				
			} catch (err) {
				console.log('Chromium not found')
				throw new Error('Could not find Chromium installation! Stopping the process')
			}
		} else if (process.platform === 'darwin') {
			console.log('Running on a Mac, searching for Google Chrome path...')
			try {
				const results = await exec("which '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'")
				if (results.stdout) {
					const path = results.stdout.replace(/^\s+|\s+$/g, '')
					console.log(`found path: ${path}`)
					return path
				} else
					throw 'err'
				
			} catch (err) {
				console.log('Chrome not found at \'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\'')
			}
			try {
				const results = await exec("which '/Applications/Google Chrome.app/'")
				if (results.stdout) {
					const path = results.stdout.replace(/^\s+|\s+$/g, '')
					console.log(`found path: ${path}`)
					return path
				} else
					throw 'err'
				
			} catch (err) {
				console.log('Chrome not found at \'/Applications/Google Chrome.app\'')
				throw new Error('Could not find Chrome installation! Stopping the process')
			}
		
		} else if (process.platform === 'win32') {
			console.log('Running on a Windows, Using Microsoft Edge path)')

			return edgePaths.getEdgePath();
		} else {
			console.log('Running on unknown device, searching for Chromium path...')
			try {
				const results = await exec('which chromium-browser')
				if (results.stdout) {
					const path = results.stdout.replace(/^\s+|\s+$/g, '')
					console.log(`found path: ${path}`)
					return path
				} else
					throw results.stderr
				
			} catch (err) {
				console.log('Chromium not found')
				console.log(err)
				throw new Error('Could not find Chromium installation! Stopping the process')
			}
		}
	}

}

// start the instance of the class
(() => {
	return new UiServer;
})();
