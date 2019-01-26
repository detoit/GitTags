const Handlebars = require('handlebars');
const handlebarsHelpers = require('handlebars-helpers');

const sqlite = require('sqlite3').verbose();
const eris = require('eris');
const fetch = require('node-fetch');

const config = require('./config.json');

const client = new eris.Client(config.token);
const db = new sqlite.Database('db.db');

const fetchSettings = db.prepare('SELECT * FROM options WHERE channelID = (?)');
const setSettings = db.prepare('INSERT OR REPLACE INTO options (channelID, owner, repo) VALUES (?, ?, ?)')

/**
 * Handlebars Helpers
 */

Handlebars.registerHelper('for', (n, block) => {
  let result = '';
  for (let i = 0; i < n; i += 1) {
    result += block.fn(i);
  }
  return result;
});
Handlebars.registerHelper('timestamp', () => Date.now())
handlebarsHelpers.array({handlebars: Handlebars});
handlebarsHelpers.comparison({handlebars: Handlebars});
handlebarsHelpers.inflection({handlebars: Handlebars});
handlebarsHelpers.match({handlebars: Handlebars});
handlebarsHelpers.misc({handlebars: Handlebars});
handlebarsHelpers.number({handlebars: Handlebars});
handlebarsHelpers.object({handlebars: Handlebars});
handlebarsHelpers.regex({handlebars: Handlebars});
handlebarsHelpers.string({handlebars: Handlebars});
handlebarsHelpers.url({handlebars: Handlebars});
handlebarsHelpers.date({handlebars: Handlebars});
handlebarsHelpers.math({handlebars: Handlebars});
// handlebarsHelpers.utils({handlebars: Handlebars});

// Create the Channels Database if it doesn't exist
db.exec(`CREATE TABLE IF NOT EXISTS options (
  channelID TEXT NOT NULL,
  owner TEXT,
  repo TEXT,
  PRIMARY KEY(channelID)
)`);

client.on('messageCreate', (message) => {
  fetchSettings.get(message.channel.id, (err, row) => {
    let owner = config.default.owner;
    let repo = config.default.repo;

    // If the row exists, set the owner and repo to their custom settings
    if (row) {
      owner = row.owner;
      repo = row.repo;
    }

    // If the settings prefix is encountered...
    if (message.content.startsWith(config.prefix.settings)) {
      // Get the command the user is trying to get at
      const command = message.content.substr(config.prefix.settings.length).trim();

      if (command.startsWith('set')) {
        // If in a server and doesn't have the correct roles, complain
        // Otherwise, or if not in a server, set the configuration
        if ((message.member && !message.member.permission.has('manageGuild')) && !config.owners.includes(message.author.id)) {
          message.channel.createMessage('You don\'t have the "Manage Guild" permission!');
        } else {
          const input = command.substr(3).trim().split(/[;/]/);
          owner = input[0] || config.default.owner;
          repo = input[1] || config.default.repo;
          setSettings.run(message.channel.id, encodeURIComponent(owner), encodeURIComponent(repo));
          message.channel.createMessage(`**Set Configuration**\nOwner: ${owner}\nRepo: ${repo}`);
        }

      // If the user calls the info command, print out their current configuration
      } else if (command.startsWith('info')) {
        message.channel.createMessage(`**Current Configuration**\nOwner: ${owner}\nRepo: ${repo}`);
      }

    // If the output prefix is encountered
    } else if (message.content.startsWith(config.prefix.output)) {
      // Get the name of the tag
      const query = message.content.substr(config.prefix.output.length).trim();

      // If the tag is actually there, but isn't too long
      if (query.length > 0 && query.length < 1024) {
        // Fetch that tag
        fetch(`https://raw.githubusercontent.com/${owner}/${repo}/master/tags/${encodeURIComponent(query)}.handlebars`)
          .then((response) => {
            // If the ".handlebars" fetch was OK, carry on
            if (response.ok) {
              return response;
            } else {
              // Otherwise, fetch one with ".hbs"
              return fetch(`https://raw.githubusercontent.com/${owner}/${repo}/master/tags/${encodeURIComponent(query)}.hbs`)
            }
          })
          .then((response) => {
            // If the ".hbs" fetch was OK, carry on
            if (response.ok) {
              return response;
            } else {
              // Otherwise, fetch one without handlebars
              return fetch(`https://raw.githubusercontent.com/${owner}/${repo}/master/tags/${encodeURIComponent(query)}`)
            }
          })
          .then(data => data.text())
          .then((text) => {
            const template = Handlebars.compile(text);
            const result = template();

            // If the text length is too long, tell the user that
            if (result.length <= 2000) {
              message.channel.createMessage(result)
            } else {
              message.channel.createMessage('_File too long for consumption_');
            }
          })
          .catch((err) => {
            message.channel.createMessage(err.message);
          });
      }
    }
  })
});

client.on('connect', () => {
  console.log('Connected!');
})

client.connect();

process.on('SIGINT', function() {
  console.log('Goodbye!');
  db.close();
  client.disconnect();
  process.exit(0);
});
