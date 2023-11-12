/* eslint-disable no-undef */
const axios = require('axios')
// const puppeteer = require('puppeteer-core');
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
		let captcha = body.token

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
		let captcha = body.token

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
}

// start the instance of the class
(() => {
	return new UiServer;
})();
