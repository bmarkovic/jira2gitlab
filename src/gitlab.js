const chalk = require('chalk')
const { get, post } = require('./ajax')
const { debug } = require('./util')

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

const getGitlabUsers = async (gitlab) => {
  let req = {
    url: gitlabUsersUrl(gitlab),
    headers: {
      'PRIVATE-TOKEN': gitlab.token
    },
    options: {
      rejectUnauthorized: gitlab.rejectUnauthorized
    }
  }

  return get(req)
}

const searchGitlabProjects = async (gitlab) => {
  let req = {
    url: gitlabSearchProjectsUrl(gitlab),
    headers: {
      'PRIVATE-TOKEN': gitlab.token
    },
    options: {
      rejectUnauthorized: gitlab.rejectUnauthorized
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
      multipart: true,
      rejectUnauthorized: gitlab.rejectUnauthorized
    }
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
    options: {
      json: true,
      rejectUnauthorized: gitlab.rejectUnauthorized
    }
  }

  if (gitlab.sudo && issue.author.username) {
    req.headers['Sudo'] = issue.author.username
  }

  let data = issue

  return post(req, data)
}

const postGitlabNote = async (gitlab, url, note) => {
  let req = {
    url,
    headers: {
      'PRIVATE-TOKEN': gitlab.token
    },
    options: {
      json: true,
      rejectUnauthorized: gitlab.rejectUnauthorized
    }
  }

  if (gitlab.sudo && note.author.username) {
    req.headers['Sudo'] = note.author.username
  }

  let data = note

  return post(req, data)
}

module.exports = {
  gitlabUsersUrl,
  gitlabSearchProjectsUrl,
  gitlabBinaryUploadUrl,
  getNewUploadUrl,
  getGitlabUsers,
  searchGitlabProjects,
  uploadBinaryToGitlab,
  postGitlabIssue,
  postGitlabNote
}
