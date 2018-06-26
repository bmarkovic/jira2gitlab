# jira2gitlab

2018 Bojan Markovic
<bmarkovic.79@gmail.com>

Imports issues from JIRA to Gitlab.

> Note: Use at your own peril

## Installation

It is a Node.js CLI application. It uses modern ES features so the latest LTS
(currently Node 10) is strongly recommended.

Provided that you already have Node on your system
([otherwise see here](https://nodejs.org/en/download/package-manager/))
you can simply pull dependencies with:

    $ npm install

amd you're ready to go.

## Usage

The program is started with:

    $ nodw . [go]

If you can't be bothered to deal with Node (I don't blame you) you can use the
provided binary releases. The usage is similar except taht instead of the line
above you use

    $ jira2gitlab [go]

If you don't provide the `go` CLI parameter it will not attempt to write to the
gitlab instance but will only dump all the downloaded content into the
`payloads` directory. You can examine the JSON files, and `gitlab-issues.json`
in particular, to see how the posted Gitlab issues will look before posting
them to the Gitlab project.

If the file `config.json` is not present in the program directory it will exit
with an error and dump a default `config.json` to the filesystem, that you can
then edit with your required data. The configuration is commented below:

```javascript
{
  "jira": {                             // JIRA config settings
    "url": "http://jira.attlasian.net", // JIRA instance base URL
    "project": "PROJ",                  // JIRA project key / short name
    "account": {                        // JIRA Authentication
      "username": "user@example.org",   // JIRA username
      "password": "1234"                // JIRA password
    }
  },
  "gitlab": {                           // Gitlab config settings
    "url": "https://gitlab.com",        // Gitlab base URL
    "project": "namespace/project",     // Gitlab namespaced project name
    "token": ""                         // Gitlab personal access token
  },
  "settings": {                         // jira2gitlab settings

    "rejectUnauthorized": false,        // Set to true to reject self-signed
                                        // certificates for either service

    "ignoreDone": false,                // Whether not to upload issues that
                                        // were closed in JIRA. Note that if
                                        // you decide to upload an issue it will
                                        // be opened due to Gitlab API
                                        // limitations

    "sudo": true                        // Gitlab API sudo. Use this to post
                                        // issues to gitlab as original authors
  }
}
```

## Notes

### User Matching

The program will try to match users if they exist in both JIRA and Gitlab
instances, by email address. If no match is found the user field, if mandatory
will be infered to belong to the token owner (see: Gitlab Personal Access
Token).

For this to work fully (issues and comments appearing as if they were created
by the actual JIRA author) all users must exist in both services, with same
email adresses, and the user whose token is used on Gitlab must be a Gitlab
admin.

Finally, the token must have sudo rights (chosen when generating token), and
the `settings.sudo` config option must be set to `true`.

### Closed/Fixed issues

As of this writing there isn't a way to close an issue through the API that is
known to me, nor to relay the clossed state for a newly created issue through
it.

The `settings.ignoreDone` flag let's you configure whether you want to ignore
the resolved issues (i.e. not copy them at all) or if you want them copied even
if that means that the issue will be open in Gitlab.

Set the option to `true` if you don't want resolved issues copied over.

### Gitlab Personal Access Token

Gitlab API authentication uses a token which you can issue yourself by visiting

    https://<gitlab_base_uri>/profile/personal_access_tokens

On that page you need to name the token, tick all the access restriction boxes
and **copy the issued token string somewhere safe**, as AFAIK you cannot see it
again after you close the page (but you can issue another one).

This string is what you need to paste into the `token` key in the config.

Ticking all access restriction boxes is important. Unless you are an Admin user
of the Gitlab instance, and you've enabled 'sudo' access for the token full user
matching as described above will not work.

### Debug Mode

You can get very verbose output about the activities of the script by starting
the script with `DEBUG` environment variable set to a positive numerical value:

    $ DEBUG=1 node . go

The program uses [chalk](https://github.com/chalk/chalk) to colorize the output.
If you want to preserve the colorized output (for example for future inspection
with something like `less`) use the `FORCE_COLOR` environment variable:

    $ DEBUG=1 FORCE_COLOR=1 node . go | tee jira2gitlab.log

Then you can replay the logfile with colors using e.g. `less jira2gitlab.log`

## License

Licensed under MIT License. See `LICENSE` file in repository root.

## Acknowledgment / Rationale

Some of the code is based on the information from the following
[blog post](https://about.gitlab.com/2017/08/21/migrating-your-jira-issues-into-gitlab/),
which, in turn, is originally from
[here](https://medium.com/linagora-engineering/gitlab-rivals-winter-is-here-584eacf1fe9a)

Unfortunately, some of the original information is somewhat missleading and in
case of Gitlab API in particular, often wrong. The code from this project is
the working version of ideas presented in the post.

I've also chosen to use [`needle`](https://github.com/tomas/needle) over
`axios` due to it's much terser and simpler support for binary file I/O and the
fact that it doesn't needlessly translate to/from Node `http` idioms and API
that it wraps, making me rely on it's own documentation less (and, as tradition
dictates, almost everyone has made one AJAX lib for Node, and failed to
document it apart from the "look how nice my API is" marketing).
