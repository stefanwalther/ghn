# ghn

## Configuration

The database location is configurable so it can live in a shared folder (e.g. Dropbox).

Note: SQLite supports only one writer at a time. Let Dropbox finish syncing
before opening the app on another machine.

Config file (deployed via dotfiles):

- `$XDG_CONFIG_HOME/ghn/config.json`, otherwise `~/.config/ghn/config.json`
- Override the config file location with `GHN_CONFIG_PATH`

`config.json` format (see `config.example.json`):

```json
{
  "databasePath": "~/Dropbox/ghn/ghn.db"
}
```

Resolution order for the database path:

1. `GHN_DB_PATH` environment variable (highest precedence)
2. `databasePath` (or `dbPath` alias) from the config file
3. Default: `./data/ghn.db` relative to where the app runs

Path values support `~`, `$VAR`, and `${VAR}` expansion. Relative paths
resolve against the current working directory. Parent directories are created
automatically.
