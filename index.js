const fs = require('fs')
const needle = require('needle')
const chalk = require('chalk')
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
    "account": {
      "username": "",
      "password": ""
    },
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

const gitlabIssueUrl = gitlab =>
  `${gitlab.url}/api/v4/projects/${gitlab.projectId}/issues`

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
  )],
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
    created_at: jiraAttachment.created
  }))
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

const postGitlabIssue = async (gitlab, issue) => {
  let req = {
    url: gitlabIssueUrl(gitlab),
    headers: {
      'PRIVATE-TOKEN': gitlab.token
    },
    data: issue
  }

  return post(req)
}

const main = async () => {
  print(
    chalk.bold('\njira2gitlab\n\n') +
    'Imports JIRA issues into Gitlab\n\n' +
    chalk.bold.cyan(' .. use at your own peril .. \n')
  )

  info('Getting configuration..')
  const fileConfig = await (() => readJSON('./config.json')
    .then(config => { return config })
    .catch(err => { return {} }) // we don't care, we just go with defaults
  )()

  const config = _.merge({}, defaultConfig, fileConfig)

  info('Getting base Gitlab and JIRA instance data..')
  let [ gitlabUsers, gitlabProjects, { issues: jiraIssues } ] = await Promise.all([
    await getGitlabUsers(config.gitlab),
    await searchGitlabProjects(config.gitlab),
    (await getJiraIssues(config.jira)) || {}
  ])

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

  if (!jiraIssues) {
    throw new Error(`Couldn't find issues for "${config.jira.project}" on JIRA instance`)
  } else {
    debug(
      'JIRA project ' + chalk.cyan(config.jira.project) +
      ' has: ' + chalk.bold.cyan(jiraIssues.length) + ' issues'
    )
  }

  let attComm = []

  let gitlabIssues = await Promise.all(jiraIssues.map(
    async jiraIssue => {

      let { fields } = await getJiraAttachements(config.jira, jiraIssue)

      if (!fields) {

        error(`Couldn't find fields for ${jiraIssue.key} on JIRA instance`)
        attComm.push({issue: jiraIssue.key, attachments: [], comments: []})

        return jiraToGitlabIssue(jiraIssue, [], [], gitlabUsers)

      } else {

        let jiraAttachments = fields.attachment
        let jiraComments = fields.comment.comments

        debug(
          'JIRA issue ' + chalk.cyan(jiraIssue.key) +
          ' has: ' + chalk.bold.cyan(jiraAttachments.length) + ' attachments and ' +
          chalk.bold.green(jiraComments.length) + ' comments.'
        )
        attComm.push({issue: jiraIssue.key, attachments: jiraAttachments, comments: jiraComments})

        return jiraToGitlabIssue(jiraIssue, jiraAttachments, jiraComments, gitlabUsers)

      }
    }
  ))

  Promise.all([
    writeJSON('payloads/gitlab-projects.json', gitlabProjects),
    writeJSON('payloads/gitlab-users.json', gitlabUsers),
    writeJSON('payloads/jira-issues.json', jiraIssues),
    writeJSON('payloads/gitlab-issues.json', gitlabIssues),
    writeJSON('payloads/att-comm.json', attComm)
  ])

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
    error(err)
  })
}
