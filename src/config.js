
const _ = require('lodash')
const { readJSON, writeJSON, error, info, print } = require('./util.js')
const fs = require('fs')

const defaultConfig = JSON.parse(`
{
  "jira": {
    "url": "http://jira.attlasian.net",
    "project": "PROJ",
    "account": {
      "username": "user@example.org",
      "password": "1234"
    }
  },
  "gitlab": {
    "url": "https://gitlab.com",
    "project": "",
    "token": ""
  },
  "settings": {
    "rejectUnauthorized": false,
    "ignoreDone": false,
    "sudo": true
  }
}
`)

const getConfig = async () => {

  let fileConfig = await (() =>
    readJSON('./config.json')
      .then(config => { return config })
      .catch(async err => {
        // We will complain and write defaults to the
        // Filesystem
        error('\nMissing "config.json" configuration file\n')

        await writeJSON('config.json', defaultConfig)
        await new Promise((resolve, reject) => fs.mkdir('./payloads/', (err) => {
          if (err) reject(err)
          else resolve()
        }))

        info(`We've written "config.json" with the defaults for you.\n`)
        print(
          `Edit the file with your instance information before running\n` +
          `the program again.`
        )
        process.exit(1)
      })
    )()

  let config = _.merge({}, defaultConfig, fileConfig)

  // globalize settings
  config.gitlab.rejectUnauthorized = config.settings.rejectUnauthorized
  config.gitlab.sudo = config.settings.sudo
  config.jira.rejectUnauthorized = config.settings.rejectUnauthorized

  return config

}

module.exports = {
  defaultConfig,
  getConfig
}
