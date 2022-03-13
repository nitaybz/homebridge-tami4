#!/usr/bin/env node
/* eslint-disable no-async-promise-executor */

const axios = require('axios')
const inquirer = require('inquirer')
const puppeteer = require('puppeteer');
let token
const endpointUrl = 'https://swelcustomers.strauss-water.com'

console.log('\nYou\'ll need the phone that was registered to Tami4 to get OTP password via SMS.\n')

var questions = [
	{
		type: 'input',
		name: 'phone',
		message: 'Please insert the phone number registered to Tami4 (e.g. +972524001234):',
		validate: function (phone) {
			const pass = phone.match(/^\+972\d{8,9}$/i)
			if (!pass)
				return 'Please enter a valid phone number'

			return new Promise(async (resolve, reject) => {
				let captcha
				try {
					captcha = await getCaptcha();
					if (typeof captcha !== 'string')
						throw captcha
				} catch (err) {
					console.log(err)
					throw err
				}
		
				const data = {
					'reCaptchaToken': captcha,
					'phoneNumber': phone
				}

				axios.post(`${endpointUrl}/public/phone/generateOTP`, data)
					.then(() => {
						resolve(true)
					})
					.catch(err => {
						const error = `ERROR: "${err.response ? (err.response.data.error_description || err.response.data.error) : err}"`
						console.log(error)
						reject(error)
					})

			})

		}
	},
	{
		type: 'input',
		name: 'code',
		message: 'Please enter the OTP code received at your phone:',
		validate: function (code, answers) {
			const pass = code.match(/^\d{4}$/i)
			if (!pass)
				return 'Please enter a valid code (4 digits)'

			return new Promise(async (resolve, reject) => {
				let captcha
				try {
					captcha = await getCaptcha();
					if (typeof captcha !== 'string')
						return reject(captcha)
				} catch (err) {
					console.log(err)
					return reject(err)
				}
		
				const data = {
					'reCaptchaToken': captcha,
					'phoneNumber': answers.phone,
					'code': code
				}

				axios.post(`${endpointUrl}/public/phone/submitOTP`, data)
					.then((response) => {
						if (response.data.refresh_token) {
							token = response.data.refresh_token
							resolve(true)
						} else {
							const error = `Could NOT get the token: ${response.data.data ? response.data.data : JSON.stringify(response.data)}`
							reject(error)
						}
					})
					.catch(err => {
						reject(err)
					})
			})

		}
	}
]

inquirer.prompt(questions).then(() => {
	console.log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
	console.log('')
	console.log('Your token is ->')
	console.log(token)
	console.log('')
	console.log('~~~~~~~~~~~~~~~~~~~~~~  DONE  ~~~~~~~~~~~~~~~~~~~~~~\n')
})

const getCaptcha = async () => {

	var browser = await puppeteer.launch();
	const context = await browser.createIncognitoBrowserContext();
	const page = await context.newPage();
	// page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
	await page.setViewport({ width: 800, height: 600 })
	await page.goto('https://www.tami4.co.il/area/lobby');
	const tami4token = await page.evaluate(async () => {
		// eslint-disable-next-line no-undef
		return grecaptcha.enterprise.execute('6Lf-jYgUAAAAAEQiRRXezC9dfIQoxofIhqBnGisq', {
		}).then(token => token)
	})
	await browser.close();
	return tami4token
}