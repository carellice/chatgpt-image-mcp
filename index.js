#!/usr/bin/env node
// MCP server: generates and edits images through the ChatGPT/Codex app installed on this machine
// (`codex exec`, signed in with your ChatGPT account, no API key needed).
// Images are saved to disk and also returned to the client as previews.

import fs from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const GENERATED_DIR = path.join(CODEX_HOME, "generated_images");
const DEFAULT_OUTPUT_DIR =
  process.env.CHATGPT_IMAGE_OUTPUT_DIR || path.join(os.homedir(), "Pictures", "chatgpt-images");
// Codex refuses to start from directories with very long paths, so run it from a short one.
const WORK_DIR = path.join(os.tmpdir(), "chatgpt-image-mcp");
const TIMEOUT_MS = Number(process.env.CHATGPT_IMAGE_TIMEOUT_MS) || 10 * 60 * 1000;
// Previews above this size are not sent back to the client (image limit is ~5MB).
const MAX_PREVIEW_BYTES = 3.5 * 1024 * 1024;

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

let codexPathPromise;
function findCodex() {
  codexPathPromise ??= (async () => {
    if (process.env.CODEX_PATH) return process.env.CODEX_PATH;
    if (process.platform === "win32") {
      // The Microsoft Store app lives in WindowsApps, which can't be listed: ask Appx for its location.
      try {
        const { stdout } = await execFileAsync("powershell.exe", [
          "-NoProfile",
          "-Command",
          "(Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1).InstallLocation",
        ]);
        const dir = stdout.trim();
        if (dir) {
          const exe = path.join(dir, "app", "resources", "codex.exe");
          await fs.access(exe);
          return exe;
        }
      } catch {}
    }
    return "codex"; // standalone CLI on PATH
  })();
  return codexPathPromise;
}

function runCodex(prompt, images) {
  return new Promise(async (resolve, reject) => {
    const codex = await findCodex();
    await fs.mkdir(WORK_DIR, { recursive: true });

    const args = ["exec", "--json", "--skip-git-repo-check", "--ephemeral", "--ignore-user-config", "-s", "read-only"];
    if (process.env.CODEX_MODEL) args.push("-m", process.env.CODEX_MODEL);
    for (const img of images) args.push("-i", img);
    args.push("--", prompt);

    const child = spawn(codex, args, { cwd: WORK_DIR, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timeout: Codex did not finish within ${TIMEOUT_MS / 1000}s.`));
    }, TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          err.code === "ENOENT"
            ? "Codex CLI not found. Install the ChatGPT/Codex desktop app (or the Codex CLI) and sign in, " +
                "or set CODEX_PATH to the codex executable."
            : `Could not start Codex (${codex}): ${err.message}`
        )
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const events = stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      const threadId = events.find((e) => e.type === "thread.started")?.thread_id;
      const failure = events.find((e) => e.type === "turn.failed" || e.type === "error");
      const messages = events
        .filter((e) => e.type === "item.completed" && e.item?.type === "agent_message")
        .map((e) => e.item.text);
      const usage = events.find((e) => e.type === "turn.completed")?.usage;

      if (!threadId) {
        return reject(new Error(`Codex exited with code ${code} without results.\n${stderr.trim().slice(-1500)}`));
      }
      resolve({ threadId, failure, messages, usage, code, stderr });
    });
  });
}

async function collectImages(threadId) {
  const dir = path.join(GENERATED_DIR, threadId);
  let names;
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const files = await Promise.all(
    names
      .filter((n) => MIME[path.extname(n).toLowerCase()])
      .map(async (n) => {
        const p = path.join(dir, n);
        return { path: p, mtime: (await fs.stat(p)).mtimeMs };
      })
  );
  return files.sort((a, b) => a.mtime - b.mtime).map((f) => f.path);
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function buildPrompt(task, { n, orientation, transparent }) {
  const lines = ["Use the built-in image_gen tool directly.", task];
  if (orientation !== "auto") lines.push(`Orientation / aspect ratio: ${orientation}.`);
  if (transparent) lines.push("The image must have a genuinely transparent background (alpha channel).");
  lines.push(
    n > 1
      ? `Call image_gen exactly ${n} times, producing ${n} distinct variants.`
      : "Call image_gen exactly once.",
    "Do not read files, do not load skills, do not run commands, do not use any other tool.",
    "When finished, reply only with DONE."
  );
  return lines.join("\n");
}

async function generate(task, images, args) {
  try {
    for (const img of images) {
      if (!MIME[path.extname(img).toLowerCase()]) throw new Error(`Unsupported format: ${img} (use png, jpg or webp).`);
      if (!(await exists(img))) throw new Error(`File not found: ${img}`);
    }

    const run = await runCodex(buildPrompt(task, args), images);
    const generated = await collectImages(run.threadId);

    if (!generated.length) {
      const detail = run.failure ? JSON.stringify(run.failure) : run.messages.join("\n") || run.stderr.trim().slice(-1500);
      return errorResult(`No image was generated.\n${detail}`);
    }

    const dir = path.resolve(args.output_dir || DEFAULT_OUTPUT_DIR);
    await fs.mkdir(dir, { recursive: true });
    const base = args.filename ? slugify(args.filename) : `img-${new Date().toISOString().replace(/[:.]/g, "-")}`;

    const saved = [];
    const previews = [];
    for (let i = 0; i < generated.length; i++) {
      const ext = path.extname(generated[i]).toLowerCase();
      const suffix = generated.length > 1 ? `-${i + 1}` : "";
      let file = path.join(dir, `${base}${suffix}${ext}`);
      // Never overwrite existing files.
      for (let k = 2; await exists(file); k++) file = path.join(dir, `${base}${suffix}-${k}${ext}`);
      await fs.copyFile(generated[i], file);
      saved.push(file);

      if (args.include_preview) {
        const buf = await fs.readFile(file);
        if (buf.length <= MAX_PREVIEW_BYTES) {
          previews.push({ type: "image", data: buf.toString("base64"), mimeType: MIME[ext] });
        }
      }
    }

    const lines = [`Saved ${saved.length} image(s) (via ChatGPT/Codex):`, ...saved.map((f) => `- ${f}`)];
    if (run.usage) lines.push("", `Codex tokens: ${run.usage.input_tokens} input, ${run.usage.output_tokens} output`);
    if (args.include_preview && previews.length < saved.length) {
      lines.push("", "Some previews were omitted because they are too large.");
    }
    return { content: [{ type: "text", text: lines.join("\n") }, ...previews] };
  } catch (err) {
    return errorResult(err.message || String(err));
  }
}

function errorResult(msg) {
  return { isError: true, content: [{ type: "text", text: `Error: ${msg}` }] };
}

const commonParams = {
  orientation: z
    .enum(["auto", "square", "landscape", "portrait"])
    .default("auto")
    .describe("Image orientation."),
  transparent: z.boolean().default(false).describe("Transparent background (PNG with alpha)."),
  n: z.number().int().min(1).max(4).default(1).describe("Number of variants to generate."),
  output_dir: z
    .string()
    .optional()
    .describe(`Absolute directory to save files in. Default: ${DEFAULT_OUTPUT_DIR}`),
  filename: z
    .string()
    .optional()
    .describe("Base file name without extension (e.g. 'hero-banner'). Default: timestamp."),
  include_preview: z
    .boolean()
    .default(true)
    .describe("If true, also return the image so the assistant can see it."),
};

const server = new McpServer({ name: "chatgpt-image", version: "2.0.0" });

server.registerTool(
  "generate_image",
  {
    title: "Generate image (ChatGPT)",
    description:
      "Generate images with ChatGPT's image generator, through the ChatGPT/Codex app installed on this machine " +
      "and the user's ChatGPT account (no API key). Local images can be passed as style/composition references. " +
      "Each call takes about 30-90 seconds. Saves the files to disk and returns their paths plus a preview.",
    inputSchema: {
      prompt: z.string().min(1).describe("Detailed description of the image to generate."),
      reference_images: z
        .array(z.string())
        .max(10)
        .default([])
        .describe("Absolute paths of images to use as references (optional)."),
      ...commonParams,
    },
  },
  async (args) => {
    const task = args.reference_images.length
      ? `Create a new image using the attached image(s) only as reference for style/composition/subject. Request:\n${args.prompt}`
      : `Create this image:\n${args.prompt}`;
    return generate(task, args.reference_images.map((p) => path.resolve(p)), args);
  }
);

server.registerTool(
  "edit_image",
  {
    title: "Edit image (ChatGPT)",
    description:
      "Edit an existing image with ChatGPT's image generator (e.g. change background or colors, remove or add objects), " +
      "through the ChatGPT/Codex app installed on this machine. The original file is never modified: the result is saved as a new file.",
    inputSchema: {
      prompt: z.string().min(1).describe("What to change. Also state what must stay the same."),
      image_path: z.string().describe("Absolute path of the image to edit (png, jpg, webp)."),
      extra_images: z
        .array(z.string())
        .max(9)
        .default([])
        .describe("Additional supporting images, e.g. an object or logo to insert (optional)."),
      ...commonParams,
    },
  },
  async (args) => {
    const images = [args.image_path, ...args.extra_images].map((p) => path.resolve(p));
    const task =
      `Edit the first attached image as follows, preserving everything not mentioned:\n${args.prompt}` +
      (args.extra_images.length ? "\nThe other attached images are supporting inputs for the edit." : "");
    return generate(task, images, args);
  }
);

await server.connect(new StdioServerTransport());
