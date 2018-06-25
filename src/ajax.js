const needle = require('needle')
const { debug } = require('./util.js')
const chalk = require('chalk')

const get = async req => {

  debug(chalk.bold.cyan('GET') + ' from ' + chalk.cyan(req.url))

  let { headers, auth, username, password } = req
  let options = { headers, auth, username, password, ...req.options }

  if (!(req.options && req.options.output)) options.parse = true

  let res = await needle('get', req.url, options)

  if (res && res.statusCode === 200) {
    debug(chalk.green('GET Success!: ') + chalk.cyan(req.url))
    debug(
      'Got data of type: ' +
      chalk.cyan(typeof res.body) +
      ' with length: ' +
      chalk.cyan(res.body.length))
  }
  return res.body
}

const post = async (req, data) => {

  debug(
    chalk.magenta('POST') + ' to ' + chalk.cyan(req.url) +
    (req.headers.Sudo ? ' as user ' + chalk.magenta(req.headers.Sudo) : '')
  )

  let { headers, auth, username, password } = req
  let options = { headers, auth, username, password, ...req.options }

  let res = await needle('post', req.url, data, options)

  if (res && res.statusCode === 200) {
    debug(chalk.violet('POST Success!: ') + chalk.cyan(req.url))
    debug(
      'Got data of type: ' +
      chalk.cyan(typeof res.body) +
      ' with length: ' +
      chalk.cyan(res.body.length))
  }
  return res.body
}

module.exports = {
  get,
  post,
  needle
}
