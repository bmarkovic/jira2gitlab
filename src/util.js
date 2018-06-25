const fs = require('fs')
const chalk = require('chalk')
const ora = require('ora')

const print = console.debug.bind(console)

// Debug print, but only in debug mode
const debug = (
    (process.env.NODE_ENV && process.env.NODE_ENV.includes('devel')) ||
    (process.env.DEBUG && Number(process.env.DEBUG) > 0)
  )
    ? s => print(s)
    : Function.prototype // javascript for 'noop'

const error = s => print(chalk.bold.red(s))
const info = s => print(chalk.yellow(s))

const spinner = (
  (process.env.NODE_ENV && process.env.NODE_ENV.includes('devel')) ||
  (process.env.DEBUG && Number(process.env.DEBUG) > 0)
)
  // in debug mode emulate ora API but print debug info
  ? {
        __txt: '',
        start(x) {
          this.__txt = x
          print(x)
        },
        get text() {
          return this.__txt
        },
        set text(x) {
          this.__txt = x
          print(x)
        },
        succeed() {
          print(chalk.green('✔ Success:') + ' ' + this.__txt)
          this.__txt = ''
        }
    }
  // in production mode return ora instance
  : ora()
/**
 * Promisified fs.readFile
 */
const readFile = (filepath, encoding) => new Promise((resolve, reject) => {
  debug('Reading file: ' + chalk.cyan(filepath))
  fs.readFile(filepath, encoding, (err, data) => {
    if (err) reject(err)
    else resolve(data)
  })
})

/**
 * Promisified fs.readFile
 */
const writeFile = (filepath, data, encoding) => new Promise((resolve, reject) => {
  debug('Writing to file: ' + chalk.cyan(filepath))
  fs.writeFile(filepath, data, encoding, (err, data) => {
    if (err) reject(err)
    else {
      debug(chalk.green('Written: ') + chalk.cyan(filepath))
      resolve(data)
    }
  })
})

// wrapper, to curry JSON reading
const readJSON = async filepath => JSON.parse(String(
  await readFile(filepath, 'utf8')
))

// wrapper, curries JSON writing
const writeJSON = async (filepath, data) => await writeFile(
  filepath, JSON.stringify(data, null, 2), 'utf8'
)

module.exports = {
  print,
  debug,
  error,
  info,
  spinner,
  readFile,
  writeFile,
  readJSON,
  writeJSON
}
