<div align="center">

# 🎨 chatgpt-image-mcp

**Let Claude generate and edit images with ChatGPT, using the ChatGPT app already on your computer.**
No API key and no extra billing: images are generated with your ChatGPT subscription.

![MCP](https://img.shields.io/badge/MCP-server-8A2BE2)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

</div>

---

| `generate_image` | `edit_image` |
|:---:|:---:|
| ![Generated example](assets/example-generate.jpg) | ![Edited example](assets/example-edit.jpg) |
| *"a cute minimalist flat illustration of a fox reading a book", landscape* | *"give the fox a small pair of round glasses"* |

## ✨ Features

- 🖼️ **Generate** images from a text prompt, optionally guided by reference images
- ✏️ **Edit** existing images (change backgrounds or colors, add or remove objects) without touching the original
- 🔑 **No API key**: uses the Codex CLI bundled with the ChatGPT desktop app, signed in with your ChatGPT account
- 👀 **Previews**: the client gets the image back inline, so Claude can look at the result and iterate
- 💾 **Saved to disk** wherever you want, with safe file names and no overwrites
- 🧩 Works with **Claude Code**, **Claude Desktop** and any other MCP client

> **New here?** Jump to [Getting started](#-getting-started). You can even let your AI install it for you.

## ⚙️ How it works

```mermaid
sequenceDiagram
    participant C as Claude (MCP client)
    participant S as chatgpt-image-mcp
    participant X as codex exec (ChatGPT app)
    C->>S: generate_image / edit_image
    S->>X: headless, read-only run with the built-in image_gen tool
    X-->>S: image saved in ~/.codex/generated_images/<thread>
    S->>S: copy to output_dir
    S-->>C: file path(s) + inline preview
```

The ChatGPT desktop app for Windows (Microsoft Store package `OpenAI.Codex`) ships the `codex` CLI.
That CLI is already signed in with your ChatGPT account and can generate images with its built-in
`image_gen` tool. For each request, this server runs `codex exec` in the background with a
locked-down configuration:

- `--sandbox read-only` and `--ignore-user-config`, so it can't run commands and loads none of your personal plugins
- `--ephemeral`, so it leaves no chat history behind

The server then collects the resulting image from `~/.codex/generated_images/`.

## 🚀 Getting started

Setup takes about 5 minutes. You can let your AI assistant do it for you (option A), or follow the steps yourself (option B).

### Option A: let your AI set it up 🤖

Open **Claude Code** (or another AI coding agent that can run commands on your computer) and paste this prompt:

```text
Install and configure the MCP server https://github.com/carellice/chatgpt-image-mcp for me.

1. Check that Node.js 18 or newer is installed (`node --version`). If it isn't, stop and tell me to install it from https://nodejs.org.
2. Find the Codex CLI. On Windows it ships with the ChatGPT desktop app:
   PowerShell: (Get-AppxPackage -Name OpenAI.Codex).InstallLocation + "\app\resources\codex.exe"
   On macOS/Linux, look for `codex` on the PATH.
   If you can't find it, stop and tell me to install the ChatGPT desktop app from https://chatgpt.com/download and sign in.
3. Run `<codex> login status`. It must say "Logged in using ChatGPT". If it doesn't, stop and tell me to open the ChatGPT app and sign in.
4. Clone the repository into a permanent folder (for example ~/Documents/GitHub/MCPs/chatgpt-image-mcp, not a temp folder) and run `npm install` there.
5. Register it for all my projects:
   claude mcp add chatgpt-image -s user -- node "<absolute path>/index.js"
   (For Claude Desktop, add the equivalent entry to claude_desktop_config.json instead.)
6. Verify it with `claude mcp get chatgpt-image`: the status must be "Connected".
7. Tell me where you installed it and remind me to start a new session to use it.
```

Then start a new session and ask for an image.

### Option B: step by step 🧭

**1. Install the ChatGPT desktop app and sign in**

Download it from [chatgpt.com/download](https://chatgpt.com/download) (on Windows it is also on the Microsoft Store), open it and sign in with your ChatGPT account. Your plan needs to include image generation.

**2. Check the sign-in** (optional but recommended)

On Windows the app's `codex` CLI isn't on your `PATH`, so call it through its full path in **PowerShell**:

```powershell
& "$((Get-AppxPackage -Name OpenAI.Codex).InstallLocation)\app\resources\codex.exe" login status
```

It should print `Logged in using ChatGPT`.

> 🍎🐧 **macOS / Linux:** install the standalone Codex CLI (`npm i -g @openai/codex`) and run `codex login`. This hasn't been tested yet, so feedback is welcome.

**3. Install Node.js 18 or newer**

Check with `node --version`. If it's missing, install the LTS version from [nodejs.org](https://nodejs.org).

**4. Download the server into a permanent folder**

```bash
git clone https://github.com/carellice/chatgpt-image-mcp.git
cd chatgpt-image-mcp
npm install
```

> 📌 Pick a folder you won't move or delete, such as `Documents/GitHub/MCPs/chatgpt-image-mcp`. Your AI client starts the server from this exact path every time.

**5. Register it in your AI client**

<details open>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add chatgpt-image -s user -- node "C:/full/path/to/chatgpt-image-mcp/index.js"
```

`-s user` makes it available in every project. Check it with `claude mcp get chatgpt-image`, which should report `✔ Connected`.

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Open **Settings → Developer → Edit Config** and add this to `claude_desktop_config.json`, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "chatgpt-image": {
      "command": "node",
      "args": ["C:/full/path/to/chatgpt-image-mcp/index.js"]
    }
  }
}
```

</details>

<details>
<summary><b>Other MCP clients</b></summary>

Any client that supports stdio MCP servers works. The command is `node` and the only argument is the full path to `index.js`.

</details>

**6. Try it**

Start a **new** session and ask:

> *Generate an image of a red apple on a white background.*

After about a minute you'll get the file path and a preview. 🎉

> You never need to start the server by hand: your AI client launches it in the background when a session starts and stops it when the session ends.

## 💬 Usage

Just ask in plain language:

> *Generate a landscape hero image for the homepage: minimal, warm tones, a desk with a laptop and a plant.*

> *Create a coffee cup icon with a transparent background and save it in `public/icons`.*

> *Edit `assets/logo.png` so the background is navy blue, keep everything else identical.*

> *Give me 3 variants of a blog cover about remote work.*

Each image takes roughly **30–90 seconds**.

## 🛠️ Tools

### `generate_image`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `prompt` | string | **required** | Detailed description of the image |
| `reference_images` | string[] | `[]` | Absolute paths of up to 10 images to use as style or composition references |
| `orientation` | `auto` \| `square` \| `landscape` \| `portrait` | `auto` | Aspect ratio |
| `transparent` | boolean | `false` | Transparent background (PNG with alpha) |
| `n` | 1–4 | `1` | Number of variants |
| `output_dir` | string | `~/Pictures/chatgpt-images` | Where to save the files |
| `filename` | string | timestamp | Base file name, without extension |
| `include_preview` | boolean | `true` | Return the image inline to the client |

### `edit_image`

Accepts the same optional parameters, plus:

| Parameter | Type | Description |
|---|---|---|
| `prompt` | string | **required.** What to change, and what must stay the same |
| `image_path` | string | **required.** Absolute path of the image to edit (png, jpg or webp) |
| `extra_images` | string[] | Up to 9 supporting images, such as a logo or an object to insert |

## 🔧 Configuration

Every setting is optional and is set through environment variables (in the `env` block of your MCP config).

| Variable | Default | Description |
|---|---|---|
| `CHATGPT_IMAGE_OUTPUT_DIR` | `~/Pictures/chatgpt-images` | Default output directory |
| `CODEX_PATH` | auto-detected | Path to the `codex` executable |
| `CODEX_HOME` | `~/.codex` | Codex home directory |
| `CODEX_MODEL` | Codex default | Model that orchestrates the `image_gen` call |
| `CHATGPT_IMAGE_TIMEOUT_MS` | `600000` | Timeout for each call |

## 🩺 Troubleshooting

| Problem | Fix |
|---|---|
| `Codex CLI not found` | Install or update the ChatGPT desktop app, or set `CODEX_PATH`. On Windows the app path changes with every update; the server finds it again on each start through `Get-AppxPackage OpenAI.Codex`. |
| `No image was generated` | Check the sign-in (step 2 of the setup). Your plan's image limit may have been reached, or the prompt may have been refused by content policies. |
| It worked, then stopped | You probably moved or renamed the server folder. Register it again with the new path. |
| The tool doesn't show up | Start a **new** session. Check `claude mcp get chatgpt-image`. |
| Previews are missing | Images over ~3.5 MB aren't sent inline, but they are still saved to disk. |

## ⚠️ Notes and limitations

- This project relies on how the Codex CLI behaves today: `codex exec --json`, the built-in `image_gen` tool and the `generated_images` folder. A future Codex update could change any of these.
- Usage counts against your ChatGPT plan's limits, and each call also uses some Codex tokens (roughly 30k–100k input tokens).
- Only orientation can be controlled, not exact pixel sizes. Codex picks the resolution.
- The original files in `~/.codex/generated_images/` are kept. Delete them yourself if you need the space.

## 📄 License

[MIT](LICENSE)

---

<sub>This is an unofficial community project. It is not affiliated with or endorsed by OpenAI or Anthropic. ChatGPT and Codex are trademarks of OpenAI.</sub>
