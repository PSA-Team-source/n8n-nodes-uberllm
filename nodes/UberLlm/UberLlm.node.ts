import type {
	IBinaryKeyData,
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError, sleep } from 'n8n-workflow';
import { searchChatModels, searchImageModels, searchVideoModels } from './listSearch';
import { apiRequest, downloadBinary } from './transport';

const TERMINAL = ['succeeded', 'failed', 'canceled', 'expired'];

function modelField(
	operation: string,
	searchListMethod: string,
	defaultModel: string,
	example: string,
): INodeProperties {
	return {
		displayName: 'Model',
		name: 'model',
		type: 'resourceLocator',
		default: { mode: 'id', value: defaultModel },
		required: true,
		description:
			'The model to use. The list shows the models you can call right now, with their price.',
		displayOptions: { show: { operation: [operation] } },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod, searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: example,
			},
		],
	};
}

function binaryFields(operation: string): INodeProperties[] {
	return [
		{
			displayName: 'Download File',
			name: 'download',
			type: 'boolean',
			default: false,
			displayOptions: { show: { operation: [operation] } },
			description:
				'Whether to download the result into the item as a file. Video files are kept about 3 hours, image links about 15 minutes.',
		},
		{
			displayName: 'Put Output File in Field',
			name: 'binaryPropertyName',
			type: 'string',
			default: 'data',
			displayOptions: { show: { operation: [operation], download: [true] } },
			hint: 'The name of the output binary field to put the file in',
		},
	];
}

export class UberLlm implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'UberLLM',
		name: 'uberLlm',
		icon: { light: 'file:../../icons/uberllm.svg', dark: 'file:../../icons/uberllm.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Chat, images and video (Veo, Kling, Seedance and more) with one UberLLM key',
		defaults: { name: 'UberLLM' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'uberLlmApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Chat',
						value: 'chat',
						description: 'Send a message to a text model and get its answer',
						action: 'Chat with a model',
					},
					{
						name: 'Generate Image',
						value: 'generateImage',
						description: 'Make an image from a prompt',
						action: 'Generate an image',
					},
					{
						name: 'Generate Video',
						value: 'generateVideo',
						description: 'Start a video job and wait for the file',
						action: 'Generate a video',
					},
					{
						name: 'Get Job',
						value: 'getJob',
						description: 'Check a video job and download its file',
						action: 'Get a video job',
					},
				],
				default: 'chat',
			},

			// ----- Chat -----
			modelField('chat', 'searchChatModels', 'openai/gpt-oss-120b', 'openai/gpt-oss-120b'),
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				displayOptions: { show: { operation: ['chat'] } },
				description: 'Your message to the model',
			},
			{
				displayName: 'Options',
				name: 'chatOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { operation: ['chat'] } },
				options: [
					{
						displayName: 'System Message',
						name: 'system',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						description: 'Instructions the model follows for the whole answer',
					},
					{
						displayName: 'Max Tokens',
						name: 'maxTokens',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1024,
						description: 'The most tokens the answer may have',
					},
					{
						displayName: 'Temperature',
						name: 'temperature',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 2, numberPrecision: 2 },
						default: 0.7,
						description: 'Higher is more varied, lower is more exact',
					},
					{
						displayName: 'JSON Output',
						name: 'jsonOutput',
						type: 'boolean',
						default: false,
						description:
							'Whether to ask for a JSON object (response_format json_object). Say in the prompt what the JSON should hold.',
					},
				],
			},

			// ----- Generate Image -----
			modelField(
				'generateImage',
				'searchImageModels',
				'venice/z-image-turbo',
				'venice/z-image-turbo',
			),
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				required: true,
				displayOptions: { show: { operation: ['generateImage'] } },
				description: 'What the image should show',
			},
			{
				displayName: 'Options',
				name: 'imageOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { operation: ['generateImage'] } },
				options: [
					{
						displayName: 'Size',
						name: 'size',
						type: 'string',
						default: '1024x1024',
						description: 'Width x height in pixels, for example 1024x1024 or 1024x1792',
					},
					{
						displayName: 'Number of Images',
						name: 'n',
						type: 'number',
						typeOptions: { minValue: 1, maxValue: 10 },
						default: 1,
					},
					{
						displayName: 'Max Cost (USD)',
						name: 'maxCost',
						type: 'number',
						typeOptions: { minValue: 0, numberPrecision: 4 },
						default: 0,
						description:
							'Refuse the request if it can cost more than this. 0 means no limit beyond your balance.',
					},
				],
			},
			...binaryFields('generateImage').map((p) =>
				p.name === 'download' ? { ...p, default: true } : p,
			),

			// ----- Generate Video -----
			modelField('generateVideo', 'searchVideoModels', 'fal-ai/veo3.1/fast', 'fal-ai/veo3.1/fast'),
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				required: true,
				displayOptions: { show: { operation: ['generateVideo'] } },
				description: 'What the video should show',
			},
			{
				displayName: 'Start Image URL',
				name: 'imageUrl',
				type: 'string',
				default: '',
				displayOptions: { show: { operation: ['generateVideo'] } },
				description:
					'For image-to-video models: a public https:// link to the first frame. Leave empty for text-to-video.',
			},
			{
				displayName: 'Duration (Seconds)',
				name: 'durationSeconds',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 4,
				displayOptions: { show: { operation: ['generateVideo'] } },
				description:
					"Clip length. Each model makes only some lengths (Veo 3.1 Fast: 4, 6 or 8). 0 uses the model's shortest.",
			},
			{
				displayName: 'Resolution',
				name: 'resolution',
				type: 'string',
				default: '720p',
				displayOptions: { show: { operation: ['generateVideo'] } },
				description:
					"For example 480p, 720p or 1080p. Leave empty for the model's default. A value the model does not make is refused before anything is charged, with the list it does make.",
			},
			{
				displayName: 'Sound',
				name: 'audio',
				type: 'options',
				default: 'off',
				displayOptions: { show: { operation: ['generateVideo'] } },
				options: [
					{ name: 'Off', value: 'off' },
					{ name: 'On', value: 'on' },
					{ name: 'Model Default', value: 'default' },
				],
				description:
					'Whether the clip has a sound track. On costs more on models that charge for sound.',
			},
			{
				displayName: 'Wait for Completion',
				name: 'wait',
				type: 'boolean',
				default: true,
				displayOptions: { show: { operation: ['generateVideo'] } },
				description:
					'Whether to wait until the video is done. Off returns the job right away; check it later with Get Job.',
			},
			{
				displayName: 'Check Every (Seconds)',
				name: 'pollInterval',
				type: 'number',
				typeOptions: { minValue: 3 },
				default: 10,
				displayOptions: { show: { operation: ['generateVideo'], wait: [true] } },
			},
			{
				displayName: 'Give Up After (Minutes)',
				name: 'timeoutMinutes',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 15,
				displayOptions: { show: { operation: ['generateVideo'], wait: [true] } },
				description:
					'Stop waiting after this long and return the job as it is. The job keeps running; use Get Job to fetch it.',
			},
			...binaryFields('generateVideo').map((p) => ({
				...p,
				...(p.name === 'download' ? { default: true } : {}),
				displayOptions: {
					show: { ...(p.displayOptions?.show ?? {}), wait: [true] },
				},
			})),
			{
				displayName: 'Options',
				name: 'videoOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { operation: ['generateVideo'] } },
				options: [
					{
						displayName: 'Aspect Ratio',
						name: 'aspectRatio',
						type: 'string',
						default: '16:9',
						description: 'For example 16:9, 9:16 or 1:1',
					},
					{
						displayName: 'Callback URL',
						name: 'callbackUrl',
						type: 'string',
						default: '',
						description:
							'A public https:// link (for example an n8n Webhook) that gets a POST with the job when it ends',
					},
					{
						displayName: 'End Image URL',
						name: 'endImageUrl',
						type: 'string',
						default: '',
						description:
							'For models that blend two pictures: a public https:// link to the last frame',
					},
					{
						displayName: 'Fallback Models',
						name: 'fallbackModels',
						type: 'string',
						default: '',
						description:
							'Comma-separated model IDs tried in order only when the first model has no free provider right now',
					},
					{
						displayName: 'Idempotency Key',
						name: 'idempotencyKey',
						type: 'string',
						default: '',
						description:
							'Any unique text. Sending the same request again with the same key within 24 hours returns the same job instead of a second one.',
					},
					{
						displayName: 'Max Cost (USD)',
						name: 'maxCost',
						type: 'number',
						typeOptions: { minValue: 0, numberPrecision: 4 },
						default: 0,
						description:
							'Refuse the job if it can cost more than this, before anything is charged. 0 means no limit beyond your balance.',
					},
					{
						displayName: 'Price Check Only',
						name: 'validate',
						type: 'boolean',
						default: false,
						description:
							'Whether to only check the request and return its price. Nothing is made and nothing is charged.',
					},
				],
			},

			// ----- Get Job -----
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { operation: ['getJob'] } },
				description: 'The ID returned by Generate Video',
			},
			...binaryFields('getJob'),
		],
	};

	methods = {
		listSearch: { searchChatModels, searchImageModels, searchVideoModels },
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'chat') {
					out.push(await chat.call(this, i));
				} else if (operation === 'generateImage') {
					out.push(await generateImage.call(this, i));
				} else if (operation === 'generateVideo') {
					out.push(await generateVideo.call(this, i));
				} else if (operation === 'getJob') {
					const jobId = (this.getNodeParameter('jobId', i) as string).trim();
					const job = await apiRequest.call(
						this,
						'GET',
						`/v1/video/generations/${encodeURIComponent(jobId)}`,
						undefined,
						undefined,
						i,
					);
					out.push(await jobItem.call(this, job, i));
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown operation "${operation}"`, {
						itemIndex: i,
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// A NodeOperationError passes through as is; an API error keeps its
				// message and description.
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}
		return [out];
	}
}

function modelId(this: IExecuteFunctions, i: number): string {
	const model = (this.getNodeParameter('model', i, '', { extractValue: true }) as string).trim();
	if (!model) throw new NodeOperationError(this.getNode(), 'Pick a model', { itemIndex: i });
	return model;
}

async function chat(this: IExecuteFunctions, i: number): Promise<INodeExecutionData> {
	const prompt = this.getNodeParameter('prompt', i) as string;
	const opts = this.getNodeParameter('chatOptions', i, {}) as IDataObject;
	const messages: IDataObject[] = [];
	if (opts.system) messages.push({ role: 'system', content: opts.system });
	messages.push({ role: 'user', content: prompt });
	const body: IDataObject = { model: modelId.call(this, i), messages };
	if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
	if (opts.temperature !== undefined) body.temperature = opts.temperature;
	if (opts.jsonOutput) body.response_format = { type: 'json_object' };

	const res = await apiRequest.call(this, 'POST', '/v1/chat/completions', body, undefined, i);
	const choice = ((res.choices as IDataObject[] | undefined) ?? [])[0] ?? {};
	const message = (choice.message ?? {}) as IDataObject;
	return {
		json: {
			content: typeof message.content === 'string' ? message.content : '',
			model: res.model,
			finish_reason: choice.finish_reason,
			usage: res.usage,
			id: res.id,
		},
		pairedItem: { item: i },
	};
}

async function generateImage(this: IExecuteFunctions, i: number): Promise<INodeExecutionData> {
	const opts = this.getNodeParameter('imageOptions', i, {}) as IDataObject;
	const body: IDataObject = {
		model: modelId.call(this, i),
		prompt: this.getNodeParameter('prompt', i) as string,
		n: opts.n ?? 1,
	};
	if (opts.size) body.size = opts.size;
	if (typeof opts.maxCost === 'number' && opts.maxCost > 0) body.max_cost = opts.maxCost;

	const res = await apiRequest.call(this, 'POST', '/v1/images/generations', body, undefined, i);
	const data = ((res.data as IDataObject[] | undefined) ?? []).filter((d) => d.url || d.b64_json);
	const urls = data.map((d) => d.url).filter((u): u is string => typeof u === 'string');
	const item: INodeExecutionData = {
		json: { urls, url: urls[0], usage: res.usage, created: res.created },
		pairedItem: { item: i },
	};
	if (this.getNodeParameter('download', i) as boolean) {
		const field = this.getNodeParameter('binaryPropertyName', i) as string;
		const binary: IBinaryKeyData = {};
		for (let k = 0; k < data.length; k++) {
			const key = k === 0 ? field : `${field}_${k}`;
			const d = data[k];
			if (typeof d.url === 'string') {
				binary[key] = await downloadBinary.call(this, d.url, `image-${k}`, 'image/png', i);
			} else if (typeof d.b64_json === 'string') {
				binary[key] = await this.helpers.prepareBinaryData(
					Buffer.from(d.b64_json, 'base64'),
					`image-${k}.png`,
					'image/png',
				);
			}
		}
		item.binary = binary;
	}
	return item;
}

async function generateVideo(this: IExecuteFunctions, i: number): Promise<INodeExecutionData> {
	const opts = this.getNodeParameter('videoOptions', i, {}) as IDataObject;
	const body: IDataObject = {
		model: modelId.call(this, i),
		prompt: this.getNodeParameter('prompt', i) as string,
	};
	const imageUrl = (this.getNodeParameter('imageUrl', i, '') as string).trim();
	if (imageUrl) body.image_url = imageUrl;
	const duration = this.getNodeParameter('durationSeconds', i, 0) as number;
	if (duration > 0) body.duration_seconds = duration;
	const resolution = (this.getNodeParameter('resolution', i, '') as string).trim();
	if (resolution) body.resolution = resolution;
	const audio = this.getNodeParameter('audio', i, 'off') as string;
	if (audio !== 'default') body.audio = audio === 'on';
	if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
	if (opts.endImageUrl) body.end_image_url = opts.endImageUrl;
	if (opts.callbackUrl) body.callback_url = opts.callbackUrl;
	if (typeof opts.maxCost === 'number' && opts.maxCost > 0) body.max_cost = opts.maxCost;
	if (typeof opts.fallbackModels === 'string' && opts.fallbackModels.trim()) {
		body.models = opts.fallbackModels
			.split(',')
			.map((m) => m.trim())
			.filter(Boolean);
	}
	if (opts.validate) body.validate = true;
	const headers: IDataObject = {};
	if (typeof opts.idempotencyKey === 'string' && opts.idempotencyKey.trim()) {
		headers['Idempotency-Key'] = opts.idempotencyKey.trim();
	}

	let job = await apiRequest.call(this, 'POST', '/v1/video/generations', body, headers, i);
	if (opts.validate || !(this.getNodeParameter('wait', i) as boolean) || !job.id) {
		return { json: job, pairedItem: { item: i } };
	}

	const intervalMs = Math.max(3, this.getNodeParameter('pollInterval', i, 10) as number) * 1000;
	const deadline =
		Date.now() + Math.max(1, this.getNodeParameter('timeoutMinutes', i, 15) as number) * 60_000;
	const path = `/v1/video/generations/${encodeURIComponent(String(job.id))}`;
	// The exact charge arrives a little after the file (usually within 30 s);
	// wait up to 45 s more for it so the item carries the real cost.
	let costWaitUntil = 0;
	while (Date.now() < deadline) {
		const status = String(job.status ?? '');
		if (TERMINAL.includes(status)) {
			const usage = (job.usage ?? {}) as IDataObject;
			if (status !== 'succeeded' || !usage.cost_pending) break;
			if (costWaitUntil === 0) costWaitUntil = Date.now() + 45_000;
			if (Date.now() >= costWaitUntil) break;
			await sleep(5000);
		} else {
			await sleep(intervalMs);
		}
		job = await apiRequest.call(this, 'GET', path, undefined, undefined, i);
	}
	if (job.status === 'failed') {
		const err = (job.error ?? {}) as IDataObject;
		throw new NodeOperationError(
			this.getNode(),
			`The video job failed: ${err.message ?? 'no reason given'}. Failed jobs are not charged.`,
			{ itemIndex: i, description: `Job ID: ${job.id}` },
		);
	}
	return await jobItem.call(this, job, i);
}

async function jobItem(
	this: IExecuteFunctions,
	job: IDataObject,
	i: number,
): Promise<INodeExecutionData> {
	const results = (job.results as IDataObject[] | undefined) ?? [];
	const urls = results.map((r) => r.url).filter((u): u is string => typeof u === 'string');
	const json: IDataObject = { ...job };
	if (urls.length) json.video_url = urls[0];
	const item: INodeExecutionData = { json, pairedItem: { item: i } };
	if (
		job.status === 'succeeded' &&
		urls.length &&
		(this.getNodeParameter('download', i, false) as boolean)
	) {
		const field = this.getNodeParameter('binaryPropertyName', i, 'data') as string;
		const binary: IBinaryKeyData = {};
		for (let k = 0; k < results.length; k++) {
			const r = results[k];
			if (typeof r.url !== 'string') continue;
			const fallback = typeof r.content_type === 'string' ? r.content_type : 'video/mp4';
			binary[k === 0 ? field : `${field}_${k}`] = await downloadBinary.call(
				this,
				r.url,
				`video-${job.id}${results.length > 1 ? `-${k}` : ''}`,
				fallback,
				i,
			);
		}
		item.binary = binary;
	}
	return item;
}
