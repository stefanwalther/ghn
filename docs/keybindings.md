# Keybindings

ghn is keyboard-first with vim-style single-key bindings: `j` / `k` to move,
`x` to select, `d` for done, no mouse needed.

Press `?` anywhere in the app for the full list. That dialog is the source of
truth; this page mirrors it and may lag behind it.

Single-key bindings stay out of the way while typing in inputs. `Cmd` below
means `Ctrl` on Linux.

## Navigate

| Keys | Action |
|---|---|
| `j` / `k` | Move focus down / up, or to the next / previous thread when details are open |
| `[` / `]` | Jump to the previous / next thread while details are open |
| `o` | Open the focused thread in a new tab |
| `Shift+D` | Open the focused thread details in the side panel |

## Triage

Triaging acts on the selection, or on the focused row when nothing is selected.

| Keys | Action |
|---|---|
| `x` | Toggle the focused row |
| `d` | Mark done |
| `Shift+U` | Unsubscribe, with confirmation |
| `u` | Mark unread |
| `r` | Mark read |
| `s` | Refresh from GitHub |
| `c` | Copy the focused thread link |
| `a` | Select or clear all visible rows |

## App

| Keys | Action |
|---|---|
| `Cmd+K` | Search threads, repos, commands, and filters |
| `Cmd+B` | Show or hide the main menu |
| `Cmd+F12` | Cycle light / dark / system theme |
| `Alt` (hold) | Reveal key hints |
| `Esc` | Clear selection, or close the open dialog |
| `?` | Show the shortcut list |
