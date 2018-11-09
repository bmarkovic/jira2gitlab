const needle = require('needle')
const { debug, error } = require('./util.js')
const chalk = require('chalk')

const handleRes = (req, res) => {
  if (res && res.statusCode >= 200 && res.statusCode < 300) {
    debug(chalk.green('GET Success!: ') + chalk.cyan(req.url))
    debug(
      'Got data of type: ' +
      chalk.cyan(typeof res.body) +
      ' with length: ' +
      chalk.cyan(res.body.length))
    return res.body
  } else if (res && res.statusCode >= 400) {
    let body = res.body
    let message = body.message ||
        `${res.statusCode}: Unspecified HTTP errror.`
    error(message)
    let err = new Error(message)
    err.status = res.statusCode
    throw err
  } else {
    let errorFull = JSON.stringify(res, null, 2)
    let message = (res.body && res.body.message) || 'Unspecified connection error'
    error('\n' + message)
    debug('\n' + errorFull)
    let err = new Error(message)
    throw err
  }
}

const get = async req => {

  debug(chalk.bold.cyan('GET') + ' from ' + chalk.cyan(req.url))

  let { headers, auth, username, password } = req
  let options = { headers, auth, username, password, ...req.options }

  if (!(req.options && req.options.output)) options.parse = true

  let res = await needle('get', req.url, options)

  return handleRes(req, res)
}

const post = async (req, data) => {

  debug(
    chalk.magenta('POST') + ' to ' + chalk.cyan(req.url) +
    (req.headers.Sudo ? ' as user ' + chalk.magenta(req.headers.Sudo) : '')
  )

  let { headers, auth, username, password } = req
  let options = { headers, auth, username, password, ...req.options }

  let res = await needle('post', req.url, data, options)

  return handleRes(req, res)
}

module.exports = {
  get,
  post,
  needle
}
