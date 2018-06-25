const chalk = require('chalk')
const _ = require('lodash')

const { print, debug, error, spinner, writeJSON } = require('./src/util')

/**
 * GITLAB specific functions
 */
const {
  getNewUploadUrl,
  getGitlabUsers,
  searchGitlabProjects,
  uploadBinaryToGitlab,
  postGitlabIssue,
  postGitlabNote
} = require('./src/gitlab')

/**
 * JIRA specific functions
 */
const {
  getJiraIssues,
  getJiraAttachements,
  getJiraAttachementBinary,
  getBinaryLocalFilename
} = require('./src/jira')

/**
 * Transformations
 */
const {
  originalAuthor,
  jiraToGitlabIssue,
  attachmentLine
} = require('./src/transform')

const { getConfig } = require('./src/config')

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
const getInstanceData = async () => {

  const { config } = global

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

  return { gitlabUsers, gitlabProjects, jiraIssues }
}

/**
 *   GETTING JIRA ISSUE ATTACHMENTS
 *
 * Using Promise.all we'll parallel download
 *
 * - Issue attachment and comment metadata
 * - All Jira attachment binaries, and store them in the filesystem
 *
 */
const getJiraAttachments = async (jiraIssues, gitlabUsers) => {

  const { config } = global

  let attComm = []
  let atts = 0
  let procAtts = 0
  let curKey = ''

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

        return jiraToGitlabIssue(jiraIssue, [], [], gitlabUsers, config.sudo)

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

        return jiraToGitlabIssue(jiraIssue, jiraAttachments, jiraComments, gitlabUsers, config.sudo)

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
      'Downloaded ' + chalk.bold.cyan(atts) + ' attachments from project: ' +
      chalk.cyan(config.jira.project)
    )
  }

  return { attComm, gitlabIssues }
}

// async main
const main = async () => {

  print(
    chalk.bold('\njira2gitlab v0.6.0\n\n') +
    'Imports JIRA issues into Gitlab\n\n' +
    chalk.bold.cyan(' .. use at your own peril .. \n')
  )

  // Getting configuration
  spinner.start(chalk.yellow(' Getting configuration..'))
  const config = await getConfig()
  global.config = config
  spinner.succeed()

  // getting instance data
  spinner.start(chalk.yellow(' Getting base Gitlab and JIRA instance data..'))
  let { gitlabUsers, gitlabProjects, jiraIssues } = await getInstanceData()
  spinner.succeed()

  // Getting JIRA issue attachments, comments and attached binaries
  spinner.start(chalk.yellow(' Getting Jira Issue attachments..'))
  let { attComm, gitlabIssues } = await getJiraAttachments(jiraIssues, gitlabUsers)
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

  let atts = 0
  let procAtts = 0
  let comms = 0
  let procComms = 0
  let curKey = ''
  let counter = 0
  let issueCounter = 0
  let gitlabPosts = []
  let postedComments = []

  // if 'go' CLI parameter was given, post issues to Gitlab
  try {
    if (process.argv[2] === 'go') {

      spinner.start(chalk.yellow(' Posting issues to Gitlab..'))

      // spinner updating local closure
      let updGlab = (key) => {

        if (key) curKey = key

        spinner.text = (
          chalk.yellow(' Posting issues to Gitlab.. Key: ') +
          chalk.magenta(curKey) + ' ' +
          chalk.cyan(issueCounter + '/' + gitlabIssues.length) +
          chalk.yellow(' issues ') +
          chalk.cyan(procAtts + '/' + atts) +
          chalk.yellow(' atts ') +
          chalk.cyan(procComms + '/' + comms) +
          chalk.yellow(' comms.')
        )
      }

      // I had to do it synchronously for the logic to hold

      for (let issue of gitlabIssues) {

        if (issue.done && config.settings.ignoreDone) continue

        let jiraKey = issue.jira_key
        let newIssue = _.cloneDeep(issue)
        delete newIssue.jira_key

        atts += issue.attachments.length

        let attachments = []
        let tailDescription = ''

        if (issue.attachments.length > 0) {

          tailDescription += '\n\n' +
            '### Attachments\n\n\n' +

            '|Filename|Uploader|Attachment|\n' +
            '|---|---|---|\n'

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

            if (upload.markdown) tailDescription += attachmentLine(config.gitlab, upload, attachment)

            attachments.push(attach)
          }

        }

        delete newIssue.attachments

        let comments = newIssue.comments
        delete newIssue.comments

        comms += (comments && comments instanceof Array) ? comments.length : 0

        updGlab(jiraKey)

        newIssue.description += tailDescription

        let issueResp = await postGitlabIssue(config.gitlab, newIssue, config.sudo)

        if (issueResp.error) {
          throw new Error(issueResp.error)
        } else issueCounter += 1

        gitlabPosts.push(newIssue)
        let commentsUrl = issueResp['_links']['notes']

        for (let comment of comments) {

          comment.body = (config.sudo ? originalAuthor(comment.author) : '') + comment.body
          let resp = await postGitlabNote(config.gitlab, commentsUrl, comment)
          procComms += 1
          if (!resp.error) postedComments.push(resp)
        }

      }

      await writeJSON('payloads/gitlab-issues.json', gitlabPosts)
      await writeJSON('payloads/gitlab-notes.json', postedComments)
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
  (process.env.DEBUG && Number(process.env.DEBUG) > 0)
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
