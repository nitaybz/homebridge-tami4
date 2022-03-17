#!/usr/bin/env node
/* eslint-disable no-async-promise-executor */

const axios = require('axios')
const prompts = require('prompts');
const puppeteer = require('puppeteer-core');
const isPi = require('detect-rpi');
const exec = require('child-process-promise').exec;
const edgePaths = require("edge-paths");

let token
const endpointUrl = 'https://swelcustomers.strauss-water.com'

console.log('\nYou\'ll need the phone that was registered to Tami4 to get OTP password via SMS.\n')

var questions = [
	{
		type: 'text',
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
		type: 'number',
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

prompts(questions).then(() => {
	console.log('\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~')
	console.log('')
	console.log('Your token is ->')
	console.log(token)
	console.log('')
	console.log('~~~~~~~~~~~~~~~~~~~~~~  DONE  ~~~~~~~~~~~~~~~~~~~~~~\n')
})

const getCaptcha = async () => {
	let config = {executablePath: await getBrowserPath()}

        
	var browser = await puppeteer.launch(config);
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

const getBrowserPath = async() => {
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