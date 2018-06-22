const fs = require('fs')
const path = require('path')
const needle = require('needle')
const chalk = require('chalk')
const ora = require('ora')
const _ = require('lodash')

const print = console.debug.bind(console)

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
  }
}
`)

// Debug print, but only in debug mode
const debug = (
    (process.env.NODE_ENV && process.env.NODE_ENV.includes('devel')) ||
    (process.env.DEBUG && process.env.DEBUG > 0)
  )
    ? s => print(s)
    : Function.prototype // javascript for 'noop'

const error = s => print(chalk.bold.red(s))
const info = s => print(chalk.yellow(s))

const spinner = (
  (process.env.NODE_ENV && process.env.NODE_ENV.includes('devel')) ||
  (process.env.DEBUG && process.env.DEBUG > 0)
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

const jiraIssuesUrl = (jira) =>
  `${jira.url}/rest/api/2/search?jql=project=${jira.project}%20ORDER%20BY%20id%20ASC&maxResults=1000`

const jiraAttachementsUrl = (jira, jiraIssue) =>
  `${jira.url}/rest/api/2/issue/${jiraIssue.id}/?fields=attachment,comment`

const gitlabUsersUrl = (gitlab) =>
  `${gitlab.url}/api/v4/users?active=true&search=&per_page=10000`

const gitlabSearchProjectsUrl = (gitlab) => {
  let projectName = gitlab.project.split('/').pop()
  return `${gitlab.url}/api/v4/projects/?search=${encodeURIComponent(projectName)}`
}

const gitlabBinaryUploadUrl = gitlab =>
  `${gitlab.url}/api/v4/projects/${gitlab.projectId}/uploads`

const gitlabIssueUrl = gitlab =>
  `${gitlab.url}/api/v4/projects/${gitlab.projectId}/issues`

const getNewUploadUrl = (gitlab, upload) =>
  `${gitlab.url}/${gitlab.project}${upload.url}`

const jiraToGitlabUser = (jiraUser, gitlabUsers) =>
  jiraUser
  ? _.find(gitlabUsers, { email: jiraUser.emailAddress })
  : null

const jiraToGitlabIssue = (jiraIssue, jiraAttachments, jiraComments, gitlabUsers) => ({
  title: jiraIssue.fields.summary,
  description: `> JIRA issue: ${jiraIssue.key}\n\n${jiraIssue.fields.description}`,
  labels: [jiraIssue.fields.issuetype.name, ...(
    jiraIssue.fields.fixVersions.length > 0
    ? jiraIssue.fields.fixVersions.map(f => f.name)
    : []
  )].join(','),
  created_at: jiraIssue.fields.created,
  updated_at: jiraIssue.fields.updated,
  done: (
    jiraIssue.fields.resolution &&
    ['Fixed', 'Done', 'Duplicate'].includes(jiraIssue.fields.resolution.name)
  ) ? true : false,
  assignee: jiraToGitlabUser(jiraIssue.fields.assignee, gitlabUsers),
  reporter: jiraToGitlabUser(jiraIssue.fields.reporter, gitlabUsers),
  comments: jiraComments.map(jiraComment => ({
    author: jiraToGitlabUser(jiraComment.author, gitlabUsers),
    comment: jiraComment.body,
    created_at: jiraComment.created
  })),
  attachments: jiraAttachments.map(jiraAttachment => ({
    author: jiraToGitlabUser(jiraAttachment.author, gitlabUsers),
    filename: jiraAttachment.filename,
    content: jiraAttachment.content,
    created_at: jiraAttachment.created,
    mimeType: jiraAttachment.mimeType
  })),
  jira_key: jiraIssue.key
})

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

  debug(chalk.magenta('POST') + ' to ' + chalk.cyan(req.url))

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

const getJiraIssues = async (jira) => {
  let req = {
    url: jiraIssuesUrl(jira),
    auth: 'basic',
    username: jira.account.username,
    password: jira.account.password
  }

  return get(req)
}

const getJiraAttachements = async (jira, jiraIssue) => {
  let req = {
    url: jiraAttachementsUrl(jira, jiraIssue),
    auth: 'basic',
    username: jira.account.username,
    password: jira.account.password
  }

  let resp = await get(req)
  // TODO: return attachments and comments
  return resp
}

const getBinaryLocalFilename = (key, jiraAttachment) =>
  'payloads/' + key + '_' + jiraAttachment.filename

const getJiraAttachementBinary = async (jira, jiraIssue, jiraAttachment) => {
  let req = {
    url: jiraAttachment.content,
    auth: 'basic',
    username: jira.account.username,
    password: jira.account.password,
    options: {
      output: getBinaryLocalFilename(jiraIssue.key, jiraAttachment)
    }
  }

  let resp = await get(req)
  // TODO: return attachments and comments
  return resp
}

const getGitlabUsers = async (gitlab) => {
  let req = {
    url: gitlabUsersUrl(gitlab),
    headers: {
      'PRIVATE-TOKEN': gitlab.token
    }
  }

  return get(req)
}

const searchGitlabProjects = async (gitlab) => {
  let req = {
    url: gitlabSearchProjectsUrl(gitlab),
    headers: {
      'PRIVATE-TOKEN': gitlab.token
    }
  }

  return get(req)
}

const uploadBinaryToGitlab = async (gitlab, filename, mimeType) => {
  debug('Uoloading file: ' + chalk.cyan(filename) + ' mime: ' + chalk.cyan(mimeType))
  let req = {
    url: gitlabBinaryUploadUrl(gitlab),
    headers: {
      'PRIVATE-TOKEN': gitlab.token
    },
    options: {
      multipart: true
    },
  }
  let data = {
    file: {
      file: filename,
      content_type: mimeType
    }
  }

  return post(req, data)
}

const postGitlabIssue = async (gitlab, issue) => {
  let req = {
    url: gitlabIssueUrl(gitlab),
    headers: {
      'PRIVATE-TOKEN': gitlab.token
    },
    options: { json: true }
  }

  let data = issue

  return post(req, data)
}


/**
 * Main script body
 */
const main = async () => {
  print(
    chalk.bold('\njira2gitlab\n\n') +
    'Imports JIRA issues into Gitlab\n\n' +
    chalk.bold.cyan(' .. use at your own peril .. \n')
  )

  /**
   *   GETTING CONFIGURATION
   */

  spinner.start(chalk.yellow(' Getting configuration..'))
  const fileConfig = await (() => readJSON('./config.json')
    .then(config => { return config })
    .catch(async err => {
       // We will complain and write defaults to the
       // Filesystem

       error('\nMissing "config.json" configuration file\n')
       await writeJSON('config.json', defaultConfig)
       info(`We've written "config.json" with the defaults for you.\n`)
       print(
         `Edit the file with your instance information before running\n` +
         `the program again.`
      )
      process.exit(1)
    })
  )()

  const config = _.merge({}, defaultConfig, fileConfig)

  spinner.succeed()


  /**
   *   GETTING BASIC INSTANCE DATA
   *
   * Using Promise.all we'll parallel download
   *
   * - Gitlab Users
   * - Gitlab projects with similar name to given project
   * - All Jira issues for the given JIRA project
   *
   */

  spinner.start(chalk.yellow(' Getting base Gitlab and JIRA instance data..'))

  let [ gitlabUsers, gitlabProjects, { issues: jiraIssues } ] = await Promise.all([
    await getGitlabUsers(config.gitlab),
    await searchGitlabProjects(config.gitlab),
    (await getJiraIssues(config.jira)) || {}
  ])

  // Find the config.gitlab.project ID
  let gitlabProject = gitlabProjects.find(
    proj => proj.path_with_namespace === config.gitlab.project
  )

  if (!gitlabProject) {
    throw new Error(`Couldn't find project "${config.gitlab.project}" on Gitlab instance`)
  } else {
    debug(
      'Gitlab project ' + chalk.cyan(config.gitlab.project) +
      ' has id: ' + chalk.bold.cyan(gitlabProject.id)
    )
    config.gitlab.projectId = gitlabProject.id
  }

  // No issues for given project, die
  if (!jiraIssues) {
    throw new Error(`Couldn't find issues for "${config.jira.project}" on JIRA instance`)
  } else {
    debug(
      'JIRA project ' + chalk.cyan(config.jira.project) +
      ' has: ' + chalk.bold.cyan(jiraIssues.length) + ' issues'
    )
  }

  // Update spinner with some data stats
  spinner.text = chalk.yellow(' Getting base Gitlab and JIRA instance data.. ') +
    chalk.cyan(jiraIssues.length + ' issues')
  spinner.succeed()

  /**
   *   GETTING JIRA ISSUE ATTACHMENTS
   *
   * Using Promise.all we'll parallel download
   *
   * - Issue attachment and comment metadata
   * - All Jira attachment binaries, and store them in the filesystem
   *
   */

  let attComm = []
  let atts = 0
  let procAtts = 0
  let comms = 0
  let curKey = ''

  spinner.start(chalk.yellow(' Getting Jira Issue attachments..'))

  // spinner updating local closure
  let updAtts = (key) => {

    if (key) curKey = key

    spinner.text = (
      chalk.yellow(' Getting Jira Issue attachments.. Processing ') +
      chalk.magenta(curKey + ': ') +
      chalk.cyan(procAtts + '/' + atts) +
      chalk.yellow(' attachments')
    )
  }

  let gitlabIssues = await Promise.all(jiraIssues.map(
    async jiraIssue => {

      let { fields } = await getJiraAttachements(config.jira, jiraIssue)
      updAtts(jiraIssue.key)

      if (!fields) {

        error(`Couldn't find fields for ${jiraIssue.key} on JIRA instance`)
        attComm.push({issue: jiraIssue.key, attachments: [], comments: []})

        return jiraToGitlabIssue(jiraIssue, [], [], gitlabUsers)

      } else {

        let jiraAttachments = fields.attachment
        let jiraComments = fields.comment.comments

        atts += jiraAttachments.length
        updAtts()

        debug(
          'JIRA issue ' + chalk.cyan(jiraIssue.key) +
          ' has: ' + chalk.bold.cyan(jiraAttachments.length) + ' attachments and ' +
          chalk.bold.green(jiraComments.length) + ' comments.'
        )
        attComm.push({issue: jiraIssue.key, attachments: jiraAttachments, comments: jiraComments})

        let binaries = await Promise.all(jiraAttachments.map(
          jiraAttachment => {
            debug('Downloading ' + chalk.cyan(jiraAttachment.content))
            return getJiraAttachementBinary(config.jira, jiraIssue, jiraAttachment)
          }
        ))

        debug(chalk.green('Downloaded ') + chalk.magenta(binaries.length) + ' binaries')
        procAtts += binaries.length
        updAtts()

        return jiraToGitlabIssue(jiraIssue, jiraAttachments, jiraComments, gitlabUsers)

      }
    }
  ))

  // No issues, something is very wrong now, die
  if (!gitlabIssues) {
    throw new Error(
      `Couldn't transform issues for "${config.jira.project}" or download ` +
      `binaries from the instance.`)
  } else {
    debug(
      'Downloaded '+ chalk.bold.cyan(atts) + ' attachments from project: '  +
      chalk.cyan(config.jira.project)
    )
  }

  spinner.succeed()

  /**
   *   SAVING DOWNLOADED DATA AS JSON FILES TO DISK
   *
   * Using Promise.all we'll parallel save all the data so far to disk
   *
   */

  spinner.start(
    chalk.yellow(' Storing downloaded data to ') +
    chalk.cyan('./payloads/')
  )

  await Promise.all([
    writeJSON('payloads/gitlab-projects.json', gitlabProjects),
    writeJSON('payloads/gitlab-users.json', gitlabUsers),
    writeJSON('payloads/jira-issues.json', jiraIssues),
    writeJSON('payloads/interim-issues.json', gitlabIssues),
    writeJSON('payloads/att-comm.json', attComm)
  ])

  spinner.succeed()

  /**
   *   POSTING ATTACHMENTS AND ISSUES
   *
   * Using await and sync iteration we'll serially
   *
   * - Upload issue attachment binaries as project binaries
   * - Rebind transformed Github issues to new binaries as attachments
   * - Post issues to Gitlab
   *
   * If no 'go' CLI parameter, we'll just end here
   *
   */

  let counter = 0
  let issueCounter = 0
  let gitlabPosts = []

  // if 'go' CLI parameter was given, post issues to Gitlab
  try {
    if (process.argv[2] === 'go') {

      spinner.start(chalk.yellow(' Posting Gitlab issues to Gitlab..'))

      // reset all counter values
      atts = 0
      procAtts = 0
      comms = 0
      curKey = ''

      // spinner updating local closure
      let updGlab = (key) => {

        if (key) curKey = key

        spinner.text = (
          chalk.yellow(' Posting Gitlab issues to Gitlab.. Processing ') +
          chalk.magenta(curKey + ': ') +
          chalk.cyan(procAtts + '/' + atts) +
          chalk.yellow(' attachments')
        )
      }

      // I had to do it synchronously for the logic to hold


      for (let issue of gitlabIssues) {

        if (issueCounter > 4) throw new Error('Enough!')

        let jiraKey = issue.jira_key
        let newIssue = _.cloneDeep(issue)
        delete newIssue.jira_key

        if (jiraKey !== 'STAT-4') continue

        atts += issue.attachments.length

        let attachments = []

        if (issue.attachments.length > 0) {
          for (let attachment of issue.attachments) {

            let attach = _.cloneDeep(attachment)
            let filename = getBinaryLocalFilename(jiraKey, attachment)
            let upload

            upload = await uploadBinaryToGitlab(config.gitlab, filename, attach.mimeType)

            // in case of an upload error we want to end
            if (upload.error) {
              throw new Error(upload.error)
            }

            counter += 1
            debug('Counter: ' + counter)

            let newUrl = getNewUploadUrl(config.gitlab, upload)
            debug('new upload url: ' + chalk.cyan(newUrl))

            attach.content = newUrl
            procAtts++
            updGlab()

            attachments.push(attach)
          }

        } else {
          attachments = issue.attachments
        }

        updGlab(jiraKey)
        newIssue.attachments = _.cloneDeep(attachments)

        let issueResp = await postGitlabIssue(config.gitlab, newIssue)
        debug(issueResp)

        if (issueResp.error) {
          throw new Error(issueResp.error)
        } else issueCounter += 1

        gitlabPosts.push(newIssue)

      }

      await writeJSON('payloads/gitlab-issues.json', gitlabPosts)
      spinner.succeed()
    }
  } catch (err) {
    // record what we got so far
    await writeJSON('payloads/gitlab-issues-error.json', gitlabPosts)
    // rethrow
    throw err
  }


}

if (
  (process.env.NODE_ENV && process.env.NODE_ENV.includes('devel')) ||
  (process.env.DEBUG && process.env.DEBUG > 0)
) {
  main()
  .then()
} else {
  main()
  .then()
  .catch(err => {
    print()
    error(err)
    process.exit(1)
  })
}
