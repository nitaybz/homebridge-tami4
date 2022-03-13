/* eslint-disable no-undef */
const axios = require('axios')
const puppeteer = require('puppeteer');
const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');

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

		var browser = await puppeteer.launch();
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

}

// start the instance of the class
(() => {
	return new UiServer;
})();
