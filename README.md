# n8n-nodes-uberllm

An [n8n](https://n8n.io) community node for [UberLLM](https://uberllm.dev). One API key for text, image and
video models: chat with GPT-OSS, DeepSeek, Claude and others, make images, and make videos with Veo 3.1,
Kling, Seedance, Wan, Hailuo, Vidu and more.

No UberLLM fee on requests. Adding credit by card costs 5.5% + $0.50.

- [Installation](#installation)
- [Credentials](#credentials)
- [Operations](#operations)
- [Example workflow](#example-workflow)
- [What a video costs](#what-a-video-costs)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

In n8n: **Settings → Community Nodes → Install**, enter `n8n-nodes-uberllm`, and confirm.
See n8n's [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

Self-hosted with npm:

```sh
cd ~/.n8n/nodes && npm install n8n-nodes-uberllm
```

Then restart n8n and search for **UberLLM** in the nodes panel.

## Credentials

1. Sign in at [uberllm.dev](https://uberllm.dev) with your email (you get a code, no password).
2. Open [Dashboard → API keys](https://uberllm.dev/dashboard/keys) and make a key. It starts with `ull-`.
3. Add credit in [Dashboard → Credits](https://uberllm.dev/dashboard/credits). You start at $0.
4. In n8n, create an **UberLLM API** credential and paste the key. n8n checks it by reading your balance.

The key is sent as `Authorization: Bearer <key>` to `https://api.uberllm.dev`, and nowhere else.

## Operations

| Operation          | What it does                                                                                                                                                                 | API route                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Chat**           | Sends your prompt (and an optional system message) to a text model and returns `content` and `usage` (with `usage.cost_usd`). Options: max tokens, temperature, JSON output. | `POST /v1/chat/completions`                                         |
| **Generate Image** | Makes one or more images from a prompt. Returns the links and, by default, the image files as binary data.                                                                   | `POST /v1/images/generations`                                       |
| **Generate Video** | Starts a video job (text-to-video, or image-to-video with a start image), waits for it, and returns the job with the video file as binary data.                              | `POST /v1/video/generations`, then `GET /v1/video/generations/{id}` |
| **Get Job**        | Reads a video job by id, and can download its file. Use it when **Wait for Completion** is off, or after a callback.                                                         | `GET /v1/video/generations/{id}`                                    |

The **Model** field lists the models you can call right now, with their price, from `GET /v1/models`.
You can also type a model id, for example `fal-ai/veo3.1/fast`, or use an expression.

Defaults are set to cost little: Chat uses `openai/gpt-oss-120b`, images use `venice/z-image-turbo`, and video
uses `fal-ai/veo3.1/fast` at 4 seconds, 720p, without sound.

### Generate Video fields

- **Start Image URL**: for image-to-video models, a public `https://` link to the first frame.
- **Duration (Seconds)**, **Resolution**, **Sound**: each model makes only some lengths and resolutions. A value
  the model does not make is refused before anything is charged, and the message lists the ones it does make.
  Each model's choices: `GET /v1/models/<model id>` or the model's page on uberllm.dev.
- **Wait for Completion**: on by default. The node checks the job every 10 seconds (change it with
  **Check Every**) and stops waiting after 15 minutes (**Give Up After**). The job keeps running if the node stops
  waiting; fetch it later with **Get Job**.
- **Download File**: puts the video in the binary field `data`. Video files are kept about 3 hours after the job
  ends, so download them in the same run.
- **Options**:
  - **Max Cost (USD)**: the job is refused, or cancelled at no charge, if it can cost more than this.
  - **Price Check Only**: checks the request and returns its price. Nothing is made and nothing is charged.
  - **Idempotency Key**: sending the same request again with the same key within 24 hours returns the same job
    instead of starting (and paying for) a second one.
  - **Fallback Models**: models tried in order only when the first one has no free provider right now.
  - **Callback URL**: a public `https://` link, such as an n8n Webhook node, that gets a `POST` with the job when
    it ends.
  - **Aspect Ratio**, **End Image URL**.

### Errors

Errors show UberLLM's own message, for example _"Veo 3.1 Fast Text to Video makes clips of 4, 6 or 8 seconds, not 5.
Pick one of those lengths."_, and the error code. Turn on **Settings → On Error → Continue** to get the message in
the item's `error` field instead of stopping the workflow.

## Example workflow

[`examples/text-to-video.json`](examples/text-to-video.json): a chat model writes a one-line shot description, and
Veo 3.1 Fast turns it into a 4-second 720p clip. Import it with **Workflows → Import from File**, then pick your
UberLLM credential on both UberLLM nodes.

More templates (faceless Shorts, product ads, image-to-video with Kling, a drop-in for the Gemini Veo templates):
[uberllm.dev/docs/n8n-video](https://uberllm.dev/docs/n8n-video).

## What a video costs

The price is per second of video and is listed on each model's page and in the **Model** dropdown. When a job
starts, the most it can cost is held from your balance (`max_cost_usd`) and the job is never billed more than that.
A job that fails or expires costs nothing, and the hold comes back. Credit you buy does not expire while your account is open. Use **Price Check Only** to see the
price of a request before you run it. Details: [uberllm.dev/docs/media](https://uberllm.dev/docs/media).

## Compatibility

Built with `@n8n/node-cli` 0.54 against `n8n-workflow` 2.x (`n8nNodesApiVersion` 1). No runtime dependencies.

## Resources

- [UberLLM docs](https://uberllm.dev/docs)
- [Images, video, music and speech](https://uberllm.dev/docs/media)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE.md)
