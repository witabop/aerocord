# Aerocord

A Discord client for Windows that brings back the look and feel of **Windows Live Messenger 2009**. Built with Electron, React, and a Python backend powered by [discord.py-self](https://github.com/dolfies/discord.py-self).

> **Disclaimer:** Aerocord automates a user account, which is against the Discord Terms of Service. Use at your own risk.

![Aerocord](docs/assets/aerocordlogo.png)

## Download

Download Aerocord from the project’s GitHub Releases page. Grab the **Windows installer** (`.exe`) - it’s the easiest way to install on Windows 10 or 11 (64-bit).

[**Releases**](https://github.com/witabop/aerocord/releases)

## About

Aerocord is a spiritual fork of [Aerochat](https://github.com/not-nullptr/Aerochat), a native C#/WPF Discord client themed after WLM 2009. Aerochat is an excellent project, but it is tightly coupled to the Windows desktop via WPF and .NET (for good reason of course as it makes it more back portable) and was missing some key features. Aerocord takes the same concept, a Windows Messenger-style Discord experience and rebuilds it on top of Electron and React so the UI layer is web-based and easier to iterate on. The visual language, layout, and general UX philosophy are heavily inspired by Aerochat, and the project would not exist without it.

## Why discord.py-self?

Because Aerocord is an Electron app, the obvious choice for talking to Discord would have been a JavaScript library like [discord.js-selfbot-v13](https://github.com/aiko-chan-ai/discord.js-selfbot-v13). In practice, that library is pinned to an older discord.js v13 base that has not kept pace with Discord API changes, and its voice implementation is unreliable for user-account use cases. [discord.py-self](https://github.com/dolfies/discord.py-self) is actively maintained, covers far more of the user-account API surface (billing, relationships, protobuf settings, and more), and has solid voice support through PyNaCl.

To bridge the gap between the Node.js main process and the Python Discord client, Aerocord spawns a Python sidecar process and communicates with it over stdin/stdout using an NDJSON-based RPC protocol. The Electron side sends commands (login, send message, join voice, etc.) and the Python side streams events back. It adds a layer of complexity, but the trade-off is a much more capable and up-to-date Discord backend.

<img width="475" height="809" alt="image" src="https://github.com/user-attachments/assets/56e98aca-64b3-4a5c-a42a-6503c579d012" />



## Features

- **Messaging** — send, edit, delete, reply, attachments, image previews
- **Voice** — join/leave voice channels, self-mute/deafen, per-user volume, speaking indicators
- **DM Calls** — start, accept, decline, and hang up direct-message calls
- **Friends & Contacts** — friend requests, DM list, server list, favourites
- **Profiles** — can click on usernames or server list entry to view a user profile
- **Status & Presence** — online, idle, DND, invisible, custom status text
- **Scenes** — 30+ WLM-style background scenes with dynamic colours
- **Emojis & Gifs** — Includes WLM09 emojis as well as so gifs from that same era
- **Notifications** — toast-style notification popups
- **Settings** — persistent per-user configuration

And much more!


<img width="1035" height="867" alt="image" src="https://github.com/user-attachments/assets/65e12e17-2207-4f46-8a5b-5447ee6d80df" />


## Limitations

- **Larger servers** — Aerocord currently struggles to handle very large servers. It works well for smaller communities and groups of up to around 1000 people; performance and stability on big servers are known issues. Improving this is a priority and will be worked on in future updates.
- **Operating systems** — The application is restricted to modern operating systems: **Windows** (primary, supported) and **Linux** (untested but should work).

## Getting Started

### Prerequisites

- **I STRONGLY RECCOMEND USING THIS WITH A WINDOWS 10 to 7 CONVERSION TOOL** (e.g. Classic7, Reunion7, Revert8Plus). If you choose not to, you will **NOT** have the native windows 7 application titlebar and borders.
- **Windows 10/11 or Linux (probably)** (64-bit)
- **Node.js** (LTS recommended)
- **Python 3.10+** with pip

### Install dependencies

```bash
npm install
pip install -r python/requirements.txt
```

### Run in development

```bash
npm start
```

### Package for distribution

```bash
npm run package
```

This produces a portable build via Electron Forge. You can also use the included Inno Setup script to create an installer.

## Project Structure

```
aerocord/
├── src/
│   ├── main/           # Electron main process (IPC, window manager, Discord bridge)
│   ├── renderer/       # React UI (login, home, chat, settings, notification)
│   ├── preload/        # Preload scripts for IPC
│   └── assets/         # Images, icons, scenes
├── python/
│   └── aerocord_bridge/  # Python sidecar (discord.py-self client, voice, events)
├── docs/               # GitHub Pages website
└── package.json
```

## Credits

- **[Aerochat](https://github.com/not-nullptr/Aerochat)** — the original native WLM 09 themed Discord client that inspired this project.
- **[discord.py-self](https://github.com/dolfies/discord.py-self)** — the Python library that powers Aerocord's Discord backend.

## Questions or concerns?
- Feel free to open an issue on the issues tab of this page!
- If its urgent you can also reach out to me directly at zoltar.cc on discord. Can't promise I'll respond quickly but I'll try!

## License

[MIT](LICENSE)
