const { get } = require('./ajax')

const jiraIssuesUrl = (jira) =>
  `${jira.url}/rest/api/2/search?jql=project=${jira.project}%20ORDER%20BY%20id%20ASC&maxResults=1000`

const jiraAttachementsUrl = (jira, jiraIssue) =>
  `${jira.url}/rest/api/2/issue/${jiraIssue.id}/?fields=attachment,comment`

const getJiraIssues = async (jira) => {
  let req = {
    url: jiraIssuesUrl(jira),
    auth: 'basic',
    username: jira.account.username,
    password: jira.account.password,
    options: {
      rejectUnauthorized: jira.rejectUnauthorized
    }
  }

  return get(req)
}

const getBinaryLocalFilename = (key, jiraAttachment) =>
  'payloads/' + key + '_' + jiraAttachment.filename

const getJiraAttachements = async (jira, jiraIssue) => {
  let req = {
    url: jiraAttachementsUrl(jira, jiraIssue),
    auth: 'basic',
    username: jira.account.username,
    password: jira.account.password,
    options: {
      rejectUnauthorized: jira.rejectUnauthorized
    }
  }

  let resp = await get(req)
  // TODO: return attachments and comments
  return resp
}

const getJiraAttachementBinary = async (jira, jiraIssue, jiraAttachment) => {
  let req = {
    url: jiraAttachment.content,
    auth: 'basic',
    username: jira.account.username,
    password: jira.account.password,
    options: {
      output: getBinaryLocalFilename(jiraIssue.key, jiraAttachment),
      rejectUnauthorized: jira.rejectUnauthorized
    }
  }

  let resp = await get(req)
  // TODO: return attachments and comments
  return resp
}

module.exports = {
  jiraIssuesUrl,
  jiraAttachementsUrl,
  getJiraIssues,
  getJiraAttachements,
  getJiraAttachementBinary,
  getBinaryLocalFilename
}
