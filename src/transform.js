const _ = require('lodash')
const { getNewUploadUrl } = require('./gitlab')

const jiraToGitlabUser = (jiraUser, gitlabUsers, emailMap, matchByUserName) => {
  if (!jiraUser) return { id: null }

  let email = jiraUser.emailAddress

  if (email && emailMap && emailMap instanceof Array) {
    let found = emailMap.find(
      ([jiraEmail, gitlabEmail] ) => jiraEmail === jiraUser.emailAddress
    )
    email = found
      ? found[1] || jiraUser.emailAddress
      : jiraUser.emailAddress
  }

  let username = email.split('@')[0]

  if (matchByUserName) {
    return _.find(gitlabUsers, { username }) || { id: null }
  } else {
    return _.find(gitlabUsers, { email }) || { id: null }
  }
}

const userSnippet = user => `@${
    (user && user.id) ? user.username : 'Unknown'
  } ${
    (user && user.id) ? '"' + user.name + '"' : ''
  }`

const originalAuthor = author => `> Originally by ${userSnippet(author)}\n\n`

const attachmentLine = (gitlab, upload, attachment) =>
  `|${
    upload.url.split('/').pop()
  }|${
    userSnippet(attachment.author
  )}|${
    upload.markdown.startsWith('!')
    ? '<img src="' + getNewUploadUrl(gitlab, upload) + '" width="250px">'
    : upload.markdown
  }|\n`

const jiraToGitlabIssue = (
  jiraIssue, jiraAttachments, jiraComments, gitlabUsers, sudo, emailMap,
  matchByUserName
) => ({
  title: jiraIssue.fields.summary,
  description: `> JIRA issue: ${jiraIssue.key}\n\n${
    sudo ? '' : originalAuthor(jiraToGitlabUser(
      jiraIssue.fields.reporter, gitlabUsers, emailMap, matchByUserName
    ))
  }${jiraIssue.fields.description}`,
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
  assignee: jiraToGitlabUser(
    jiraIssue.fields.assignee, gitlabUsers, emailMap, matchByUserName
    ),
  author: jiraToGitlabUser(
    jiraIssue.fields.reporter, gitlabUsers, emailMap, matchByUserName
    ),
  comments: jiraComments.map(jiraComment => ({
    author: jiraToGitlabUser(
      jiraComment.author, gitlabUsers, emailMap, matchByUserName
      ),
    body: jiraComment.body,
    created_at: jiraComment.created
  })),
  attachments: jiraAttachments.map(jiraAttachment => ({
    author: jiraToGitlabUser(
      jiraAttachment.author, gitlabUsers, emailMap, matchByUserName
      ),
    filename: jiraAttachment.filename,
    content: jiraAttachment.content,
    created_at: jiraAttachment.created,
    mimeType: jiraAttachment.mimeType
  })),
  jira_key: jiraIssue.key
  })

  module.exports = {
  jiraToGitlabUser,
  userSnippet,
  originalAuthor,
  jiraToGitlabIssue,
  attachmentLine
}
