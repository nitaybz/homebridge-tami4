#!/usr/bin/env node

const isPi = require('detect-rpi');
const exec = require('child-process-promise').exec;

const installChromium = () => {

	return exec('sudo apt-get update && sudo apt-get install chromium-browser --yes')
		.then(function (result) {
			var stdout = result.stdout;
			var stderr = result.stderr;
			console.log('stdout: ', stdout);
			console.log('stderr: ', stderr);
		})
		.catch(function (err) {
			console.error('ERROR: ', err);
		});
}

const preInstallScript = async () => {
	if (isPi()) {
		console.log('Running on a RPi, searching for Chromium path...')
		try {
			const results = await exec('which chromium-browser')
			if (results.stdout) {
				const path = results.stdout.replace(/\s+/, '')
				console.log(`Chromium Browser Exist at "${path}"... skipping preinstall script`)
			} else {
				console.log('Chromium not found... executing preinstall script:')
				console.log('sudo apt-get update && sudo apt-get install chromium-browser --yes')
				await installChromium()
			}
				
		} catch (err) {
			console.log('Chromium not found... executing preinstall script:')
			console.log('sudo apt-get update && sudo apt-get install chromium-browser --yes')
			await installChromium()
		}
	}

}
preInstallScript()