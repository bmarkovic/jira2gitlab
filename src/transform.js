const _ = require('lodash')
const { getNewUploadUrl } = require('./gitlab')

const jiraToGitlabUser = (jiraUser, gitlabUsers) =>
jiraUser
  ? _.find(gitlabUsers, { email: jiraUser.emailAddress }) || { id: null }
  : { id: null }

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

const jiraToGitlabIssue = (jiraIssue, jiraAttachments, jiraComments, gitlabUsers, sudo) => ({
  title: jiraIssue.fields.summary,
  description: `> JIRA issue: ${jiraIssue.key}\n\n${
    sudo ? '' : originalAuthor(jiraToGitlabUser(jiraIssue.fields.reporter, gitlabUsers))
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
  assignee: jiraToGitlabUser(jiraIssue.fields.assignee, gitlabUsers),
  author: jiraToGitlabUser(jiraIssue.fields.reporter, gitlabUsers),
  comments: jiraComments.map(jiraComment => ({
    author: jiraToGitlabUser(jiraComment.author, gitlabUsers),
    body: jiraComment.body,
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

  module.exports = {
  jiraToGitlabUser,
  userSnippet,
  originalAuthor,
  jiraToGitlabIssue,
  attachmentLine
}
